import { canInvoke } from "@nexusmind/billing";
import { describe, expect, it } from "vitest";

describe("billing quota", () => {
  it("allows invocation before limit", () => {
    expect(canInvoke({ monthlyLimit: 500, monthlyUsed: 120 })).toBe(true);
  });

  it("blocks invocation at limit", () => {
    expect(canInvoke({ monthlyLimit: 500, monthlyUsed: 500 })).toBe(false);
  });
});
