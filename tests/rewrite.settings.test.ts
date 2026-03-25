import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, resolveRewriteIntent, upsertSiteIntentRule } from "@nexusmind/core";

describe("rewrite settings", () => {
  it("should resolve site intent first and fallback to default intent", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      rewrite: {
        defaultIntent: "summary" as const,
        siteIntents: [{ hostname: "example.com", intent: "learning" as const }]
      }
    };
    expect(resolveRewriteIntent(settings, "https://example.com/article/1")).toBe("learning");
    expect(resolveRewriteIntent(settings, "https://another.com/article/1")).toBe("summary");
  });

  it("should upsert site intent by hostname", () => {
    const rules = upsertSiteIntentRule([{ hostname: "example.com", intent: "learning" }], "example.com", "summary");
    expect(rules).toEqual([{ hostname: "example.com", intent: "summary" }]);
  });
});
