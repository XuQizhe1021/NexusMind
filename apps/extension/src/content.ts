import type { RewriteIntent } from "@nexusmind/core";
import { PageSnippetHighlighter } from "./highlight";
import { DomRewriteEngine } from "./rewrite-engine";

function collectReadableText(): string {
  const text = document.body?.innerText ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, 30000);
}

const rewriteEngine = new DomRewriteEngine(document, window);
const pageHighlighter = new PageSnippetHighlighter(document, window);

let installedRouteHook = false;
let installedRouteEventListener = false;
let lastKnownUrl = window.location.href;

function installSpaRouteHooks(): void {
  if (installedRouteHook) {
    return;
  }
  installedRouteHook = true;
  const { pushState, replaceState } = history;
  const notifyRouteChange = (): void => {
    window.dispatchEvent(new CustomEvent("nexusmind:route-change"));
  };
  history.pushState = function (...args) {
    const result = pushState.apply(this, args);
    notifyRouteChange();
    return result;
  };
  history.replaceState = function (...args) {
    const result = replaceState.apply(this, args);
    notifyRouteChange();
    return result;
  };
}

function installRouteRollbackListener(): void {
  if (installedRouteEventListener) {
    return;
  }
  installedRouteEventListener = true;
  const onRouteSignal = (): void => {
    const current = window.location.href;
    if (current === lastKnownUrl) {
      return;
    }
    lastKnownUrl = current;
    rewriteEngine.handleRouteChange();
  };
  window.addEventListener("nexusmind:route-change", onRouteSignal);
  window.addEventListener("popstate", onRouteSignal);
  window.addEventListener("hashchange", onRouteSignal);
}

installSpaRouteHooks();
installRouteRollbackListener();

chrome.runtime.onMessage.addListener((message: { type: string; payload?: { intent?: RewriteIntent } }, _sender, sendResponse) => {
  if (message.type === "NEXUSMIND_GET_PAGE_TEXT") {
    sendResponse({
      ok: true,
      data: {
        pageText: collectReadableText(),
        url: window.location.href,
        title: document.title
      }
    });
    return true;
  }
  if (message.type === "NEXUSMIND_REWRITE_APPLY") {
    const intent = message.payload?.intent;
    if (!intent) {
      sendResponse({ ok: false, error: "缺少重写意图" });
      return true;
    }
    const result = rewriteEngine.apply(intent);
    if (!result.applied && result.reason === "rewrite_busy") {
      sendResponse({ ok: false, error: "页面重写处理中，请稍后重试" });
      return true;
    }
    sendResponse({
      ok: true,
      data: result
    });
    return true;
  }
  if (message.type === "NEXUSMIND_REWRITE_ROLLBACK") {
    const result = rewriteEngine.rollback();
    sendResponse({
      ok: true,
      data: result
    });
    return true;
  }
  if (message.type === "NEXUSMIND_REWRITE_STATUS") {
    sendResponse({
      ok: true,
      data: rewriteEngine.getStatus()
    });
    return true;
  }
  if (message.type === "NEXUSMIND_HIGHLIGHT_TEXT") {
    const snippet = typeof (message.payload as { snippet?: string } | undefined)?.snippet === "string"
      ? (message.payload as { snippet: string }).snippet
      : "";
    const located = pageHighlighter.locate(snippet);
    sendResponse({
      ok: true,
      data: {
        located
      }
    });
    return true;
  }
  return false;
});
