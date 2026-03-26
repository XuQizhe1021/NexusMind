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
import { createSign } from "node:crypto";
import { describe, expect, it } from "vitest";

const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCVHfTTkSKn2XuN
/AfHUFUVr5FAa36S7yHhpDjPTtKnY+DB3VPHJnScdplIVPW9u3kBX/3ioBAT+CeY
1doXUV3SklVaKfvuUtQ7iCtGMhOmHbpM/GLaKjYUiI1QKG9Z1SHa4ufNVZGII9vK
c0X7ra3gVynyiyIJA9gyD34CKxMehaIhGs2ahXhmAVMNCOESAK8LUXAm39A3xRcl
mQIA1pLOaib660bixa/ZxZStcXY+A09nNISkIThFUp6KBTHFAeSZpn8TdO28qIcM
qv16kL6BRCjMP4hbrHOu1qcjTuYvxdRKnrZtxJjrrGMsZeEpQ3MUuYt/cRddSUWo
zvkmXyvBAgMBAAECggEABDVSfiIIh7XIjjxvFZUwKkIORRVsRJep0KsIb8T0hvlg
WaEB3i3zMueUIMOi3xBb1z4vGFsKypKS7bAXtdd7vbppf+AwXAyovH51wLt8hBvp
B/tbdEiPDCjBrDNcTAj/Kd8P1gXASFJM7kcX0hDGdP1a7rTBlztb6FXE3Z2G3ODK
dzGHR7w6NRZ+25fXikFuY/RpoA9oWgLSMt2wcHpsvsBmEbeetjhMJTDgH0P7zhSb
oFsgQ7p85xN12YgKsh55jHMW+Ris9bQR1NDgd0flL8Bb7vjO35qgVMTQ9SkaZXHD
Vh30ndk77mYlvO6pEY1CKQ8G9UhTksCTUgt0TabQnQKBgQDLtMJxjgLoeQmo4jeX
Xb470aNl+Kgh1YvH1AhLtGA8U643mmM9qHCBjPnKdaVhmtP908gcUa8l+Fjt+46N
Gig0ymyDY+5iDRQ0q4U5NkxF2SXM7wCep47iUr2akOR8FyR30/OujaI9k0fA1l9E
t6kcnBtyGL8HE8YImZ8r/d3KMwKBgQC7ZbCJxssMQ7FFSkQgZ+922JrCBwRftR8e
8ViwNeUJbBfD2WVV995MB1+CErAi/4/e0w1Lk9xfeCXD8q0r4vjJlv439RUXDWs9
bqBi3Y2gdIQSmShPZ6FOwP4fKP/8f5y8X/DNZFa1CXZE3xl/fHePhB4aak4jI1po
zMRyJMomOwKBgFnMMzMPoSSNxr5WCp+FSYjhHyCifqt7kYTjaUzGFO5DDTehrUHO
8NmLJcokFmVydSUdqMcjEwyv77PpAqwc7cBnw3IgKUO79D5LpgzUbMcVtF4ktac6
wffu9XofiTlSklbobjFyaiSuuiC9331RYREll8uyMPOTueasocgovw6VAoGAD3DZ
kwCmSmRpfuQXqPPnb0t5tPMPETPDVLFeNWa7cINPkfufte2ui2UwIW+Yw8l6+Uk6
lzefuN4VfofIbQ1Ooo2mdMXk7vlUFMPAw2St/sKa/01PXPuU9wA/8CFYtl1tdLgT
B1l1K4WUESiw2ShQUar5MAQCXDLViD0XErClV3ECgYBx7XAtZGRVtKey0e+zY+S2
Vv/QLr2dgFsQQhR1LrMa6RUdQczCRX/umMT9vXMTXGU0MBrriM1pPTrPZLEgcRB2
Yuf7+a/NtsIsGkc01jZraxQNyjjTWcu+CdX4ZcUtqGF39/szxd7gtzhvWeSjUk3h
VAPoVEdo6bD283TLeAWDew==
-----END PRIVATE KEY-----`;

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function createSubscriptionToken(params?: { whitelist?: boolean; exp?: number; iat?: number; subject?: string }): string {
  const iat = params?.iat ?? Math.floor(Date.now() / 1000) - 10;
  const exp = params?.exp ?? iat + 60 * 60;
  const header = toBase64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: "nm-prod-2026-03"
    })
  );
  const payload = toBase64Url(
    JSON.stringify({
      iss: "nexusmind-billing",
      aud: "nexusmind-extension",
      sub: params?.subject ?? "user_demo",
      plan: "subscription",
      status: "active",
      iat,
      exp,
      whitelist: params?.whitelist ?? false
    })
  );
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  sign.end();
  const signature = sign.sign(TEST_PRIVATE_KEY_PEM).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function createSubscriptionTokenForTimestamp(timestampMs: number, options?: { whitelist?: boolean }): string {
  const iat = Math.floor(timestampMs / 1000) - 10;
  const exp = iat + 60 * 60;
  return createSubscriptionToken({ iat, exp, whitelist: options?.whitelist });
}

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

  it("verifies subscription and enforces 500 monthly limit", async () => {
    const start = Date.UTC(2026, 2, 1, 0, 0, 0);
    const activated = await verifySubscriptionToken(
      createInitialBillingState(start),
      createSubscriptionTokenForTimestamp(start),
      start
    );
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

  it("allows invocation with topup after monthly quota exhausted", async () => {
    const activated = await verifySubscriptionToken(createInitialBillingState(), createSubscriptionToken());
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

  it("marks cancel at period end and supports refund reclaim", async () => {
    const activated = await verifySubscriptionToken(createInitialBillingState(), createSubscriptionToken());
    const canceled = requestCancelSubscription(activated);
    expect(canceled.cancelAtPeriodEnd).toBe(true);
    const refunded = processRefund(canceled, "refund_2001");
    expect(refunded.plan).toBe("free");
    expect(refunded.subscriptionStatus).toBe("refunded");
  });

  it("blocks account when high frequency invoke triggers risk control", async () => {
    const base = await verifySubscriptionToken(
      createInitialBillingState(1_000_000),
      createSubscriptionTokenForTimestamp(1_000_000),
      1_000_000
    );
    let state = base;
    for (let i = 0; i < 20; i += 1) {
      state = consumeInvokeQuota(state, 1_000_000 + i * 1000);
    }
    expect(state.risk.blocked).toBe(true);
    const checked = checkInvokeAccess(state, 1_050_000);
    expect(checked.decision.allowed).toBe(false);
    expect(checked.decision.reason).toContain("风控");
  });

  it("deduplicates repeated usage consume by request id", async () => {
    const activated = await verifySubscriptionToken(createInitialBillingState(), createSubscriptionToken());
    const first = consumeInvokeQuota(activated, 10_000, { requestId: "req-1" });
    const second = consumeInvokeQuota(first, 11_000, { requestId: "req-1" });
    expect(first.monthlyUsed).toBe(1);
    expect(second.monthlyUsed).toBe(1);
    expect(second.auditLogs.at(-1)?.action).toBe("usage_deduplicated");
  });

  it("enters degraded risk level before full block", async () => {
    const base = await verifySubscriptionToken(
      createInitialBillingState(2_000_000),
      createSubscriptionTokenForTimestamp(2_000_000),
      2_000_000
    );
    let state = base;
    for (let i = 0; i < 12; i += 1) {
      state = consumeInvokeQuota(state, 2_000_000 + i * 1000, { requestId: `deg-${i}` });
    }
    expect(state.risk.level).toBe("degraded");
    const checked = checkInvokeAccess(state, 2_050_000);
    expect(checked.decision.allowed).toBe(true);
    expect(checked.decision.degraded).toBe(true);
  });

  it("keeps vip whitelist out of risk block", async () => {
    const vip = await verifySubscriptionToken(
      createInitialBillingState(3_000_000),
      createSubscriptionTokenForTimestamp(3_000_000, { whitelist: true }),
      3_000_000
    );
    let state = vip;
    for (let i = 0; i < 30; i += 1) {
      state = consumeInvokeQuota(state, 3_000_000 + i * 1000, { requestId: `vip-${i}` });
    }
    expect(state.risk.whitelist).toBe(true);
    expect(state.risk.blocked).toBe(false);
  });

  it("creates manual review ticket for risk handling", async () => {
    const base = await verifySubscriptionToken(createInitialBillingState(), createSubscriptionToken());
    const reviewed = requestRiskManualReview(base, "高频调用场景需要人工复核");
    expect(reviewed.ticketId).toContain("rvw_");
    expect(reviewed.state.risk.reviewRequired).toBe(true);
    expect(reviewed.state.auditLogs.at(-1)?.action).toBe("risk_review_requested");
  });

  it("rejects expired signed token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = createSubscriptionToken({ iat: nowSeconds - 7200, exp: nowSeconds - 3600 });
    await expect(verifySubscriptionToken(createInitialBillingState(), expiredToken)).rejects.toThrow("Token 已过期");
  });

  it("rejects tampered signed token payload", async () => {
    const valid = createSubscriptionToken();
    const [header, payload, signature] = valid.split(".");
    const tamperedPayload = toBase64Url(
      JSON.stringify({
        iss: "nexusmind-billing",
        aud: "nexusmind-extension",
        sub: "user_demo",
        plan: "subscription",
        status: "active",
        iat: Math.floor(Date.now() / 1000) - 10,
        exp: Math.floor(Date.now() / 1000) + 3600,
        whitelist: true
      })
    );
    await expect(
      verifySubscriptionToken(createInitialBillingState(), `${header}.${tamperedPayload}.${signature}`)
    ).rejects.toThrow("签名无效");
    expect(payload).not.toBe(tamperedPayload);
  });
});
