import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { DomRewriteEngine } from "../apps/extension/src/rewrite-engine";

function createDom(url: string): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <header id="site-header">HEADER</header>
          <main id="main-content">
            <h1>主标题</h1>
            <h2>第一节</h2>
            <p>段落一。段落二。段落三。</p>
          </main>
          <aside id="sidebar">SIDEBAR</aside>
        </body>
      </html>`,
    { url }
  );
}

describe("rewrite rollback integration", () => {
  it("should restore layout and hidden elements after rollback", () => {
    const dom = createDom("https://example.com/a");
    const engine = new DomRewriteEngine(dom.window.document, dom.window);
    const applyResult = engine.apply("learning");
    expect(applyResult.applied).toBe(true);
    const sidebar = dom.window.document.querySelector<HTMLElement>("#sidebar");
    expect(sidebar?.style.display).toBe("none");
    const panel = dom.window.document.querySelector("[data-nexusmind-rewrite-panel='true']");
    expect(panel).not.toBeNull();
    const rollbackResult = engine.rollback();
    expect(rollbackResult.restored).toBe(true);
    expect(dom.window.document.querySelector("[data-nexusmind-rewrite-panel='true']")).toBeNull();
    expect(sidebar?.style.display ?? "").toBe("");
    const firstChildId = dom.window.document.body.firstElementChild?.id;
    expect(firstChildId).toBe("site-header");
  });

  it("should auto rollback when route changed", () => {
    const dom = createDom("https://example.com/a");
    const engine = new DomRewriteEngine(dom.window.document, dom.window);
    engine.apply("summary");
    dom.reconfigure({ url: "https://example.com/b" });
    const result = engine.handleRouteChange();
    expect(result.restored).toBe(true);
    expect(engine.getStatus().active).toBe(false);
  });
});
