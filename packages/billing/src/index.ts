import { z } from "zod";

export type BillingPlan = "free" | "subscription";
export type SubscriptionStatus = "inactive" | "active" | "canceled" | "refunded";
export type BillingAction =
  | "subscription_verified"
  | "invoke_allowed"
  | "invoke_blocked"
  | "usage_consumed"
  | "usage_deduplicated"
  | "topup_purchased"
  | "cancel_requested"
  | "refund_processed"
  | "risk_degraded"
  | "risk_blocked"
  | "risk_review_requested";

export interface UsageQuota {
  monthlyLimit: number;
  monthlyUsed: number;
}

export interface BillingAuditLog {
  id: string;
  action: BillingAction;
  at: number;
  message: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface BillingRiskState {
  blocked: boolean;
  level: "none" | "degraded" | "blocked";
  reason: string | null;
  reviewRequired: boolean;
  whitelist: boolean;
}

export interface BillingState {
  plan: BillingPlan;
  subscriptionStatus: SubscriptionStatus;
  monthlyLimit: number;
  monthlyUsed: number;
  overagePackRemaining: number;
  currentPeriodMonth: string;
  cancelAtPeriodEnd: boolean;
  risk: BillingRiskState;
  auditLogs: BillingAuditLog[];
  usageTimeline: number[];
  consumedRequestIds: string[];
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  monthlyRemaining: number;
  overagePackRemaining: number;
  requiresTopUp: boolean;
  degraded: boolean;
  manualReviewRequired: boolean;
}

export const MONTHLY_LIMIT_SUBSCRIPTION = 500;
const USAGE_TIMELINE_LIMIT = 60;
const AUDIT_LOG_LIMIT = 200;
const CONSUMED_REQUEST_ID_LIMIT = 200;
const RISK_DEGRADED_THRESHOLD = 12;
const RISK_BLOCK_THRESHOLD = 20;

const billingStateSchema = z.object({
  plan: z.enum(["free", "subscription"]),
  subscriptionStatus: z.enum(["inactive", "active", "canceled", "refunded"]),
  monthlyLimit: z.number().int().min(0).max(100000),
  monthlyUsed: z.number().int().min(0).max(1000000),
  overagePackRemaining: z.number().int().min(0).max(1000000),
  currentPeriodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  cancelAtPeriodEnd: z.boolean(),
  risk: z.object({
    blocked: z.boolean(),
    level: z.enum(["none", "degraded", "blocked"]).default("none"),
    reason: z.string().nullable(),
    reviewRequired: z.boolean().default(false),
    whitelist: z.boolean().default(false)
  }),
  auditLogs: z
    .array(
      z.object({
        id: z.string().min(1),
        action: z.enum([
          "subscription_verified",
          "invoke_allowed",
          "invoke_blocked",
          "usage_consumed",
          "usage_deduplicated",
          "topup_purchased",
          "cancel_requested",
          "refund_processed",
          "risk_degraded",
          "risk_blocked",
          "risk_review_requested"
        ]),
        at: z.number().int().nonnegative(),
        message: z.string().min(1),
        metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
      })
    )
    .max(AUDIT_LOG_LIMIT)
    .default([]),
  usageTimeline: z.array(z.number().int().nonnegative()).max(USAGE_TIMELINE_LIMIT).default([]),
  consumedRequestIds: z.array(z.string().min(1)).max(CONSUMED_REQUEST_ID_LIMIT).default([])
});

function buildMonthKey(timestamp: number): string {
  const time = new Date(timestamp);
  const month = String(time.getMonth() + 1).padStart(2, "0");
  return `${time.getFullYear()}-${month}`;
}

function buildAuditLogId(timestamp: number): string {
  return `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildReviewTicketId(timestamp: number): string {
  return `rvw_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;
}

function appendAuditLog(
  state: BillingState,
  payload: {
    action: BillingAction;
    at: number;
    message: string;
    metadata?: Record<string, string | number | boolean>;
  }
): BillingState {
  const log: BillingAuditLog = {
    id: buildAuditLogId(payload.at),
    action: payload.action,
    at: payload.at,
    message: payload.message,
    metadata: payload.metadata
  };
  return {
    ...state,
    auditLogs: [...state.auditLogs, log].slice(-AUDIT_LOG_LIMIT)
  };
}

function resetMonthlyUsageIfNeeded(state: BillingState, timestamp: number): BillingState {
  const monthKey = buildMonthKey(timestamp);
  if (state.currentPeriodMonth === monthKey) {
    return state;
  }
  // 跨月时立即重置月度用量，避免旧账期额度影响新账期判定。
  return {
    ...state,
    currentPeriodMonth: monthKey,
    monthlyUsed: 0,
    usageTimeline: [],
    consumedRequestIds: []
  };
}

export function createInitialBillingState(timestamp: number = Date.now()): BillingState {
  return {
    plan: "free",
    subscriptionStatus: "inactive",
    monthlyLimit: MONTHLY_LIMIT_SUBSCRIPTION,
    monthlyUsed: 0,
    overagePackRemaining: 0,
    currentPeriodMonth: buildMonthKey(timestamp),
    cancelAtPeriodEnd: false,
    risk: {
      blocked: false,
      level: "none",
      reason: null,
      reviewRequired: false,
      whitelist: false
    },
    auditLogs: [],
    usageTimeline: [],
    consumedRequestIds: []
  };
}

export function parseBillingState(input: unknown, timestamp: number = Date.now()): BillingState {
  const parsed = billingStateSchema.safeParse(input);
  if (!parsed.success) {
    return createInitialBillingState(timestamp);
  }
  return parsed.data;
}

export function canInvoke(quota: UsageQuota): boolean {
  return quota.monthlyUsed < quota.monthlyLimit;
}

export function verifySubscriptionToken(
  state: BillingState,
  token: string,
  timestamp: number = Date.now()
): BillingState {
  const next = resetMonthlyUsageIfNeeded(state, timestamp);
  if (!token.startsWith("nm_sub_")) {
    throw new Error("订阅校验失败：Token 无效");
  }
  const updated: BillingState = {
    ...next,
    plan: "subscription",
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    risk: {
      blocked: false,
      level: "none",
      reason: null,
      reviewRequired: false,
      whitelist: token.startsWith("nm_sub_vip_")
    }
  };
  return appendAuditLog(updated, {
    action: "subscription_verified",
    at: timestamp,
    message: "订阅校验通过，已激活订阅权限",
    metadata: {
      plan: updated.plan,
      status: updated.subscriptionStatus
    }
  });
}

export function checkInvokeAccess(
  state: BillingState,
  timestamp: number = Date.now()
): { state: BillingState; decision: AccessDecision } {
  let next = resetMonthlyUsageIfNeeded(state, timestamp);
  // 门控顺序固定为：风控 > 轨道判定 > 订阅状态 > 月度额度 > 增量包。
  // 这样可以确保拦截原因稳定且可解释，避免出现同一状态下提示漂移。
  if (next.risk.blocked) {
    next = appendAuditLog(next, {
      action: "invoke_blocked",
      at: timestamp,
      message: "调用被风控拦截",
      metadata: {
        reason: next.risk.reason ?? "risk_blocked"
      }
    });
    return {
      state: next,
      decision: {
        allowed: false,
        reason: "账户已触发风控拦截，请稍后再试或联系支持",
        monthlyRemaining: Math.max(next.monthlyLimit - next.monthlyUsed, 0),
        overagePackRemaining: next.overagePackRemaining,
        requiresTopUp: false,
        degraded: false,
        manualReviewRequired: next.risk.reviewRequired
      }
    };
  }
  if (next.plan === "free") {
    next = appendAuditLog(next, {
      action: "invoke_allowed",
      at: timestamp,
      message: "免费轨道调用放行",
      metadata: {
        plan: "free"
      }
    });
    return {
      state: next,
      decision: {
        allowed: true,
        reason: "免费轨道（自备 Key）调用放行",
        monthlyRemaining: Number.POSITIVE_INFINITY,
        overagePackRemaining: 0,
        requiresTopUp: false,
        degraded: false,
        manualReviewRequired: false
      }
    };
  }
  if (next.subscriptionStatus !== "active") {
    next = appendAuditLog(next, {
      action: "invoke_blocked",
      at: timestamp,
      message: "调用被阻断：订阅未激活",
      metadata: {
        status: next.subscriptionStatus
      }
    });
    return {
      state: next,
      decision: {
        allowed: false,
        reason: "订阅未激活，请先完成订阅校验",
        monthlyRemaining: Math.max(next.monthlyLimit - next.monthlyUsed, 0),
        overagePackRemaining: next.overagePackRemaining,
        requiresTopUp: false,
        degraded: false,
        manualReviewRequired: false
      }
    };
  }
  const degraded = next.risk.level === "degraded";
  const reasonSuffix = degraded ? "（当前处于降级通道）" : "";
  if (next.monthlyUsed < next.monthlyLimit) {
    next = appendAuditLog(next, {
      action: "invoke_allowed",
      at: timestamp,
      message: "订阅额度内调用放行",
      metadata: {
        monthlyUsed: next.monthlyUsed,
        monthlyLimit: next.monthlyLimit
      }
    });
    return {
      state: next,
      decision: {
        allowed: true,
        reason: `订阅额度内可调用${reasonSuffix}`,
        monthlyRemaining: next.monthlyLimit - next.monthlyUsed,
        overagePackRemaining: next.overagePackRemaining,
        requiresTopUp: false,
        degraded,
        manualReviewRequired: false
      }
    };
  }
  if (next.overagePackRemaining > 0) {
    next = appendAuditLog(next, {
      action: "invoke_allowed",
      at: timestamp,
      message: "订阅超额后走增量包调用",
      metadata: {
        overagePackRemaining: next.overagePackRemaining
      }
    });
    return {
      state: next,
      decision: {
        allowed: true,
        reason: `将使用增量包额度${reasonSuffix}`,
        monthlyRemaining: 0,
        overagePackRemaining: next.overagePackRemaining,
        requiresTopUp: false,
        degraded,
        manualReviewRequired: false
      }
    };
  }
  next = appendAuditLog(next, {
    action: "invoke_blocked",
    at: timestamp,
    message: "调用被阻断：订阅额度耗尽且无增量包",
    metadata: {
      monthlyLimit: next.monthlyLimit
    }
  });
  return {
    state: next,
    decision: {
      allowed: false,
      reason: "本月 500 次订阅额度已用尽，请购买增量包后继续",
      monthlyRemaining: 0,
      overagePackRemaining: 0,
      requiresTopUp: true,
      degraded: false,
      manualReviewRequired: false
    }
  };
}

export function consumeInvokeQuota(
  state: BillingState,
  timestamp: number = Date.now(),
  options?: {
    requestId?: string;
  }
): BillingState {
  let next = resetMonthlyUsageIfNeeded(state, timestamp);
  const requestId = options?.requestId?.trim();
  if (requestId && next.consumedRequestIds.includes(requestId)) {
    return appendAuditLog(next, {
      action: "usage_deduplicated",
      at: timestamp,
      message: "重复请求已去重，未重复扣减",
      metadata: {
        requestId
      }
    });
  }
  const timeline = [...next.usageTimeline, timestamp].slice(-USAGE_TIMELINE_LIMIT);
  next = {
    ...next,
    usageTimeline: timeline,
    consumedRequestIds: requestId
      ? [...next.consumedRequestIds, requestId].slice(-CONSUMED_REQUEST_ID_LIMIT)
      : next.consumedRequestIds
  };
  if (next.plan === "subscription" && next.subscriptionStatus === "active") {
    if (next.monthlyUsed < next.monthlyLimit) {
      next = {
        ...next,
        monthlyUsed: next.monthlyUsed + 1
      };
    } else if (next.overagePackRemaining > 0) {
      next = {
        ...next,
        overagePackRemaining: next.overagePackRemaining - 1
      };
    } else {
      throw new Error("调用扣减失败：额度不足");
    }
  }
  const oneMinuteAgo = timestamp - 60_000;
  const recentCalls = next.usageTimeline.filter((item) => item >= oneMinuteAgo).length;
  if (!next.risk.whitelist && recentCalls >= RISK_BLOCK_THRESHOLD) {
    // 先采用本地轻量风控阈值兜底，避免异常高频调用持续放大成本。
    next = {
      ...next,
      risk: {
        blocked: true,
        level: "blocked",
        reason: "一分钟内调用次数异常",
        reviewRequired: true,
        whitelist: false
      }
    };
    next = appendAuditLog(next, {
      action: "risk_blocked",
      at: timestamp,
      message: "触发风控拦截：一分钟内调用次数异常",
      metadata: {
        recentCalls
      }
    });
  } else if (!next.risk.whitelist && recentCalls >= RISK_DEGRADED_THRESHOLD) {
    next = {
      ...next,
      risk: {
        blocked: false,
        level: "degraded",
        reason: "一分钟内调用频率偏高，已进入降级通道",
        reviewRequired: false,
        whitelist: false
      }
    };
    next = appendAuditLog(next, {
      action: "risk_degraded",
      at: timestamp,
      message: "触发风控降级：一分钟内调用频率偏高",
      metadata: {
        recentCalls
      }
    });
  } else if (!next.risk.blocked) {
    next = {
      ...next,
      risk: {
        blocked: false,
        level: "none",
        reason: null,
        reviewRequired: false,
        whitelist: next.risk.whitelist
      }
    };
  }
  return appendAuditLog(next, {
    action: "usage_consumed",
    at: timestamp,
    message: "调用计量成功",
    metadata: {
      monthlyUsed: next.monthlyUsed,
      monthlyLimit: next.monthlyLimit,
      overagePackRemaining: next.overagePackRemaining
    }
  });
}

export function purchaseOveragePack(
  state: BillingState,
  packCalls: number,
  orderId: string,
  timestamp: number = Date.now()
): BillingState {
  const next = resetMonthlyUsageIfNeeded(state, timestamp);
  if (next.plan !== "subscription" || next.subscriptionStatus !== "active") {
    throw new Error("仅激活订阅后可购买增量包");
  }
  if (!Number.isInteger(packCalls) || packCalls <= 0) {
    throw new Error("增量包额度必须为正整数");
  }
  if (!orderId.trim()) {
    throw new Error("订单号不能为空");
  }
  const updated: BillingState = {
    ...next,
    overagePackRemaining: next.overagePackRemaining + packCalls
  };
  return appendAuditLog(updated, {
    action: "topup_purchased",
    at: timestamp,
    message: "增量包购买成功",
    metadata: {
      orderId,
      packCalls,
      overagePackRemaining: updated.overagePackRemaining
    }
  });
}

export function requestCancelSubscription(state: BillingState, timestamp: number = Date.now()): BillingState {
  if (state.plan !== "subscription" || state.subscriptionStatus !== "active") {
    throw new Error("当前没有可取消的有效订阅");
  }
  const updated: BillingState = {
    ...state,
    cancelAtPeriodEnd: true
  };
  return appendAuditLog(updated, {
    action: "cancel_requested",
    at: timestamp,
    message: "已提交取消订阅请求，当前周期结束后生效"
  });
}

export function requestRiskManualReview(
  state: BillingState,
  note: string,
  timestamp: number = Date.now()
): { state: BillingState; ticketId: string } {
  const ticketId = buildReviewTicketId(timestamp);
  const normalized = note.trim().slice(0, 200);
  const updated: BillingState = {
    ...state,
    risk: {
      ...state.risk,
      reviewRequired: true,
      reason: state.risk.reason ?? "已提交人工复核"
    }
  };
  return {
    state: appendAuditLog(updated, {
      action: "risk_review_requested",
      at: timestamp,
      message: "已提交人工复核请求",
      metadata: {
        ticketId,
        note: normalized || "未填写备注"
      }
    }),
    ticketId
  };
}

export function processRefund(
  state: BillingState,
  refundId: string,
  timestamp: number = Date.now()
): BillingState {
  if (!refundId.trim()) {
    throw new Error("退款单号不能为空");
  }
  const updated: BillingState = {
    ...state,
    plan: "free",
    subscriptionStatus: "refunded",
    overagePackRemaining: 0,
    cancelAtPeriodEnd: false
  };
  return appendAuditLog(updated, {
    action: "refund_processed",
    at: timestamp,
    message: "退款已处理，订阅权益已回收",
    metadata: {
      refundId
    }
  });
}
