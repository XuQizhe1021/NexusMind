import type { RewriteIntent } from "@nexusmind/core";

interface HiddenElementRecord {
  element: HTMLElement;
  previousDisplay: string;
  hadStyleAttribute: boolean;
}

interface StyledElementRecord {
  element: HTMLElement;
  previousStyleAttribute: string | null;
}

interface MovedElementRecord {
  element: HTMLElement;
  parent: Node;
  nextSibling: ChildNode | null;
}

interface RewriteSession {
  url: string;
  intent: RewriteIntent;
  hiddenElements: HiddenElementRecord[];
  styledElements: StyledElementRecord[];
  movedElements: MovedElementRecord[];
  insertedPanels: HTMLElement[];
}

interface RewriteWindowLike {
  location: {
    href: string;
  };
  performance: {
    now(): number;
  };
}

export interface RewriteApplyResult {
  applied: boolean;
  intent: RewriteIntent;
  durationMs: number;
  reason?: string;
}

export interface RewriteRollbackResult {
  restored: boolean;
  reason?: string;
}

function textLength(element: Element): number {
  return element.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
}

function normalizedText(element: Element): string {
  const raw = "innerText" in element ? (element as HTMLElement).innerText : null;
  const text = typeof raw === "string" && raw.length > 0 ? raw : element.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

export function summarizeTextBySentence(text: string, maxSentences: number): string[] {
  return text
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, maxSentences);
}

export class DomRewriteEngine {
  private session: RewriteSession | null = null;
  private applying = false;

  constructor(private readonly doc: Document, private readonly win: RewriteWindowLike) {}

  getStatus(): { active: boolean; intent?: RewriteIntent; url?: string } {
    if (!this.session) {
      return { active: false };
    }
    return {
      active: true,
      intent: this.session.intent,
      url: this.session.url
    };
  }

  apply(intent: RewriteIntent): RewriteApplyResult {
    if (this.applying) {
      return {
        applied: false,
        intent,
        durationMs: 0,
        reason: "rewrite_busy"
      };
    }
    this.applying = true;
    const startedAt = this.win.performance.now();
    try {
      const currentUrl = this.win.location.href;
      if (this.session?.url === currentUrl && this.session.intent === intent) {
        return {
          applied: false,
          intent,
          durationMs: 0,
          reason: "already_applied"
        };
      }
      // 每次重写前先还原旧状态，确保变更集合始终可逆且不会叠加污染。
      this.rollback();
      const focusRoot = this.pickFocusRoot();
      const session: RewriteSession = {
        url: currentUrl,
        intent,
        hiddenElements: [],
        styledElements: [],
        movedElements: [],
        insertedPanels: []
      };
      const topContainer = this.pickTopContainer(focusRoot);
      this.moveToTop(topContainer, session);
      this.applyFocusStyle(topContainer, session);
      this.hideNoiseElements(topContainer, session);
      this.insertIntentPanel(intent, focusRoot, topContainer, session);
      this.session = session;
      return {
        applied: true,
        intent,
        durationMs: this.win.performance.now() - startedAt
      };
    } finally {
      this.applying = false;
    }
  }

  rollback(): RewriteRollbackResult {
    if (!this.session) {
      return {
        restored: false,
        reason: "no_active_rewrite"
      };
    }
    // 回滚顺序必须与应用顺序相反，才能保证 DOM 结构与样式恢复一致。
    for (const panel of this.session.insertedPanels) {
      panel.remove();
    }
    for (const item of this.session.styledElements) {
      if (item.previousStyleAttribute === null) {
        item.element.removeAttribute("style");
      } else {
        item.element.setAttribute("style", item.previousStyleAttribute);
      }
    }
    for (const item of this.session.hiddenElements) {
      item.element.style.display = item.previousDisplay;
      if (!item.hadStyleAttribute && item.element.getAttribute("style") === "") {
        item.element.removeAttribute("style");
      }
    }
    for (const item of this.session.movedElements.slice().reverse()) {
      item.parent.insertBefore(item.element, item.nextSibling);
    }
    this.session = null;
    return { restored: true };
  }

  handleRouteChange(): RewriteRollbackResult {
    const active = this.session;
    if (!active) {
      return { restored: false, reason: "no_active_rewrite" };
    }
    if (active.url === this.win.location.href) {
      return { restored: false, reason: "same_route" };
    }
    // SPA 路由切换时主动回滚，避免旧页面重写结果残留到新页面。
    return this.rollback();
  }

  private pickFocusRoot(): HTMLElement {
    const isHTMLElement = (element: Element): element is HTMLElement => {
      const ctor = this.doc.defaultView?.HTMLElement;
      return ctor ? element instanceof ctor : "style" in (element as unknown as Record<string, unknown>);
    };
    const mainBySelector = this.doc.querySelector<HTMLElement>(
      "article, main, [role='main'], .article, .post, .content"
    );
    if (mainBySelector) {
      return mainBySelector;
    }
    const bodyChildren = Array.from(this.doc.body.children).filter(
      (element): element is HTMLElement => isHTMLElement(element)
    );
    const sorted = bodyChildren.sort((a, b) => textLength(b) - textLength(a));
    return sorted[0] ?? this.doc.body;
  }

