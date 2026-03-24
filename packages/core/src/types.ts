export type AiProvider = "openai" | "claude" | "gemini";

export interface CostControlConfig {
  dailyLimit: number;
  monthlyLimit: number;
}

export interface NexusMindSettings {
  provider: AiProvider;
  model: string;
  encryptedApiKey?: string;
  apiKeyIv?: string;
  apiKeySalt?: string;
  privacyMode: "strict" | "balanced";
  costControl: CostControlConfig;
}

export interface AskRequest {
  question: string;
  pageText: string;
}

export interface AskResponse {
  answer: string;
}
