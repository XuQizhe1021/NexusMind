import "fake-indexeddb/auto";
import { NexusMindGraphService } from "@nexusmind/graph";
import { afterEach, describe, expect, it } from "vitest";

const cleanupNames: string[] = [];

function createService(): NexusMindGraphService {
  const dbName = `nexusmind-graph-qa-test-${Date.now()}-${Math.random()}`;
  cleanupNames.push(dbName);
  return new NexusMindGraphService(dbName);
}

afterEach(async () => {
  for (const dbName of cleanupNames.splice(0)) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }
});

describe("graph qa evidence integration", () => {
  it("should build cross-page evidence sources for question", async () => {
    const service = createService();
    try {
      await service.ingestPage({
        url: "https://example.com/openai",
        title: "OpenAI 与 Microsoft",
        pageText: "OpenAI 与 Microsoft 深度合作，Azure 提供模型部署平台。"
      });
      await service.ingestPage({
        url: "https://example.com/anthropic",
        title: "Anthropic Claude",
        pageText: "Anthropic 发布 Claude 模型，强调安全与可控。"
      });

      const evidence = await service.buildQaEvidence("OpenAI 和 Microsoft 是什么关系？");
      expect(evidence.entities.length).toBeGreaterThan(0);
      expect(evidence.sources.length).toBeGreaterThan(0);
      expect(evidence.sources[0]?.snippet.length).toBeGreaterThan(0);
      expect(evidence.sources.map((item) => item.url)).toContain("https://example.com/openai");
    } finally {
      await service.close();
    }
  });
});
