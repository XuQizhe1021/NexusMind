import type { GraphExtractedEntity } from "./models";
import { isCandidateToken, normalizeCanonicalKey, sanitizeLabel } from "./normalize";

const SENTENCE_SPLIT_PATTERN = /[。！？!?;\n]+/;
const TOKEN_PATTERN = /[\p{Script=Han}]{2,12}|[A-Za-z][A-Za-z0-9\-]{1,30}/gu;
const MAX_ENTITY_COUNT = 2400;
const MAX_RELATION_PER_SENTENCE = 10;

export interface GraphExtractionResult {
  entities: GraphExtractedEntity[];
  relationKeys: string[];
}

function rankEntityKeys(counter: Map<string, number>): string[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTITY_COUNT)
    .map(([key]) => key);
}

function buildPairKey(left: string, right: string): string {
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

export function extractEntitiesAndRelations(pageText: string): GraphExtractionResult {
  const entityCounter = new Map<string, number>();
  const labelByKey = new Map<string, string>();
  const relationCounter = new Map<string, number>();

  for (const sentence of pageText.split(SENTENCE_SPLIT_PATTERN)) {
    const matches = sentence.match(TOKEN_PATTERN);
    if (!matches) {
      continue;
    }
    const sentenceKeys: string[] = [];
    for (const match of matches) {
      if (!isCandidateToken(match)) {
        continue;
      }
      const label = sanitizeLabel(match);
      const canonicalKey = normalizeCanonicalKey(label);
      entityCounter.set(canonicalKey, (entityCounter.get(canonicalKey) ?? 0) + 1);
      if (!labelByKey.has(canonicalKey)) {
        labelByKey.set(canonicalKey, label);
      }
      sentenceKeys.push(canonicalKey);
    }

    const uniqueSentenceKeys = [...new Set(sentenceKeys)].slice(0, MAX_RELATION_PER_SENTENCE);
    for (let i = 0; i < uniqueSentenceKeys.length; i += 1) {
      for (let j = i + 1; j < uniqueSentenceKeys.length; j += 1) {
        const pairKey = buildPairKey(uniqueSentenceKeys[i], uniqueSentenceKeys[j]);
        relationCounter.set(pairKey, (relationCounter.get(pairKey) ?? 0) + 1);
      }
    }
  }

  const topEntityKeys = new Set(rankEntityKeys(entityCounter));
  const entities: GraphExtractedEntity[] = [...topEntityKeys].map((canonicalKey) => ({
    canonicalKey,
    rawLabel: labelByKey.get(canonicalKey) ?? canonicalKey
  }));

  const relationKeys = [...relationCounter.entries()]
    .filter(([pairKey]) => {
      const [left, right] = pairKey.split("::");
      return topEntityKeys.has(left) && topEntityKeys.has(right);
    })
    .sort((a, b) => b[1] - a[1])
    .map(([pairKey]) => pairKey);

  return { entities, relationKeys };
}
