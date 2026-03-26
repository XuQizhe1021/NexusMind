import { normalizeHostname, resolveRewriteIntent, upsertSiteIntentRule } from "@nexusmind/core";
import type { NexusMindSettings, RewriteIntent } from "@nexusmind/core";
import type { GraphQaEvidenceSource, GraphSearchResult } from "@nexusmind/graph";
import type { BackgroundMessage, BackgroundResponse } from "./messages";

const questionInput = document.querySelector<HTMLTextAreaElement>("#questionInput");
const askBtn = document.querySelector<HTMLButtonElement>("#askBtn");
const cancelAskBtn = document.querySelector<HTMLButtonElement>("#cancelAskBtn");
const answerOutput = document.querySelector<HTMLElement>("#answerOutput");
const answerSources = document.querySelector<HTMLElement>("#answerSources");

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
const rewriteIntentInput = document.querySelector<HTMLSelectElement>("#rewriteIntentInput");
const rewriteApplyBtn = document.querySelector<HTMLButtonElement>("#rewriteApplyBtn");
const rewriteRollbackBtn = document.querySelector<HTMLButtonElement>("#rewriteRollbackBtn");
const rewriteStatus = document.querySelector<HTMLElement>("#rewriteStatus");
const defaultIntentInput = document.querySelector<HTMLSelectElement>("#defaultIntentInput");
const saveSiteIntentBtn = document.querySelector<HTMLButtonElement>("#saveSiteIntentBtn");
const clearSiteIntentBtn = document.querySelector<HTMLButtonElement>("#clearSiteIntentBtn");
const siteIntentStatus = document.querySelector<HTMLElement>("#siteIntentStatus");
const billingSummary = document.querySelector<HTMLElement>("#billingSummary");
const billingStatus = document.querySelector<HTMLElement>("#billingStatus");
const billingAudit = document.querySelector<HTMLElement>("#billingAudit");
const subscriptionTokenInput = document.querySelector<HTMLInputElement>("#subscriptionTokenInput");
const refreshBillingBtn = document.querySelector<HTMLButtonElement>("#refreshBillingBtn");
const verifySubscriptionBtn = document.querySelector<HTMLButtonElement>("#verifySubscriptionBtn");
const topupCallsInput = document.querySelector<HTMLInputElement>("#topupCallsInput");
const topupOrderIdInput = document.querySelector<HTMLInputElement>("#topupOrderIdInput");
const buyTopupBtn = document.querySelector<HTMLButtonElement>("#buyTopupBtn");
const cancelSubscriptionBtn = document.querySelector<HTMLButtonElement>("#cancelSubscriptionBtn");
const refundSubscriptionBtn = document.querySelector<HTMLButtonElement>("#refundSubscriptionBtn");
const refundIdInput = document.querySelector<HTMLInputElement>("#refundIdInput");
const riskReviewNoteInput = document.querySelector<HTMLInputElement>("#riskReviewNoteInput");
const riskReviewBtn = document.querySelector<HTMLButtonElement>("#riskReviewBtn");
const purchaseLink = document.querySelector<HTMLAnchorElement>("#purchaseLink");
const refreshStabilityBtn = document.querySelector<HTMLButtonElement>("#refreshStabilityBtn");
const stabilityOutput = document.querySelector<HTMLElement>("#stabilityOutput");

const INTENT_LABELS: Record<RewriteIntent, string> = {
  learning: "学习模式",
  summary: "摘要模式",
  distraction_free: "去干扰模式"
};

let currentSettings: NexusMindSettings | null = null;
let qaPort: chrome.runtime.Port | null = null;
let currentAskRequestId: string | null = null;
let currentAnswerBuffer = "";
let currentAnswerSources: GraphQaEvidenceSource[] = [];

interface QaStreamMessage {
  type: string;
  payload?: {
    requestId?: string;
    chunk?: string;
    answer?: string;
    error?: string;
    sources?: GraphQaEvidenceSource[];
    attempt?: number;
    maxAttempts?: number;
  };
}

