import "fake-indexeddb/auto";
import { performance } from "node:perf_hooks";
import { NexusMindGraphService } from "@nexusmind/graph";
import { afterEach, describe, expect, it } from "vitest";

const cleanupNames: string[] = [];

function createService(): NexusMindGraphService {
  const dbName = `nexusmind-graph-perf-${Date.now()}-${Math.random()}`;
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

describe("graph performance", () => {
  it("should query graph within one second at 2000 entities scale", async () => {
    const service = createService();
    try {
      const tokens = Array.from({ length: 2000 }, (_v, index) => `Node${String(index).padStart(4, "0")}`);
      await service.ingestPage({
        url: "https://example.com/perf",
        title: "Perf",
        pageText: tokens.join(" ")
      });

      const started = performance.now();
      const result = await service.search("Node19");
      const elapsedMs = performance.now() - started;

      const stats = await service.getStats();
      expect(stats.entities).toBeGreaterThanOrEqual(2000);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(1000);
    } finally {
      await service.close();
    }
  });
});
