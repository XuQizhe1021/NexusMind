import { extractEntitiesAndRelations } from "@nexusmind/graph";
import { describe, expect, it } from "vitest";

describe("graph extractor", () => {
  it("should extract entities and co-occurrence relations", () => {
    const result = extractEntitiesAndRelations(
      "OpenAI 发布 GPT4。OpenAI 与 Microsoft 推进合作。Microsoft 支持 Azure。"
    );
    const keys = new Set(result.entities.map((entity) => entity.canonicalKey));
    expect(keys.has("openai")).toBe(true);
    expect(keys.has("microsoft")).toBe(true);
    expect(result.relationKeys.some((item) => item.includes("openai") && item.includes("microsoft"))).toBe(true);
  });
});
