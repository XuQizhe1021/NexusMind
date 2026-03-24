function collectReadableText(): string {
  const text = document.body?.innerText ?? "";
  return text.replace(/\s+/g, " ").trim().slice(0, 30000);
}

chrome.runtime.onMessage.addListener((message: { type: string }, _sender, sendResponse) => {
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
  return false;
});
