import type { NexusMindSettings } from "@nexusmind/core";
import type { BackgroundMessage, BackgroundResponse } from "./messages";

const questionInput = document.querySelector<HTMLTextAreaElement>("#questionInput");
const askBtn = document.querySelector<HTMLButtonElement>("#askBtn");
const answerOutput = document.querySelector<HTMLElement>("#answerOutput");

const providerInput = document.querySelector<HTMLSelectElement>("#providerInput");
const modelInput = document.querySelector<HTMLInputElement>("#modelInput");
const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKeyInput");
const privacyModeInput = document.querySelector<HTMLSelectElement>("#privacyModeInput");
const dailyLimitInput = document.querySelector<HTMLInputElement>("#dailyLimitInput");
const monthlyLimitInput = document.querySelector<HTMLInputElement>("#monthlyLimitInput");
const saveBtn = document.querySelector<HTMLButtonElement>("#saveBtn");
const saveStatus = document.querySelector<HTMLElement>("#saveStatus");

function ensureElement<T>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`缺少元素: ${name}`);
  }
  return element;
}

async function sendToBackground<T>(message: BackgroundMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as BackgroundResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data as T;
}

async function getCurrentPageText(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("无法定位当前页面");
  }
  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: "NEXUSMIND_GET_PAGE_TEXT"
  })) as { ok: boolean; data?: { pageText: string } };
  if (!response?.ok || !response.data?.pageText) {
    throw new Error("当前页面文本提取失败");
  }
  return response.data.pageText;
}

async function onAsk(): Promise<void> {
  const question = ensureElement(questionInput, "questionInput").value.trim();
  if (!question) {
    throw new Error("请输入问题");
  }
  ensureElement(answerOutput, "answerOutput").textContent = "思考中...";

  const pageText = await getCurrentPageText();
  const data = await sendToBackground<{ answer: string }>({
    type: "NEXUSMIND_ASK",
    payload: { question, pageText }
  });
  ensureElement(answerOutput, "answerOutput").textContent = data.answer;
}

function parseIntInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function onSaveSettings(): Promise<void> {
  const provider = ensureElement(providerInput, "providerInput").value as "openai" | "claude" | "gemini";
  const model = ensureElement(modelInput, "modelInput").value.trim();
  const apiKey = ensureElement(apiKeyInput, "apiKeyInput").value.trim();
  const privacyMode = ensureElement(privacyModeInput, "privacyModeInput").value as "strict" | "balanced";

  if (!model) {
    throw new Error("模型不能为空");
  }
  if (!apiKey) {
    throw new Error("API Key 不能为空");
  }

  await sendToBackground({
    type: "NEXUSMIND_SAVE_SETTINGS",
    payload: {
      provider,
      model,
      apiKey,
      privacyMode,
      dailyLimit: parseIntInput(ensureElement(dailyLimitInput, "dailyLimitInput"), 200),
      monthlyLimit: parseIntInput(ensureElement(monthlyLimitInput, "monthlyLimitInput"), 5000)
    }
  });
  ensureElement(saveStatus, "saveStatus").textContent = "设置已保存";
}

async function loadSettings(): Promise<void> {
  const settings = await sendToBackground<NexusMindSettings>({
    type: "NEXUSMIND_GET_SETTINGS"
  });
  ensureElement(providerInput, "providerInput").value = settings.provider;
  ensureElement(modelInput, "modelInput").value = settings.model;
  ensureElement(privacyModeInput, "privacyModeInput").value = settings.privacyMode;
  ensureElement(dailyLimitInput, "dailyLimitInput").value = String(settings.costControl.dailyLimit);
  ensureElement(monthlyLimitInput, "monthlyLimitInput").value = String(settings.costControl.monthlyLimit);
}

ensureElement(askBtn, "askBtn").addEventListener("click", () => {
  onAsk().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "提问失败";
    ensureElement(answerOutput, "answerOutput").textContent = `错误：${message}`;
  });
});

ensureElement(saveBtn, "saveBtn").addEventListener("click", () => {
  onSaveSettings().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "保存失败";
    ensureElement(saveStatus, "saveStatus").textContent = `错误：${message}`;
  });
});

loadSettings().catch(() => undefined);
