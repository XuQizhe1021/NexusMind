export class PageSnippetHighlighter {
  private lastHighlightEl: HTMLElement | null = null;

  public constructor(
    private readonly doc: Document,
    private readonly win: Window
  ) {}

  public clear(): void {
    if (!this.lastHighlightEl) {
      return;
    }
    const parent = this.lastHighlightEl.parentNode;
    if (parent) {
      parent.replaceChild(this.doc.createTextNode(this.lastHighlightEl.textContent ?? ""), this.lastHighlightEl);
      parent.normalize();
    }
    this.lastHighlightEl = null;
  }

  public locate(snippet: string): boolean {
    const keyword = snippet.trim().slice(0, 160);
    if (!keyword) {
      return false;
    }
    this.clear();
    const canFind = (this.win as Window & { find?: (...args: unknown[]) => boolean }).find;
    if (!canFind) {
      return false;
    }
    const found = canFind.call(this.win, keyword, false, false, true, false, true, false);
    if (!found) {
      return false;
    }
    const selection = this.win.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    const mark = this.doc.createElement("mark");
    mark.setAttribute("data-nexusmind-highlight", "true");
    mark.style.backgroundColor = "#fde68a";
    mark.style.color = "inherit";
    try {
      range.surroundContents(mark);
      this.lastHighlightEl = mark;
      if (typeof mark.scrollIntoView === "function") {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      selection.removeAllRanges();
      return true;
    } catch {
      selection.removeAllRanges();
      const container = range.startContainer;
      if (container.nodeType === Node.ELEMENT_NODE) {
        const element = container as Element;
        const scroller = element as Element & {
          scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
        };
        if (typeof scroller.scrollIntoView === "function") {
          scroller.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return true;
      }
      if (container.parentElement) {
        if (typeof container.parentElement.scrollIntoView === "function") {
          container.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return true;
      }
      return false;
    }
  }
}
