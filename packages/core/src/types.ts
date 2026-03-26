export type AiProvider = "openai" | "claude" | "gemini";

export interface CostControlConfig {
  dailyLimit: number;
  monthlyLimit: number;
}

export type RewriteIntent = "learning" | "summary" | "distraction_free";

export interface SiteIntentRule {
  hostname: string;
  intent: RewriteIntent;
}

export interface RewriteConfig {
  defaultIntent: RewriteIntent;
  siteIntents: SiteIntentRule[];
}

export interface NexusMindSettings {
  provider: AiProvider;
  model: string;
  encryptedApiKey?: string;
  apiKeyIv?: string;
  apiKeySalt?: string;
  privacyMode: "strict" | "balanced";
  costControl: CostControlConfig;
  rewrite: RewriteConfig;
}

export interface AskRequest {
  question: string;
  pageText: string;
  evidence?: Array<{
    id: string;
    title: string;
    url: string;
    snippet: string;
  }>;
}

export interface AskResponse {
  answer: string;
}