  private pickTopContainer(focusRoot: HTMLElement): HTMLElement {
    let cursor: HTMLElement = focusRoot;
    while (cursor.parentElement && cursor.parentElement !== this.doc.body) {
      cursor = cursor.parentElement;
    }
    return cursor;
  }

  private moveToTop(element: HTMLElement, session: RewriteSession): void {
    const parent = element.parentNode;
    if (!parent || parent !== this.doc.body) {
      return;
    }
    if (this.doc.body.firstElementChild === element) {
      return;
    }
    session.movedElements.push({
      element,
      parent,
      nextSibling: element.nextSibling
    });
    this.doc.body.insertBefore(element, this.doc.body.firstChild);
  }

  private applyFocusStyle(element: HTMLElement, session: RewriteSession): void {
    session.styledElements.push({
      element,
      previousStyleAttribute: element.getAttribute("style")
    });
    element.style.maxWidth = "980px";
    element.style.margin = "0 auto";
    element.style.padding = "24px 16px";
    element.style.lineHeight = "1.8";
    element.style.fontSize = "17px";
    element.style.background = "#ffffff";
    element.style.boxShadow = "0 0 0 1px #e5e7eb";
    element.style.borderRadius = "12px";
  }

  private hideNoiseElements(topContainer: HTMLElement, session: RewriteSession): void {
    const isHTMLElement = (element: Element): element is HTMLElement => {
      const ctor = this.doc.defaultView?.HTMLElement;
      return ctor ? element instanceof ctor : "style" in (element as unknown as Record<string, unknown>);
    };
    const children = Array.from(this.doc.body.children).filter(
      (child): child is HTMLElement => isHTMLElement(child)
    );
    for (const child of children) {
      if (child === topContainer) {
        continue;
      }
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") {
        continue;
      }
      session.hiddenElements.push({
        element: child,
        previousDisplay: child.style.display,
        hadStyleAttribute: child.hasAttribute("style")
      });
      child.style.display = "none";
    }
  }

  private insertIntentPanel(
    intent: RewriteIntent,
    focusRoot: HTMLElement,
    topContainer: HTMLElement,
    session: RewriteSession
  ): void {
    const panel = this.doc.createElement("section");
    panel.setAttribute("data-nexusmind-rewrite-panel", "true");
    panel.style.margin = "0 auto 12px auto";
    panel.style.maxWidth = "980px";
    panel.style.padding = "12px 16px";
    panel.style.border = "1px solid #cbd5e1";
    panel.style.borderRadius = "10px";
    panel.style.background = "#f8fafc";
    panel.style.fontSize = "14px";
    panel.style.color = "#0f172a";
    const title = this.doc.createElement("h2");
    title.style.margin = "0 0 8px 0";
    title.style.fontSize = "16px";
    title.textContent = this.intentTitle(intent);
    panel.append(title);
    if (intent === "learning") {
      this.fillLearningPanel(panel, focusRoot);
    }
    if (intent === "summary") {
      this.fillSummaryPanel(panel, focusRoot);
    }
    if (intent === "distraction_free") {
      this.fillDistractionFreePanel(panel, focusRoot);
    }
    this.doc.body.insertBefore(panel, topContainer);
    session.insertedPanels.push(panel);
  }

  private fillLearningPanel(panel: HTMLElement, focusRoot: HTMLElement): void {
    const heading = this.doc.createElement("p");
    heading.textContent = "建议按以下顺序阅读，先抓住主线再展开细节。";
    heading.style.margin = "0 0 8px 0";
    panel.append(heading);
    const points = Array.from(focusRoot.querySelectorAll("h1, h2, h3"))
      .map((element) => element.textContent?.trim() ?? "")
      .filter((text) => text.length > 0)
      .slice(0, 6);
    const list = this.doc.createElement("ol");
    list.style.margin = "0";
    list.style.paddingLeft = "20px";
    for (const point of points) {
      const item = this.doc.createElement("li");
      item.textContent = point;
      list.append(item);
    }
    if (points.length === 0) {
      const item = this.doc.createElement("li");
      item.textContent = "未识别到标题结构，请先浏览加粗段落与结论部分。";
      list.append(item);
    }
    panel.append(list);
  }

  private fillSummaryPanel(panel: HTMLElement, focusRoot: HTMLElement): void {
    const summaryLines = summarizeTextBySentence(normalizedText(focusRoot), 5);
    const list = this.doc.createElement("ul");
    list.style.margin = "0";
    list.style.paddingLeft = "20px";
    for (const line of summaryLines) {
      const item = this.doc.createElement("li");
      item.textContent = line;
      list.append(item);
    }
    if (summaryLines.length === 0) {
      const item = this.doc.createElement("li");
      item.textContent = "未提取到有效摘要，请尝试学习模式。";
      list.append(item);
    }
    panel.append(list);
  }

  private fillDistractionFreePanel(panel: HTMLElement, focusRoot: HTMLElement): void {
    const text = this.doc.createElement("p");
    const length = normalizedText(focusRoot).length;
    text.textContent = `已隐藏干扰区域，当前主内容约 ${length} 字。`;
    text.style.margin = "0";
    panel.append(text);
  }

  private intentTitle(intent: RewriteIntent): string {
    if (intent === "learning") {
      return "学习模式";
    }
    if (intent === "summary") {
      return "摘要模式";
    }
    return "去干扰模式";
  }
}
