import { OpenAiChatClient, parseOpenAiSseLines } from "../packages/ai/src/provider";
import { afterEach, describe, expect, it, vi } from "vitest";

function createSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

describe("ai streaming integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should parse openai sse lines", () => {
    const payload =
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n' +
      'data: {"choices":[{"delta":{"content":"，世界"}}]}\n' +
      "data: [DONE]\n";
    const parsed = parseOpenAiSseLines(payload);
    expect(parsed.chunks).toEqual(["你好", "，世界"]);
    expect(parsed.rest).toBe("");
  });

  it("should stream answer chunks and join full text", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"OpenAI"}}]}',
        'data: {"choices":[{"delta":{"content":" 与 Microsoft 合作"}}]}',
        "data: [DONE]"
      ])
    );
    vi.stubGlobal("fetch", mockFetch);

    const client = new OpenAiChatClient("test-key", "gpt-4o-mini");
    const chunks: string[] = [];
    const answer = await client.streamAnswer(
      {
        question: "关系是什么？",
        pageText: "OpenAI 与 Microsoft 合作。",
        evidence: [
          {
            id: "S1",
            title: "关系页",
            url: "https://example.com",
            snippet: "OpenAI 与 Microsoft 合作。"
          }
        ]
      },
      {
        onDelta: (chunk) => {
          chunks.push(chunk);
        }
      }
    );

    expect(chunks).toEqual(["OpenAI", " 与 Microsoft 合作"]);
    expect(answer).toBe("OpenAI 与 Microsoft 合作");
  });

  it("should support abort signal during streaming request", async () => {
    const mockFetch = vi.fn((_: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
        setTimeout(() => {
          resolve(
            createSseResponse([
              'data: {"choices":[{"delta":{"content":"不会返回"}}]}',
              "data: [DONE]"
            ])
          );
        }, 30);
      });
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = new OpenAiChatClient("test-key", "gpt-4o-mini");
    const controller = new AbortController();
    const task = client.streamAnswer(
      {
        question: "测试中断",
        pageText: "测试中断"
      },
      {
        signal: controller.signal,
        onDelta: () => undefined
      }
    );
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  });
});
