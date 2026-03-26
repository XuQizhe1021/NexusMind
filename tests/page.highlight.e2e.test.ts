import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { PageSnippetHighlighter } from "../apps/extension/src/highlight";

function installFind(win: Window, doc: Document): void {
  (win as Window & { find?: (...args: unknown[]) => boolean }).find = ((keyword: string) => {
    const target = keyword.trim();
    if (!target) {
      return false;
    }
    const nodeFilter = (win as unknown as { NodeFilter: { SHOW_TEXT: number } }).NodeFilter;
    const walker = doc.createTreeWalker(doc.body, nodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const value = node.textContent ?? "";
      const index = value.indexOf(target);
      if (index >= 0) {
        const range = doc.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = win.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      }
      node = walker.nextNode();
    }
    return false;
  }) as (...args: unknown[]) => boolean;
}

describe("page highlight e2e", () => {
  it("should highlight located snippet and keep single active mark", () => {
    const dom = new JSDOM(
      "<!doctype html><html><body><main>OpenAI 与 Microsoft 深度合作，Azure 提供部署能力。</main></body></html>"
    );
    const { document } = dom.window;
    const browserWindow = dom.window as unknown as Window;
    installFind(browserWindow, document);
    const highlighter = new PageSnippetHighlighter(document, browserWindow);
    expect(highlighter.locate("OpenAI 与 Microsoft")).toBe(true);
    expect(document.querySelectorAll("mark[data-nexusmind-highlight='true']")).toHaveLength(1);
    expect(highlighter.locate("Azure 提供部署能力")).toBe(true);
    expect(document.querySelectorAll("mark[data-nexusmind-highlight='true']")).toHaveLength(1);
  });
});