interface BillingView {
  plan: "free" | "subscription";
  subscriptionStatus: "inactive" | "active" | "canceled" | "refunded";
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  overagePackRemaining: number;
  cancelAtPeriodEnd: boolean;
  riskBlocked: boolean;
  riskLevel: "none" | "degraded" | "blocked";
  riskReason: string | null;
  riskReviewRequired: boolean;
  riskWhitelisted: boolean;
  currentPeriodMonth: string;
  purchaseUrl: string;
  reviewUrl: string;
  latestAuditLogs: Array<{
    id: string;
    action: string;
    at: number;
    message: string;
  }>;
}

interface StabilityDashboard {
  stream: {
    total: number;
    success: number;
    failed: number;
    retried: number;
    reconnectRecovered: number;
    lastError: string | null;
    updatedAt: number;
  };
  billing: {
    riskLevel: string;
    riskBlocked: boolean;
    reviewRequired: boolean;
    whitelist: boolean;
  };
  gate: {
    rewriteLatencyTargetMs: number;
    graphSearchTargetNodes: number;
  };
  updatedAt: number;
}

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

async function sendToCurrentTab<T>(message: { type: string; payload?: unknown }): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("无法定位当前页面");
  }
  const response = (await chrome.tabs.sendMessage(tab.id, message)) as BackgroundResponse;
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

async function getCurrentTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    throw new Error("无法获取当前站点");
  }
  return tab.url;
}

function buildRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderAnswerContent(answer: string, sources: GraphQaEvidenceSource[]): void {
  const output = ensureElement(answerOutput, "answerOutput");
  output.innerHTML = "";
  const citationPattern = /\[S(\d+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null = citationPattern.exec(answer);
  while (match) {
    const [fullText, indexText] = match;
    const start = match.index;
    if (start > cursor) {
      output.append(document.createTextNode(answer.slice(cursor, start)));
    }
    const sourceIndex = Number(indexText) - 1;
    const source = sources[sourceIndex];
    if (source) {
      const cite = document.createElement("button");
      cite.type = "button";
      cite.className = "source-inline-link";
      cite.textContent = fullText;
      cite.addEventListener("click", () => {
        void locateSourceInPage(source);
      });
      output.append(cite);
    } else {
      output.append(document.createTextNode(fullText));
    }
    cursor = start + fullText.length;
    match = citationPattern.exec(answer);
  }
  if (cursor < answer.length) {
    output.append(document.createTextNode(answer.slice(cursor)));
  }
}

function renderSourceList(sources: GraphQaEvidenceSource[]): void {
  const container = ensureElement(answerSources, "answerSources");
  container.innerHTML = "";
  if (sources.length === 0) {
    container.textContent = "";
    return;
  }
  for (const [index, source] of sources.entries()) {
    const card = document.createElement("article");
    card.className = "source-item";
    const title = document.createElement("h3");
    title.textContent = `[S${index + 1}] ${source.title}`;
    const snippet = document.createElement("p");
    snippet.className = "source-snippet";
    snippet.textContent = source.snippet;
    const actions = document.createElement("div");
    actions.className = "row";
    const locateBtn = document.createElement("button");
    locateBtn.type = "button";
    locateBtn.className = "secondary-btn";
    locateBtn.textContent = "定位正文";
    locateBtn.addEventListener("click", () => {
      void locateSourceInPage(source);
    });
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "secondary-btn";
    openBtn.textContent = "打开来源";
    openBtn.addEventListener("click", async () => {
      await chrome.tabs.create({ url: source.url });
    });
    actions.append(locateBtn, openBtn);
    card.append(title, snippet, actions);
    container.append(card);
  }
}

async function locateSourceInPage(source: GraphQaEvidenceSource): Promise<void> {
  await sendToCurrentTab({
    type: "NEXUSMIND_HIGHLIGHT_TEXT",
    payload: {
      snippet: source.snippet
    }
  });
}

function updateAskUiState(state: "idle" | "running"): void {
  ensureElement(askBtn, "askBtn").disabled = state === "running";
  ensureElement(cancelAskBtn, "cancelAskBtn").disabled = state !== "running";
}

function ensureQaPort(): chrome.runtime.Port {
  if (qaPort) {
    return qaPort;
  }
  qaPort = chrome.runtime.connect({ name: "nexusmind-qa-stream" });
  qaPort.onMessage.addListener((message: QaStreamMessage) => {
    const requestId = message.payload?.requestId;
    if (!requestId || requestId !== currentAskRequestId) {
      return;
    }
    if (message.type === "NEXUSMIND_GRAPH_ASK_DELTA") {
      const chunk = message.payload?.chunk ?? "";
      currentAnswerBuffer += chunk;
      renderAnswerContent(currentAnswerBuffer, currentAnswerSources);
      return;
    }
    if (message.type === "NEXUSMIND_GRAPH_ASK_COMPLETE") {
      currentAnswerBuffer = message.payload?.answer ?? currentAnswerBuffer;
      currentAnswerSources = message.payload?.sources ?? [];
      renderAnswerContent(currentAnswerBuffer, currentAnswerSources);
      renderSourceList(currentAnswerSources);
      updateAskUiState("idle");
      currentAskRequestId = null;
      return;
    }
    if (message.type === "NEXUSMIND_GRAPH_ASK_RETRYING") {
      const attempt = message.payload?.attempt ?? 1;
      const maxAttempts = message.payload?.maxAttempts ?? 2;
      currentAnswerBuffer = "";
      currentAnswerSources = [];
      ensureElement(answerOutput, "answerOutput").textContent = `连接抖动，正在重连（${attempt}/${maxAttempts}）...`;
      renderSourceList([]);
      return;
    }
    if (message.type === "NEXUSMIND_GRAPH_ASK_CANCELLED") {
      ensureElement(answerOutput, "answerOutput").textContent = "回答已中断";
      renderSourceList([]);
      updateAskUiState("idle");
      currentAskRequestId = null;
      return;
    }
    if (message.type === "NEXUSMIND_GRAPH_ASK_ERROR") {
      const errorText = message.payload?.error ?? "图谱问答失败";
      ensureElement(answerOutput, "answerOutput").textContent = `错误：${errorText}`;
      renderSourceList([]);
      updateAskUiState("idle");
      currentAskRequestId = null;
    }
  });
  qaPort.onDisconnect.addListener(() => {
    qaPort = null;
    updateAskUiState("idle");
    currentAskRequestId = null;
  });
  return qaPort;
}

async function onAsk(): Promise<void> {
  const question = ensureElement(questionInput, "questionInput").value.trim();
  if (!question) {
    throw new Error("请输入问题");
  }
  const port = ensureQaPort();
  currentAskRequestId = buildRequestId();
  currentAnswerBuffer = "";
  currentAnswerSources = [];
  ensureElement(answerOutput, "answerOutput").textContent = "正在检索图谱证据并生成答案...";
  renderSourceList([]);
  updateAskUiState("running");
  const pageText = await getCurrentPageText();
  port.postMessage({
    type: "NEXUSMIND_GRAPH_ASK_START",
    payload: {
      requestId: currentAskRequestId,
      question,
      pageText
    }
  });
}

async function onCancelAsk(): Promise<void> {
  if (!currentAskRequestId) {
    return;
  }
  ensureQaPort().postMessage({
    type: "NEXUSMIND_GRAPH_ASK_CANCEL",
    payload: {
      requestId: currentAskRequestId
    }
  });
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

function renderBillingState(state: BillingView): void {
  const summary = ensureElement(billingSummary, "billingSummary");
  const audit = ensureElement(billingAudit, "billingAudit");
  const link = ensureElement(purchaseLink, "purchaseLink");
  summary.textContent =
    `计划：${state.plan} / 订阅状态：${state.subscriptionStatus} / 月度用量：${state.monthlyUsed}/${state.monthlyLimit} / 增量包剩余：${state.overagePackRemaining}`;
  const riskText = state.riskBlocked ? `是（${state.riskReason ?? "未知原因"}）` : "否";
  const reviewText = state.riskReviewRequired ? `是（${state.reviewUrl}）` : "否";
  const whitelistText = state.riskWhitelisted ? "是" : "否";
  ensureElement(billingStatus, "billingStatus").textContent =
    `结算月：${state.currentPeriodMonth}；取消续费：${state.cancelAtPeriodEnd ? "是" : "否"}；风控级别：${state.riskLevel}；风控拦截：${riskText}；白名单：${whitelistText}；人工复核：${reviewText}`;
  link.href = state.purchaseUrl;
  link.textContent = state.purchaseUrl;
  audit.textContent =
    state.latestAuditLogs.length === 0
      ? "暂无审计日志"
      : state.latestAuditLogs
          .map((item) => `${new Date(item.at).toLocaleString()} [${item.action}] ${item.message}`)
          .join("\n");
}

async function refreshBillingState(): Promise<void> {
  const state = await sendToBackground<BillingView>({
    type: "NEXUSMIND_BILLING_STATUS"
  });
  renderBillingState(state);
}

async function onVerifySubscription(): Promise<void> {
  const token = ensureElement(subscriptionTokenInput, "subscriptionTokenInput").value.trim();
  if (!token) {
    throw new Error("请输入订阅校验 Token");
  }
  const state = await sendToBackground<BillingView>({
    type: "NEXUSMIND_SUBSCRIPTION_VERIFY",
    payload: { token }
  });
  renderBillingState(state);
  ensureElement(billingStatus, "billingStatus").textContent = "订阅校验成功，已激活 500 次月额度";
}

async function onBuyTopup(): Promise<void> {
  const orderId = ensureElement(topupOrderIdInput, "topupOrderIdInput").value.trim();
  const packCalls = parseIntInput(ensureElement(topupCallsInput, "topupCallsInput"), 100);
  if (!orderId) {
    throw new Error("请输入增量包订单号");
  }
  const state = await sendToBackground<BillingView>({
    type: "NEXUSMIND_BILLING_BUY_TOPUP",
    payload: {
      orderId,
      packCalls
    }
  });
  renderBillingState(state);
  ensureElement(billingStatus, "billingStatus").textContent = "增量包购买成功";
}

async function onCancelSubscription(): Promise<void> {
  const state = await sendToBackground<BillingView>({
    type: "NEXUSMIND_BILLING_CANCEL"
  });
  renderBillingState(state);
  ensureElement(billingStatus, "billingStatus").textContent = "已提交取消续费请求";
}

async function onRefundSubscription(): Promise<void> {
  const refundId = ensureElement(refundIdInput, "refundIdInput").value.trim();
  if (!refundId) {
    throw new Error("请输入退款单号");
  }
  const state = await sendToBackground<BillingView>({
    type: "NEXUSMIND_BILLING_REFUND",
    payload: { refundId }
  });
  renderBillingState(state);
  ensureElement(billingStatus, "billingStatus").textContent = "退款处理完成，订阅权益已回收";
}

async function onRequestRiskReview(): Promise<void> {
  const note = ensureElement(riskReviewNoteInput, "riskReviewNoteInput").value.trim();
  const state = await sendToBackground<BillingView & { reviewTicketId: string }>({
    type: "NEXUSMIND_BILLING_RISK_REVIEW",
    payload: { note }
  });
  renderBillingState(state);
  ensureElement(billingStatus, "billingStatus").textContent = `已提交人工复核，工单号 ${state.reviewTicketId}`;
}

function renderStabilityDashboard(dashboard: StabilityDashboard): void {
  ensureElement(stabilityOutput, "stabilityOutput").textContent = [
    `更新时间：${new Date(dashboard.updatedAt).toLocaleString()}`,
    `流式会话：总数 ${dashboard.stream.total} / 成功 ${dashboard.stream.success} / 失败 ${dashboard.stream.failed}`,
    `重连：触发 ${dashboard.stream.retried} / 恢复 ${dashboard.stream.reconnectRecovered}`,
    `最近错误：${dashboard.stream.lastError ?? "无"}`,
    `风控态：level=${dashboard.billing.riskLevel} blocked=${dashboard.billing.riskBlocked ? "是" : "否"} review=${dashboard.billing.reviewRequired ? "是" : "否"} whitelist=${dashboard.billing.whitelist ? "是" : "否"}`,
    `门禁目标：重写≤${dashboard.gate.rewriteLatencyTargetMs}ms；图谱规模=${dashboard.gate.graphSearchTargetNodes}节点`
  ].join("\n");
}

async function refreshStabilityDashboard(): Promise<void> {
  const dashboard = await sendToBackground<StabilityDashboard>({
    type: "NEXUSMIND_STABILITY_DASHBOARD"
  });
  renderStabilityDashboard(dashboard);
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
  if (!currentSettings) {
    throw new Error("设置尚未加载完成");
  }

  await sendToBackground({
    type: "NEXUSMIND_SAVE_SETTINGS",
    payload: {
      provider,
      model,
      apiKey,
      privacyMode,
      dailyLimit: parseIntInput(ensureElement(dailyLimitInput, "dailyLimitInput"), 200),
      monthlyLimit: parseIntInput(ensureElement(monthlyLimitInput, "monthlyLimitInput"), 5000),
      rewrite: {
        defaultIntent: ensureElement(defaultIntentInput, "defaultIntentInput").value as RewriteIntent,
        siteIntents: currentSettings.rewrite.siteIntents
      }
    }
  });
  ensureElement(saveStatus, "saveStatus").textContent = "设置已保存";
}

async function onApplyRewrite(): Promise<void> {
  const intent = ensureElement(rewriteIntentInput, "rewriteIntentInput").value as RewriteIntent;
  ensureElement(rewriteStatus, "rewriteStatus").textContent = `正在应用${INTENT_LABELS[intent]}...`;
  const data = await sendToCurrentTab<{ applied: boolean; intent: RewriteIntent; durationMs: number }>({
    type: "NEXUSMIND_REWRITE_APPLY",
    payload: {
      intent
    }
  });
  ensureElement(rewriteStatus, "rewriteStatus").textContent =
    `已应用${INTENT_LABELS[data.intent]}，耗时 ${data.durationMs.toFixed(1)}ms`;
}

async function onRollbackRewrite(): Promise<void> {
  const data = await sendToCurrentTab<{ restored: boolean; reason?: string }>({
    type: "NEXUSMIND_REWRITE_ROLLBACK"
  });
  ensureElement(rewriteStatus, "rewriteStatus").textContent = data.restored
    ? "页面已还原"
    : `未执行还原：${data.reason ?? "当前未处于重写状态"}`;
}

async function onSaveSiteIntent(): Promise<void> {
  if (!currentSettings) {
    throw new Error("设置尚未加载完成");
  }
  const url = await getCurrentTabUrl();
  const hostname = normalizeHostname(url);
  if (!hostname) {
    throw new Error("当前站点域名无效");
  }
  const intent = ensureElement(rewriteIntentInput, "rewriteIntentInput").value as RewriteIntent;
  currentSettings = {
    ...currentSettings,
    rewrite: {
      ...currentSettings.rewrite,
      siteIntents: upsertSiteIntentRule(currentSettings.rewrite.siteIntents, hostname, intent)
    }
  };
  ensureElement(siteIntentStatus, "siteIntentStatus").textContent =
    `${hostname} 已设为${INTENT_LABELS[intent]}，点击“保存设置”后生效`;
}

async function onClearSiteIntent(): Promise<void> {
  if (!currentSettings) {
    throw new Error("设置尚未加载完成");
  }
  const url = await getCurrentTabUrl();
  const hostname = normalizeHostname(url);
  if (!hostname) {
    throw new Error("当前站点域名无效");
  }
  currentSettings = {
    ...currentSettings,
    rewrite: {
      ...currentSettings.rewrite,
      siteIntents: currentSettings.rewrite.siteIntents.filter((rule) => rule.hostname !== hostname)
    }
  };
  ensureElement(siteIntentStatus, "siteIntentStatus").textContent =
    `${hostname} 的站点默认意图已清除，点击“保存设置”后生效`;
}

async function loadSettings(): Promise<void> {
  const settings = await sendToBackground<NexusMindSettings>({
    type: "NEXUSMIND_GET_SETTINGS"
  });
  currentSettings = settings;
  ensureElement(providerInput, "providerInput").value = settings.provider;
  ensureElement(modelInput, "modelInput").value = settings.model;
  ensureElement(privacyModeInput, "privacyModeInput").value = settings.privacyMode;
  ensureElement(dailyLimitInput, "dailyLimitInput").value = String(settings.costControl.dailyLimit);
  ensureElement(monthlyLimitInput, "monthlyLimitInput").value = String(settings.costControl.monthlyLimit);
  ensureElement(defaultIntentInput, "defaultIntentInput").value = settings.rewrite.defaultIntent;
  const url = await getCurrentTabUrl();
  ensureElement(rewriteIntentInput, "rewriteIntentInput").value = resolveRewriteIntent(settings, url);
}

ensureElement(askBtn, "askBtn").addEventListener("click", () => {
  onAsk().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "提问失败";
    ensureElement(answerOutput, "answerOutput").textContent = `错误：${message}`;
    updateAskUiState("idle");
  });
});

ensureElement(cancelAskBtn, "cancelAskBtn").addEventListener("click", () => {
  onCancelAsk().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "中断失败";
    ensureElement(answerOutput, "answerOutput").textContent = `错误：${message}`;
    updateAskUiState("idle");
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

ensureElement(rewriteApplyBtn, "rewriteApplyBtn").addEventListener("click", () => {
  onApplyRewrite().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "页面重写失败";
    ensureElement(rewriteStatus, "rewriteStatus").textContent = `错误：${message}`;
  });
});

ensureElement(rewriteRollbackBtn, "rewriteRollbackBtn").addEventListener("click", () => {
  onRollbackRewrite().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "页面还原失败";
    ensureElement(rewriteStatus, "rewriteStatus").textContent = `错误：${message}`;
  });
});

