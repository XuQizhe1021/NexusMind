import { settingsSchema } from "./schemas";
import type { NexusMindSettings, RewriteIntent, SiteIntentRule } from "./types";

export const DEFAULT_SETTINGS: NexusMindSettings = {
  provider: "openai",
  model: "gpt-4o-mini",
  privacyMode: "strict",
  costControl: {
    dailyLimit: 200,
    monthlyLimit: 5000
  },
  rewrite: {
    defaultIntent: "learning",
    siteIntents: []
  }
};

export function parseSettings(input: unknown): NexusMindSettings {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return DEFAULT_SETTINGS;
  }
  return parsed.data;
}

export function normalizeHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().trim();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

export function upsertSiteIntentRule(
  rules: SiteIntentRule[],
  hostname: string,
  intent: RewriteIntent
): SiteIntentRule[] {
  const normalizedHostname = hostname.toLowerCase().trim();
  if (!normalizedHostname) {
    return rules;
  }
  const filtered = rules.filter((rule) => rule.hostname !== normalizedHostname);
  filtered.push({ hostname: normalizedHostname, intent });
  return filtered.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

export function resolveRewriteIntent(settings: NexusMindSettings, pageUrl: string): RewriteIntent {
  const hostname = normalizeHostname(pageUrl);
  if (!hostname) {
    return settings.rewrite.defaultIntent;
  }
  const matched = settings.rewrite.siteIntents.find((rule) => rule.hostname === hostname);
  return matched?.intent ?? settings.rewrite.defaultIntent;
}
