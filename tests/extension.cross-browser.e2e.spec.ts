import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import http from "node:http";
import path from "node:path";

declare const chrome: typeof globalThis extends { chrome: infer C } ? C : any;

interface TestServer {
  server: http.Server;
  baseUrl: string;
}

async function createTestServer(): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    if ((req.url ?? "/").startsWith("/spa")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>NexusMind E2E</title></head>
  <body>
    <aside id="noise">导航噪声</aside>
    <main>
      <h1>跨页测试标题</h1>
      <p>这是一段用于自动化回归的正文内容，包含稳定关键词：知识织网。</p>
    </main>
    <script>
      window.__nexusmindNavigate = function () {
        location.hash = "next";
      };
    </script>
  </body>
</html>`);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("测试服务启动失败");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing.length > 0) {
    return existing[0];
  }
  return context.waitForEvent("serviceworker");
}

test.describe("extension cross-browser regression", () => {
  let server: TestServer;
  let context: BrowserContext;
  let page: Page;
  let serviceWorker: Worker;
  let extensionId = "";

  test.beforeAll(async () => {
    server = await createTestServer();
    const extensionPath = path.resolve(process.cwd(), "apps/extension/dist");
    const channel = process.env.NEXUSMIND_E2E_CHANNEL === "msedge" ? "msedge" : "chromium";
    context = await chromium.launchPersistentContext("", {
      channel,
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    serviceWorker = await waitForServiceWorker(context);
    extensionId = new URL(serviceWorker.url()).host;
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
    await closeServer(server.server);
  });

  test("loads sidepanel entry and keeps extension worker active", async () => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(page.getByRole("heading", { name: "NexusMind" })).toBeVisible();
    const workerUrl = serviceWorker.url();
    expect(workerUrl).toContain(extensionId);
  });

  test("reads page text and rolls back rewrite after SPA route change", async () => {
    await page.goto(`${server.baseUrl}/spa`);
    const apply = await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("未找到活动标签页");
      }
      return chrome.tabs.sendMessage(tab.id, {
        type: "NEXUSMIND_REWRITE_APPLY",
        payload: { intent: "learning" }
      });
    });
    expect(Boolean((apply as { ok?: boolean }).ok)).toBe(true);

    const textResponse = await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("未找到活动标签页");
      }
      return chrome.tabs.sendMessage(tab.id, { type: "NEXUSMIND_GET_PAGE_TEXT" });
    });
    expect(String((textResponse as { data?: { pageText?: string } }).data?.pageText ?? "")).toContain("知识织网");

    await page.evaluate(() => {
      (window as unknown as { __nexusmindNavigate: () => void }).__nexusmindNavigate();
    });

    await expect
      .poll(async () => {
        const status = await serviceWorker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            throw new Error("未找到活动标签页");
          }
          return chrome.tabs.sendMessage(tab.id, { type: "NEXUSMIND_REWRITE_STATUS" });
        });
        return (status as { data?: { active?: boolean } }).data?.active;
      })
      .toBe(false);
  });
});
