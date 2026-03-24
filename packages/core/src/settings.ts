import { settingsSchema } from "./schemas";
import type { NexusMindSettings } from "./types";

export const DEFAULT_SETTINGS: NexusMindSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
  privacyMode: "strict",
  costControl: {
    dailyLimit: 200,
    monthlyLimit: 5000
  }
};

export function parseSettings(input: unknown): NexusMindSettings {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return DEFAULT_SETTINGS;
  }
  return parsed.data;
}
