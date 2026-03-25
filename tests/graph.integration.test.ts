import "fake-indexeddb/auto";
import { NexusMindGraphService } from "@nexusmind/graph";
import { afterEach, describe, expect, it } from "vitest";

const cleanupNames: string[] = [];

function createService(): NexusMindGraphService {
  const dbName = `nexusmind-graph-test-${Date.now()}-${Math.random()}`;
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

describe("graph pipeline integration", () => {
  it("should merge entities across pages and support re-index rollback", async () => {
    const service = createService();
    try {
      await service.ingestPage({
        url: "https://example.com/page-1",
        title: "P1",
        pageText: "OpenAI 发布模型。OpenAI 与 Microsoft 合作。"
      });
      await service.ingestPage({
        url: "https://example.com/page-2",
        title: "P2",
        pageText: "openai 在 Azure 上提供能力。"
      });

      const firstSearch = await service.search("openai");
      const openAiNodes = firstSearch.nodes.filter((node) => node.canonicalKey === "openai");
      expect(openAiNodes).toHaveLength(1);

      await service.ingestPage({
        url: "https://example.com/page-1",
        title: "P1-refresh",
        pageText: "Anthropic 发布 Claude。"
      });

      const stats = await service.getStats();
      expect(stats.pages).toBe(2);
      expect(stats.entities).toBeGreaterThanOrEqual(2);
    } finally {
      await service.close();
    }
  });
});
