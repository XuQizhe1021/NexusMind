import { OpenAiChatClient } from "@nexusmind/ai/provider";
import { decryptApiKey, encryptApiKey, parseSettings, saveSettingsPayloadSchema } from "@nexusmind/core";
import type { NexusMindSettings } from "@nexusmind/core";
import type { BackgroundMessage, BackgroundResponse } from "./messages";

const SETTINGS_KEY = "nexusmind_settings";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.create({
    id: "nexusmind-open-sidepanel",
    title: "NexusMind：打开侧边栏",
    contexts: ["page", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "nexusmind-open-sidepanel" || !tab?.id) {
    return;
  }
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-sidepanel") {
    return;
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return;
  }
  await chrome.sidePanel.open({ tabId: activeTab.id });
});

async function getStoredSettings(): Promise<NexusMindSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return parseSettings(result[SETTINGS_KEY]);
}

async function saveSettings(message: Extract<BackgroundMessage, { type: "NEXUSMIND_SAVE_SETTINGS" }>): Promise<void> {
  const payload = saveSettingsPayloadSchema.parse(message.payload);
  const encrypted = await encryptApiKey(payload.apiKey, chrome.runtime.id);
  const settings: NexusMindSettings = {
    provider: payload.provider,
    model: payload.model,
    privacyMode: payload.privacyMode,
    costControl: {
      dailyLimit: payload.dailyLimit,
      monthlyLimit: payload.monthlyLimit
    },
    encryptedApiKey: encrypted.encryptedApiKey,
    apiKeyIv: encrypted.iv,
    apiKeySalt: encrypted.salt
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function askCurrentPage(
  message: Extract<BackgroundMessage, { type: "NEXUSMIND_ASK" }>
): Promise<string> {
  // 先在后台读取并解密密钥，避免 UI 层接触明文，减少泄露面。
  const settings = await getStoredSettings();
  if (!settings.encryptedApiKey || !settings.apiKeyIv || !settings.apiKeySalt) {
    throw new Error("请先在设置中保存 API Key");
  }

  const apiKey = await decryptApiKey(
    settings.encryptedApiKey,
    settings.apiKeyIv,
    settings.apiKeySalt,
    chrome.runtime.id
  );

  if (settings.provider !== "openai") {
    throw new Error("Phase 1 仅支持 OpenAI Provider");
  }

  const client = new OpenAiChatClient(apiKey, settings.model);
  // Phase 1 先限制输入长度，避免单次请求超限导致失败。
  return client.answer({
    question: message.payload.question,
    pageText: message.payload.pageText.slice(0, 30000)
  });
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  // MV3 service worker 里必须用异步桥接返回值，否则调用方会提前超时。
  const run = async (): Promise<BackgroundResponse> => {
    try {
      if (message.type === "NEXUSMIND_GET_SETTINGS") {
        const settings = await getStoredSettings();
        return { ok: true, data: settings };
      }
      if (message.type === "NEXUSMIND_SAVE_SETTINGS") {
        await saveSettings(message);
        return { ok: true, data: { saved: true } };
      }
      if (message.type === "NEXUSMIND_ASK") {
        const answer = await askCurrentPage(message);
        return { ok: true, data: { answer } };
      }
      return { ok: false, error: "不支持的消息类型" };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "未知错误";
      return { ok: false, error: messageText };
    }
  };

  run()
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : "后台处理失败";
      sendResponse({ ok: false, error: messageText } satisfies BackgroundResponse);
    });

  return true;
});
