import { OpenAiChatClient } from "@nexusmind/ai/provider";
import {
  checkInvokeAccess,
  consumeInvokeQuota,
  createInitialBillingState,
  parseBillingState,
  processRefund,
  purchaseOveragePack,
  requestCancelSubscription,
  requestRiskManualReview,
  verifySubscriptionToken
} from "@nexusmind/billing";
import type { BillingState } from "@nexusmind/billing";
import { decryptApiKey, encryptApiKey, parseSettings, saveSettingsPayloadSchema } from "@nexusmind/core";
import type { NexusMindSettings } from "@nexusmind/core";
import type { GraphQaEvidenceSource } from "@nexusmind/graph";
import { NexusMindGraphService } from "@nexusmind/graph";
import { z } from "zod";
import type { BackgroundMessage, BackgroundResponse } from "./messages";

const SETTINGS_KEY = "nexusmind_settings";
const BILLING_KEY = "nexusmind_billing_state";
const STREAM_MONITOR_KEY = "nexusmind_stream_monitor";
const graphService = new NexusMindGraphService();
const STREAM_RETRY_LIMIT = 2;

const riskReviewPayloadSchema = z.object({
  note: z.string().min(0).max(200)
});

const streamMonitorSchema = z.object({
  total: z.number().int().nonnegative().default(0),
  success: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  retried: z.number().int().nonnegative().default(0),
  reconnectRecovered: z.number().int().nonnegative().default(0),
  lastError: z.string().max(300).nullable().default(null),
  updatedAt: z.number().int().nonnegative().default(0)
});

type StreamMonitor = z.infer<typeof streamMonitorSchema>;

const subscriptionVerifyPayloadSchema = z.object({
  token: z.string().min(1).max(200)
});
const topupPayloadSchema = z.object({
  orderId: z.string().min(1).max(120),
  packCalls: z.number().int().positive().max(100000)
});
const refundPayloadSchema = z.object({
  refundId: z.string().min(1).max(120)
});

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

async function getStoredBillingState(): Promise<BillingState> {
  const result = await chrome.storage.local.get(BILLING_KEY);
  return parseBillingState(result[BILLING_KEY]);
}

async function saveBillingState(state: BillingState): Promise<void> {
  await chrome.storage.local.set({ [BILLING_KEY]: state });
}

async function getStreamMonitor(): Promise<StreamMonitor> {
  const result = await chrome.storage.local.get(STREAM_MONITOR_KEY);
  const parsed = streamMonitorSchema.safeParse(result[STREAM_MONITOR_KEY]);
  if (!parsed.success) {
    return streamMonitorSchema.parse({});
  }
  return parsed.data;
}

async function saveStreamMonitor(state: StreamMonitor): Promise<void> {
  await chrome.storage.local.set({ [STREAM_MONITOR_KEY]: state });
}

async function updateStreamMonitor(
  updater: (state: StreamMonitor) => StreamMonitor
): Promise<StreamMonitor> {
  const current = await getStreamMonitor();
  const next = updater(current);
  await saveStreamMonitor(next);
  return next;
}

function toBillingResponse(state: BillingState): {
  plan: BillingState["plan"];
  subscriptionStatus: BillingState["subscriptionStatus"];
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  overagePackRemaining: number;
  cancelAtPeriodEnd: boolean;
  riskBlocked: boolean;
  riskLevel: BillingState["risk"]["level"];
  riskReason: string | null;
  riskReviewRequired: boolean;
  riskWhitelisted: boolean;
  currentPeriodMonth: string;
  purchaseUrl: string;
  reviewUrl: string;
  latestAuditLogs: BillingState["auditLogs"];
} {
  return {
    plan: state.plan,
    subscriptionStatus: state.subscriptionStatus,
    monthlyLimit: state.monthlyLimit,
    monthlyUsed: state.monthlyUsed,
    monthlyRemaining: Math.max(state.monthlyLimit - state.monthlyUsed, 0),
    overagePackRemaining: state.overagePackRemaining,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    riskBlocked: state.risk.blocked,
    riskLevel: state.risk.level,
    riskReason: state.risk.reason,
    riskReviewRequired: state.risk.reviewRequired,
    riskWhitelisted: state.risk.whitelist,
    currentPeriodMonth: state.currentPeriodMonth,
    purchaseUrl: "https://nexusmind.app/billing/topup",
    reviewUrl: "https://nexusmind.app/billing/risk-review",
    latestAuditLogs: state.auditLogs.slice(-10)
  };
}

