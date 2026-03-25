import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { DomRewriteEngine } from "../apps/extension/src/rewrite-engine";

function createLargeArticleHtml(paragraphCount: number): string {
  const paragraphs = Array.from({ length: paragraphCount }, (_item, index) => {
    return `<p>第${index}段：NexusMind 页面重写性能基准测试文本。</p>`;
  }).join("");
  return `<!doctype html><html><body><header>top</header><main><h1>性能测试</h1>${paragraphs}</main><footer>bottom</footer></body></html>`;
}

describe("rewrite performance", () => {
  it("should finish rewrite apply within one second without AI call", () => {
    const dom = new JSDOM(createLargeArticleHtml(4000), {
      url: "https://example.com/perf"
    });
    const engine = new DomRewriteEngine(dom.window.document, dom.window);
    const result = engine.apply("distraction_free");
    expect(result.applied).toBe(true);
    expect(result.durationMs).toBeLessThan(1000);
  });
});
