import type { AskRequest } from "@nexusmind/core/types";

export interface AiChatClient {
  answer(request: AskRequest): Promise<string>;
}

interface OpenAiRequest {
  model: string;
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  temperature: number;
}

interface OpenAiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAiChatClient implements AiChatClient {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  public async answer(request: AskRequest): Promise<string> {
    // 控制上下文长度，优先保证请求稳定可达，后续阶段再切分为检索增强流程。
    const payload: OpenAiRequest = {
      model: this.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是NexusMind浏览器助手。请基于用户提供的页面内容回答，若信息不足要明确指出。"
        },
        {
          role: "user",
          content: `问题：${request.question}\n\n页面内容：${request.pageText.slice(0, 16000)}`
        }
      ]
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
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
}