async function getOrCreateBillingState(): Promise<BillingState> {
  const state = await getStoredBillingState();
  if (state.auditLogs.length === 0 && state.currentPeriodMonth === createInitialBillingState().currentPeriodMonth) {
    return state;
  }
  return state;
}

async function verifyInvokePermission(): Promise<void> {
  const state = await getOrCreateBillingState();
  // 所有问答入口统一先做权限门控，保证免费/订阅双轨行为一致，避免漏校验。
  const checked = checkInvokeAccess(state);
  await saveBillingState(checked.state);
  if (!checked.decision.allowed) {
    const buyHint = checked.decision.requiresTopUp ? " 你可在“商业化（Phase 5）”中购买增量包。" : "";
    throw new Error(`${checked.decision.reason}${buyHint}`);
  }
}

async function consumeInvokeUsage(requestId: string): Promise<void> {
  const state = await getOrCreateBillingState();
  // 计量在“会话成功后”再扣减，避免用户中断或请求失败时被误计费。
  const consumed = consumeInvokeQuota(state, Date.now(), { requestId });
  await saveBillingState(consumed);
}

async function askCurrentPage(
  message: Extract<BackgroundMessage, { type: "NEXUSMIND_ASK" }>
): Promise<string> {
  await verifyInvokePermission();
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
  const answer = await client.answer({
    question: message.payload.question,
    pageText: message.payload.pageText.slice(0, 30000)
  });
  await consumeInvokeUsage(`ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return answer;
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

function isRetryableGraphAskError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  if (error.name === "AbortError") {
    return false;
  }
  const text = error.message.toLowerCase();
  if (text.includes("api key") || text.includes("权限") || text.includes("token")) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function buildStabilityDashboard() {
  const [billingState, streamMonitor] = await Promise.all([getOrCreateBillingState(), getStreamMonitor()]);
  return {
    stream: streamMonitor,
    billing: {
      riskLevel: billingState.risk.level,
      riskBlocked: billingState.risk.blocked,
      reviewRequired: billingState.risk.reviewRequired,
      whitelist: billingState.risk.whitelist
    },
    gate: {
      rewriteLatencyTargetMs: 1000,
      graphSearchTargetNodes: 2000
    },
    updatedAt: Date.now()
  };
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
      if (message.type === "NEXUSMIND_BILLING_STATUS") {
        const state = await getOrCreateBillingState();
        return { ok: true, data: toBillingResponse(state) };
      }
      if (message.type === "NEXUSMIND_SUBSCRIPTION_VERIFY") {
        const state = await getOrCreateBillingState();
        const payload = subscriptionVerifyPayloadSchema.parse(message.payload);
        const verified = await verifySubscriptionToken(state, payload.token.trim());
        await saveBillingState(verified);
        return { ok: true, data: toBillingResponse(verified) };
      }
      if (message.type === "NEXUSMIND_BILLING_BUY_TOPUP") {
        const state = await getOrCreateBillingState();
        const payload = topupPayloadSchema.parse(message.payload);
        const updated = purchaseOveragePack(state, payload.packCalls, payload.orderId.trim());
        await saveBillingState(updated);
        return { ok: true, data: toBillingResponse(updated) };
      }
      if (message.type === "NEXUSMIND_BILLING_CANCEL") {
        const state = await getOrCreateBillingState();
        const updated = requestCancelSubscription(state);
        await saveBillingState(updated);
        return { ok: true, data: toBillingResponse(updated) };
      }
      if (message.type === "NEXUSMIND_BILLING_REFUND") {
        const state = await getOrCreateBillingState();
        const payload = refundPayloadSchema.parse(message.payload);
        const updated = processRefund(state, payload.refundId.trim());
        await saveBillingState(updated);
        return { ok: true, data: toBillingResponse(updated) };
      }
      if (message.type === "NEXUSMIND_BILLING_RISK_REVIEW") {
        const state = await getOrCreateBillingState();
        const payload = riskReviewPayloadSchema.parse(message.payload);
        const reviewed = requestRiskManualReview(state, payload.note);
        await saveBillingState(reviewed.state);
        return { ok: true, data: { ...toBillingResponse(reviewed.state), reviewTicketId: reviewed.ticketId } };
      }
      if (message.type === "NEXUSMIND_STABILITY_DASHBOARD") {
        const dashboard = await buildStabilityDashboard();
        return { ok: true, data: dashboard };
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
    void (async () => {
      try {
        await verifyInvokePermission();
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "权限校验失败";
        runningRequests.delete(requestId);
        port.postMessage({
          type: "NEXUSMIND_GRAPH_ASK_ERROR",
          payload: { requestId, error: messageText }
        });
        return;
      }
      void updateStreamMonitor((monitor) => ({
        ...monitor,
        total: monitor.total + 1,
        updatedAt: Date.now()
      }));
      let attempt = 0;
      let answerSent = false;
      while (attempt < STREAM_RETRY_LIMIT && !controller.signal.aborted) {
        try {
          if (attempt > 0) {
            port.postMessage({
              type: "NEXUSMIND_GRAPH_ASK_RETRYING",
              payload: { requestId, attempt, maxAttempts: STREAM_RETRY_LIMIT }
            });
            await updateStreamMonitor((monitor) => ({
              ...monitor,
              retried: monitor.retried + 1,
              updatedAt: Date.now()
            }));
            await sleep(500 * attempt);
          }
          const result = await runGraphAsk({
            question: message.payload.question,
            pageText: message.payload.pageText,
            signal: controller.signal,
            onDelta: (chunk) => {
              port.postMessage({
                type: "NEXUSMIND_GRAPH_ASK_DELTA",
                payload: { requestId, chunk }
              });
            }
          });
          if (controller.signal.aborted) {
            break;
          }
          await consumeInvokeUsage(requestId);
          port.postMessage({
            type: "NEXUSMIND_GRAPH_ASK_COMPLETE",
            payload: {
              requestId,
              answer: result.answer,
              sources: result.sources
            }
          });
          answerSent = true;
          await updateStreamMonitor((monitor) => ({
            ...monitor,
            success: monitor.success + 1,
            reconnectRecovered: attempt > 0 ? monitor.reconnectRecovered + 1 : monitor.reconnectRecovered,
            updatedAt: Date.now()
          }));
          break;
        } catch (error: unknown) {
          if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            port.postMessage({
              type: "NEXUSMIND_GRAPH_ASK_CANCELLED",
              payload: { requestId }
            });
            break;
          }
          if (attempt < STREAM_RETRY_LIMIT - 1 && isRetryableGraphAskError(error)) {
            attempt += 1;
            continue;
          }
          const messageText = error instanceof Error ? error.message : "图谱问答失败";
          await updateStreamMonitor((monitor) => ({
            ...monitor,
            failed: monitor.failed + 1,
            lastError: messageText.slice(0, 300),
            updatedAt: Date.now()
          }));
          port.postMessage({
            type: "NEXUSMIND_GRAPH_ASK_ERROR",
            payload: { requestId, error: messageText }
          });
          break;
        }
      }
      if (!answerSent && !controller.signal.aborted && attempt >= STREAM_RETRY_LIMIT) {
        await updateStreamMonitor((monitor) => ({
          ...monitor,
          failed: monitor.failed + 1,
          lastError: "达到最大重连次数",
          updatedAt: Date.now()
        }));
      }
      runningRequests.delete(requestId);
    })();
  });
  port.onDisconnect.addListener(() => {
    for (const controller of runningRequests.values()) {
      controller.abort();
    }
    runningRequests.clear();
  });
});
