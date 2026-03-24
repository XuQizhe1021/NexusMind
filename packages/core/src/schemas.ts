import { z } from "zod";

export const costControlSchema = z.object({
  dailyLimit: z.number().int().positive().max(100000),
  monthlyLimit: z.number().int().positive().max(1000000)
});

export const settingsSchema = z.object({
  provider: z.enum(["openai", "claude", "gemini"]),
  model: z.string().min(1).max(120),
  encryptedApiKey: z.string().min(1).optional(),
  apiKeyIv: z.string().min(1).optional(),
  apiKeySalt: z.string().min(1).optional(),
  privacyMode: z.enum(["strict", "balanced"]),
  costControl: costControlSchema
});

export const saveSettingsPayloadSchema = z.object({
  provider: z.enum(["openai", "claude", "gemini"]),
  model: z.string().min(1).max(120),
  apiKey: z.string().min(1).max(500),
  privacyMode: z.enum(["strict", "balanced"]),
  dailyLimit: z.number().int().positive().max(100000),
  monthlyLimit: z.number().int().positive().max(1000000)
});

export type SettingsSchema = z.infer<typeof settingsSchema>;
export type SaveSettingsPayloadSchema = z.infer<typeof saveSettingsPayloadSchema>;