ensureElement(saveSiteIntentBtn, "saveSiteIntentBtn").addEventListener("click", () => {
  onSaveSiteIntent().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "站点意图保存失败";
    ensureElement(siteIntentStatus, "siteIntentStatus").textContent = `错误：${message}`;
  });
});

ensureElement(clearSiteIntentBtn, "clearSiteIntentBtn").addEventListener("click", () => {
  onClearSiteIntent().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "站点意图清除失败";
    ensureElement(siteIntentStatus, "siteIntentStatus").textContent = `错误：${message}`;
  });
});

ensureElement(refreshBillingBtn, "refreshBillingBtn").addEventListener("click", () => {
  refreshBillingState().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "刷新订阅状态失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(verifySubscriptionBtn, "verifySubscriptionBtn").addEventListener("click", () => {
  onVerifySubscription().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "订阅校验失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(buyTopupBtn, "buyTopupBtn").addEventListener("click", () => {
  onBuyTopup().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "增量包购买失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(cancelSubscriptionBtn, "cancelSubscriptionBtn").addEventListener("click", () => {
  onCancelSubscription().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "取消订阅失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(refundSubscriptionBtn, "refundSubscriptionBtn").addEventListener("click", () => {
  onRefundSubscription().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "退款处理失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(riskReviewBtn, "riskReviewBtn").addEventListener("click", () => {
  onRequestRiskReview().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "提交人工复核失败";
    ensureElement(billingStatus, "billingStatus").textContent = `错误：${message}`;
  });
});

ensureElement(refreshStabilityBtn, "refreshStabilityBtn").addEventListener("click", () => {
  refreshStabilityDashboard().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "刷新稳定性看板失败";
    ensureElement(stabilityOutput, "stabilityOutput").textContent = `错误：${message}`;
  });
});

loadSettings().catch(() => undefined);
refreshGraphStats().catch(() => undefined);
refreshBillingState().catch(() => undefined);
refreshStabilityDashboard().catch(() => undefined);
updateAskUiState("idle");
