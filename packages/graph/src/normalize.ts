const TOKEN_MIN_LENGTH = 2;
const TOKEN_MAX_LENGTH = 40;
const STOPWORDS = new Set([
  "的",
  "了",
  "和",
  "是",
  "在",
  "与",
  "及",
  "for",
  "and",
  "the",
  "that",
  "with",
  "from",
  "this",
  "you"
]);

function compactWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function normalizeCanonicalKey(input: string): string {
  return compactWhitespace(input).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
}

export function sanitizeLabel(input: string): string {
  return compactWhitespace(input).slice(0, TOKEN_MAX_LENGTH);
}

export function isCandidateToken(input: string): boolean {
  const label = sanitizeLabel(input);
  if (!label || label.length < TOKEN_MIN_LENGTH) {
    return false;
  }
  const canonical = normalizeCanonicalKey(label);
  if (!canonical || STOPWORDS.has(canonical)) {
    return false;
  }
  return canonical.length >= TOKEN_MIN_LENGTH && canonical.length <= TOKEN_MAX_LENGTH;
}
