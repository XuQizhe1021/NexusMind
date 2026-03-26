import {
  checkInvokeAccess,
  consumeInvokeQuota,
  createInitialBillingState,
  purchaseOveragePack,
  requestCancelSubscription,
  requestRiskManualReview,
  verifySubscriptionToken,
  processRefund,
  canInvoke
} from "@nexusmind/billing";
import { describe, expect, it } from "vitest";

describe("billing quota", () => {
  it("allows invocation before limit", () => {
    expect(canInvoke({ monthlyLimit: 500, monthlyUsed: 120 })).toBe(true);
  });

  it("blocks invocation at limit", () => {
    expect(canInvoke({ monthlyLimit: 500, monthlyUsed: 500 })).toBe(false);
  });
});

describe("billing phase5 flow", () => {
  it("allows free track without subscription gate", () => {
    const state = createInitialBillingState();
    const checked = checkInvokeAccess(state);
    expect(checked.decision.allowed).toBe(true);
    expect(checked.decision.reason).toContain("免费轨道");
  });

  it("verifies subscription and enforces 500 monthly limit", () => {
    const start = Date.UTC(2026, 2, 1, 0, 0, 0);
    const activated = verifySubscriptionToken(createInitialBillingState(start), "nm_sub_demo", start);
    let state = activated;
    for (let i = 0; i < 500; i += 1) {
      const timestamp = start + i * 61_000;
      const checked = checkInvokeAccess(state, timestamp);
      expect(checked.decision.allowed).toBe(true);
      state = consumeInvokeQuota(checked.state, timestamp);
    }
    const blocked = checkInvokeAccess(state, start + 500 * 61_000);
    expect(blocked.decision.allowed).toBe(false);
    expect(blocked.decision.requiresTopUp).toBe(true);
  });

  it("allows invocation with topup after monthly quota exhausted", () => {
    const activated = verifySubscriptionToken(createInitialBillingState(), "nm_sub_demo");
    const exhausted = {
      ...activated,
      monthlyUsed: 500
    };
    const toppedUp = purchaseOveragePack(exhausted, 20, "order_1001");
    const checked = checkInvokeAccess(toppedUp);
    expect(checked.decision.allowed).toBe(true);
    expect(checked.decision.reason).toContain("增量包");
    const consumed = consumeInvokeQuota(checked.state);
    expect(consumed.overagePackRemaining).toBe(19);
  });

  it("marks cancel at period end and supports refund reclaim", () => {
    const activated = verifySubscriptionToken(createInitialBillingState(), "nm_sub_demo");
    const canceled = requestCancelSubscription(activated);
    expect(canceled.cancelAtPeriodEnd).toBe(true);
    const refunded = processRefund(canceled, "refund_2001");
    expect(refunded.plan).toBe("free");
    expect(refunded.subscriptionStatus).toBe("refunded");
  });

  it("blocks account when high frequency invoke triggers risk control", () => {
    const base = verifySubscriptionToken(createInitialBillingState(1_000_000), "nm_sub_demo", 1_000_000);
    let state = base;
    for (let i = 0; i < 20; i += 1) {
      state = consumeInvokeQuota(state, 1_000_000 + i * 1000);
    }
    expect(state.risk.blocked).toBe(true);
    const checked = checkInvokeAccess(state, 1_050_000);
    expect(checked.decision.allowed).toBe(false);
    expect(checked.decision.reason).toContain("风控");
  });

  it("deduplicates repeated usage consume by request id", () => {
    const activated = verifySubscriptionToken(createInitialBillingState(), "nm_sub_demo");
    const first = consumeInvokeQuota(activated, 10_000, { requestId: "req-1" });
    const second = consumeInvokeQuota(first, 11_000, { requestId: "req-1" });
    expect(first.monthlyUsed).toBe(1);
    expect(second.monthlyUsed).toBe(1);
    expect(second.auditLogs.at(-1)?.action).toBe("usage_deduplicated");
  });

  it("enters degraded risk level before full block", () => {
    const base = verifySubscriptionToken(createInitialBillingState(2_000_000), "nm_sub_demo", 2_000_000);
    let state = base;
    for (let i = 0; i < 12; i += 1) {
      state = consumeInvokeQuota(state, 2_000_000 + i * 1000, { requestId: `deg-${i}` });
    }
    expect(state.risk.level).toBe("degraded");
    const checked = checkInvokeAccess(state, 2_050_000);
    expect(checked.decision.allowed).toBe(true);
    expect(checked.decision.degraded).toBe(true);
  });

  it("keeps vip whitelist out of risk block", () => {
    const vip = verifySubscriptionToken(createInitialBillingState(3_000_000), "nm_sub_vip_demo", 3_000_000);
    let state = vip;
    for (let i = 0; i < 30; i += 1) {
      state = consumeInvokeQuota(state, 3_000_000 + i * 1000, { requestId: `vip-${i}` });
    }
    expect(state.risk.whitelist).toBe(true);
    expect(state.risk.blocked).toBe(false);
  });

  it("creates manual review ticket for risk handling", () => {
    const base = verifySubscriptionToken(createInitialBillingState(), "nm_sub_demo");
    const reviewed = requestRiskManualReview(base, "高频调用场景需要人工复核");
    expect(reviewed.ticketId).toContain("rvw_");
    expect(reviewed.state.risk.reviewRequired).toBe(true);
    expect(reviewed.state.auditLogs.at(-1)?.action).toBe("risk_review_requested");
  });
});
