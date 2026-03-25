import type { NexusMindSettings } from "@nexusmind/core";
import type { GraphSearchResult } from "@nexusmind/graph";
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
const indexGraphBtn = document.querySelector<HTMLButtonElement>("#indexGraphBtn");
const refreshGraphBtn = document.querySelector<HTMLButtonElement>("#refreshGraphBtn");
const graphStatus = document.querySelector<HTMLElement>("#graphStatus");
const graphStats = document.querySelector<HTMLElement>("#graphStats");
const graphSearchInput = document.querySelector<HTMLInputElement>("#graphSearchInput");
const graphSearchBtn = document.querySelector<HTMLButtonElement>("#graphSearchBtn");
const graphResultOutput = document.querySelector<HTMLElement>("#graphResultOutput");
const graphCanvas = document.querySelector<HTMLElement>("#graphCanvas");

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

async function getCurrentTabContext(): Promise<{ url: string; title: string; pageText: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("无法定位当前标签页");
  }
  const pageText = await getCurrentPageText();
  return {
    url: tab.url,
    title: tab.title ?? tab.url,
    pageText
  };
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

function renderGraph(result: GraphSearchResult): void {
  const canvas = ensureElement(graphCanvas, "graphCanvas");
  canvas.innerHTML = "";
  const matches = new Set(
    result.nodes
      .filter((node) => node.canonicalKey.includes(result.query.trim().toLowerCase()))
      .map((node) => node.id)
  );
  for (const node of result.nodes.slice(0, 40)) {
    const tag = document.createElement("span");
    tag.className = matches.has(node.id) ? "graph-node is-match" : "graph-node";
    tag.textContent = node.label;
    canvas.append(tag);
  }
}

function renderBacktrace(result: GraphSearchResult): void {
  const nodeById = new Map(result.nodes.map((node) => [node.id, node.label]));
  const lines = result.edges.slice(0, 40).map((edge) => {
    const source = nodeById.get(edge.sourceEntityId) ?? edge.sourceEntityId;
    const target = nodeById.get(edge.targetEntityId) ?? edge.targetEntityId;
    return `${source} --${edge.relationType}(${edge.weight})--> ${target}`;
  });
  ensureElement(graphResultOutput, "graphResultOutput").textContent =
    lines.length > 0 ? lines.join("\n") : "未找到可回溯关系";
}

async function refreshGraphStats(): Promise<void> {
  const stats = await sendToBackground<{ entities: number; relations: number; pages: number }>({
    type: "NEXUSMIND_GRAPH_STATS"
  });
  ensureElement(graphStats, "graphStats").textContent =
    `实体 ${stats.entities} / 关系 ${stats.relations} / 页面 ${stats.pages}`;
}

async function onIndexCurrentPage(): Promise<void> {
  ensureElement(graphStatus, "graphStatus").textContent = "正在收录当前页...";
  const context = await getCurrentTabContext();
  const indexed = await sendToBackground<{ pageId: string; entityCount: number; relationCount: number }>({
    type: "NEXUSMIND_INDEX_PAGE",
    payload: context
  });
  ensureElement(graphStatus, "graphStatus").textContent =
    `收录成功：实体 ${indexed.entityCount}，关系 ${indexed.relationCount}`;
  await refreshGraphStats();
}

async function onGraphSearch(): Promise<void> {
  const query = ensureElement(graphSearchInput, "graphSearchInput").value.trim();
  if (!query) {
    throw new Error("请输入图谱检索关键词");
  }
  // 搜索时同时返回一跳邻接关系，保证用户可以直接回看“实体如何被关联”。
  const result = await sendToBackground<GraphSearchResult>({
    type: "NEXUSMIND_GRAPH_SEARCH",
    payload: { query }
  });
  renderGraph(result);
  renderBacktrace(result);
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

ensureElement(indexGraphBtn, "indexGraphBtn").addEventListener("click", () => {
  onIndexCurrentPage().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "收录失败";
    ensureElement(graphStatus, "graphStatus").textContent = `错误：${message}`;
  });
});

ensureElement(refreshGraphBtn, "refreshGraphBtn").addEventListener("click", () => {
  refreshGraphStats().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "统计刷新失败";
    ensureElement(graphStatus, "graphStatus").textContent = `错误：${message}`;
  });
});

ensureElement(graphSearchBtn, "graphSearchBtn").addEventListener("click", () => {
  onGraphSearch().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "图谱搜索失败";
    ensureElement(graphResultOutput, "graphResultOutput").textContent = `错误：${message}`;
  });
});

loadSettings().catch(() => undefined);
refreshGraphStats().catch(() => undefined);
