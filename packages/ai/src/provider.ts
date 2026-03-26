import type { AskRequest } from "@nexusmind/core/types";

export interface AiChatClient {
  answer(request: AskRequest, options?: { signal?: AbortSignal }): Promise<string>;
  streamAnswer(
    request: AskRequest,
    handlers: {
      onDelta: (chunk: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<string>;
}

interface OpenAiRequest {
  model: string;
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  temperature: number;
  stream?: boolean;
}

interface OpenAiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

function buildUserPrompt(request: AskRequest): string {
  const evidenceText = (request.evidence ?? [])
    .map((item, index) => `S${index + 1} ${item.title}\nURL: ${item.url}\n片段: ${item.snippet}`)
    .join("\n\n");
  if (!evidenceText) {
    return `问题：${request.question}\n\n页面内容：${request.pageText.slice(0, 16000)}`;
  }
  return [
    `问题：${request.question}`,
    `当前页内容：${request.pageText.slice(0, 8000)}`,
    "跨页证据：",
    evidenceText,
    "请基于证据回答，并尽量使用 [S1] [S2] 形式标注来源编号。"
  ].join("\n\n");
}

function buildRequestPayload(model: string, request: AskRequest, stream: boolean): OpenAiRequest {
  return {
    model,
    temperature: 0.2,
    stream,
    messages: [
      {
        role: "system",
        content:
          "你是NexusMind浏览器助手。你必须优先依据用户提供的当前页内容和跨页证据作答，信息不足时要明确说明。"
      },
      {
        role: "user",
        content: buildUserPrompt(request)
      }
    ]
  };
}

export function parseOpenAiSseLines(buffer: string): { chunks: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const chunks: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    const parsed = JSON.parse(payload) as OpenAiStreamChunk;
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) {
      chunks.push(delta);
    }
  }
  return { chunks, rest };
}

export class OpenAiChatClient implements AiChatClient {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  public async answer(request: AskRequest, options?: { signal?: AbortSignal }): Promise<string> {
    const payload = buildRequestPayload(this.model, request, false);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    if (!response.ok) {
      throw new Error(`AI请求失败: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiResponse;
    const answer = data.choices[0]?.message.content;
    if (!answer) {
      throw new Error("AI返回内容为空");
    }
    return answer;
  }

  public async streamAnswer(
    request: AskRequest,
    handlers: {
      onDelta: (chunk: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const payload = buildRequestPayload(this.model, request, true);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: handlers.signal
    });
    if (!response.ok) {
      throw new Error(`AI请求失败: ${response.status}`);
    }
    if (!response.body) {
      throw new Error("AI流式通道不可用");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    let rest = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const parsed = parseOpenAiSseLines(rest);
      rest = parsed.rest;
      for (const chunk of parsed.chunks) {
        content += chunk;
        handlers.onDelta(chunk);
      }
    }
    const tail = parseOpenAiSseLines(rest + "\n");
    for (const chunk of tail.chunks) {
      content += chunk;
      handlers.onDelta(chunk);
    }
    if (!content.trim()) {
      throw new Error("AI返回内容为空");
    }
    return content;
  }
}
