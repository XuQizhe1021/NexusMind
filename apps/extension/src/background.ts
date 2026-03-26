import { OpenAiChatClient } from "@nexusmind/ai/provider";
import { decryptApiKey, encryptApiKey, parseSettings, saveSettingsPayloadSchema } from "@nexusmind/core";
import type { NexusMindSettings } from "@nexusmind/core";
import type { GraphQaEvidenceSource } from "@nexusmind/graph";
import { NexusMindGraphService } from "@nexusmind/graph";
import type { BackgroundMessage, BackgroundResponse } from "./messages";

const SETTINGS_KEY = "nexusmind_settings";
const graphService = new NexusMindGraphService();

interface GraphAskStartMessage {
  type: "NEXUSMIND_GRAPH_ASK_START";
  payload: {
    requestId: string;
    question: string;
    pageText: string;
  };
}

interface GraphAskCancelMessage {
  type: "NEXUSMIND_GRAPH_ASK_CANCEL";
  payload: {
    requestId: string;
  };
}

type GraphAskPortMessage = GraphAskStartMessage | GraphAskCancelMessage;

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
    rewrite: payload.rewrite,
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

async function createOpenAiClient(): Promise<OpenAiChatClient> {
  const settings = await getStoredSettings();
  if (!settings.encryptedApiKey || !settings.apiKeyIv || !settings.apiKeySalt) {
    throw new Error("请先在设置中保存 API Key");
  }
  if (settings.provider !== "openai") {
    throw new Error("Phase 4 当前仅支持 OpenAI Provider");
  }
  const apiKey = await decryptApiKey(
    settings.encryptedApiKey,
    settings.apiKeyIv,
    settings.apiKeySalt,
    chrome.runtime.id
  );
  return new OpenAiChatClient(apiKey, settings.model);
}

async function runGraphAsk(params: {
  question: string;
  pageText: string;
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}): Promise<{ answer: string; sources: GraphQaEvidenceSource[] }> {
  const evidence = await graphService.buildQaEvidence(params.question);
  const client = await createOpenAiClient();
  const answer = await client.streamAnswer(
    {
      question: params.question,
      pageText: params.pageText.slice(0, 16000),
      evidence: evidence.sources.map((item, index) => ({
        id: `S${index + 1}`,
        title: item.title,
        url: item.url,
        snippet: item.snippet
      }))
    },
    {
      signal: params.signal,
      onDelta: params.onDelta
    }
  );
  return {
    answer,
    sources: evidence.sources
  };
}

async function indexPage(
  message: Extract<BackgroundMessage, { type: "NEXUSMIND_INDEX_PAGE" }>
): Promise<{ pageId: string; entityCount: number; relationCount: number }> {
  // 图谱索引仅在用户明确点击“收录当前页”时触发，遵循用户触发原则。
  return graphService.ingestPage({
    url: message.payload.url,
    title: message.payload.title,
    pageText: message.payload.pageText.slice(0, 40000)
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
      if (message.type === "NEXUSMIND_INDEX_PAGE") {
        const indexed = await indexPage(message);
        return { ok: true, data: indexed };
      }
      if (message.type === "NEXUSMIND_GRAPH_SEARCH") {
        const result = await graphService.search(message.payload.query);
        return { ok: true, data: result };
      }
      if (message.type === "NEXUSMIND_GRAPH_STATS") {
        const stats = await graphService.getStats();
        return { ok: true, data: stats };
      }
      if (message.type === "NEXUSMIND_GRAPH_CLEAR") {
        await graphService.clearAll();
        return { ok: true, data: { cleared: true } };
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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nexusmind-qa-stream") {
    return;
  }
  const runningRequests = new Map<string, AbortController>();
  port.onMessage.addListener((message: GraphAskPortMessage) => {
    if (message.type === "NEXUSMIND_GRAPH_ASK_CANCEL") {
      const controller = runningRequests.get(message.payload.requestId);
      controller?.abort();
      return;
    }
    if (message.type !== "NEXUSMIND_GRAPH_ASK_START") {
      return;
    }
    const requestId = message.payload.requestId;
    runningRequests.get(requestId)?.abort();
    const controller = new AbortController();
    runningRequests.set(requestId, controller);
    runGraphAsk({
      question: message.payload.question,
      pageText: message.payload.pageText,
      signal: controller.signal,
      onDelta: (chunk) => {
        port.postMessage({
          type: "NEXUSMIND_GRAPH_ASK_DELTA",
          payload: { requestId, chunk }
        });
      }
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        port.postMessage({
          type: "NEXUSMIND_GRAPH_ASK_COMPLETE",
          payload: {
            requestId,
            answer: result.answer,
            sources: result.sources
          }
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          port.postMessage({
            type: "NEXUSMIND_GRAPH_ASK_CANCELLED",
            payload: { requestId }
          });
          return;
        }
        const messageText = error instanceof Error ? error.message : "图谱问答失败";
        port.postMessage({
          type: "NEXUSMIND_GRAPH_ASK_ERROR",
          payload: { requestId, error: messageText }
        });
      })
      .finally(() => {
        runningRequests.delete(requestId);
      });
  });
  port.onDisconnect.addListener(() => {
    for (const controller of runningRequests.values()) {
      controller.abort();
    }
    runningRequests.clear();
  });
});
