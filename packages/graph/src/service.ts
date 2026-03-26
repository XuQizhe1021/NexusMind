import { extractEntitiesAndRelations } from "./extractor";
import { NexusMindGraphDb } from "./db";
import type {
  GraphEntity,
  GraphQaEvidenceResult,
  GraphQaEvidenceSource,
  GraphIngestInput,
  GraphIngestResult,
  GraphPage,
  GraphRelation,
  GraphSearchResult
} from "./models";
import { normalizeCanonicalKey, sanitizeLabel } from "./normalize";

function pageIdFromUrl(url: string): string {
  return url.trim().toLowerCase();
}

function relationIdOf(sourceEntityId: string, targetEntityId: string): string {
  return sourceEntityId < targetEntityId
    ? `${sourceEntityId}|co_occurs|${targetEntityId}`
    : `${targetEntityId}|co_occurs|${sourceEntityId}`;
}

function normalizeSampleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractQuestionTerms(question: string): string[] {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const terms = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z][a-z0-9_-]{1,}/g) ?? [];
  return [...new Set(terms)].slice(0, 8);
}

function buildSnippet(sample: string, entityLabels: string[]): string {
  const text = normalizeSampleText(sample);
  if (!text) {
    return "";
  }
  for (const label of entityLabels) {
    const keyword = label.trim();
    if (!keyword) {
      continue;
    }
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) {
      continue;
    }
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + keyword.length + 80);
    return text.slice(start, end);
  }
  return text.slice(0, 120);
}

async function incrementEntityRef(db: NexusMindGraphDb, entityId: string, now: number): Promise<void> {
  const entity = await db.entities.get(entityId);
  if (!entity) {
    return;
  }
  await db.entities.put({
    ...entity,
    pageRefCount: entity.pageRefCount + 1,
    updatedAt: now
  });
}

async function decrementEntityRef(db: NexusMindGraphDb, entityId: string, now: number): Promise<void> {
  const entity = await db.entities.get(entityId);
  if (!entity) {
    return;
  }
  const nextCount = entity.pageRefCount - 1;
  if (nextCount <= 0) {
    await db.entities.delete(entity.id);
    return;
  }
  await db.entities.put({
    ...entity,
    pageRefCount: nextCount,
    updatedAt: now
  });
}

async function incrementRelationRef(db: NexusMindGraphDb, relationId: string, now: number): Promise<void> {
  const relation = await db.relations.get(relationId);
  if (!relation) {
    return;
  }
  await db.relations.put({
    ...relation,
    pageRefCount: relation.pageRefCount + 1,
    weight: relation.weight + 1,
    updatedAt: now
  });
}

async function decrementRelationRef(db: NexusMindGraphDb, relationId: string, now: number): Promise<void> {
  const relation = await db.relations.get(relationId);
  if (!relation) {
    return;
  }
  const nextCount = relation.pageRefCount - 1;
  if (nextCount <= 0) {
    await db.relations.delete(relation.id);
    return;
  }
  await db.relations.put({
    ...relation,
    pageRefCount: nextCount,
    weight: Math.max(1, relation.weight - 1),
    updatedAt: now
  });
}

export class NexusMindGraphService {
  private readonly db: NexusMindGraphDb;

  constructor(dbName?: string) {
    this.db = new NexusMindGraphDb(dbName);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async clearAll(): Promise<void> {
    await this.db.transaction("rw", this.db.entities, this.db.relations, this.db.pages, async () => {
      await this.db.entities.clear();
      await this.db.relations.clear();
      await this.db.pages.clear();
    });
  }

  async ingestPage(input: GraphIngestInput): Promise<GraphIngestResult> {
    const now = input.indexedAt ?? Date.now();
    const pageId = pageIdFromUrl(input.url);
    const extraction = extractEntitiesAndRelations(input.pageText);

    // 先回收旧页面的实体/关系引用，再写入新索引，确保重复收录可回滚且不累加脏数据。
    await this.db.transaction("rw", this.db.entities, this.db.relations, this.db.pages, async () => {
      const previousPage = await this.db.pages.get(pageId);
      if (previousPage) {
        for (const entityId of previousPage.entityIds) {
          await decrementEntityRef(this.db, entityId, now);
        }
        for (const relationId of previousPage.relationIds) {
          await decrementRelationRef(this.db, relationId, now);
        }
      }

      const entityIds: string[] = [];
      for (const item of extraction.entities) {
        const canonicalKey = normalizeCanonicalKey(item.canonicalKey);
        const existing = await this.db.entities.where("canonicalKey").equals(canonicalKey).first();
        if (existing) {
          const aliases = existing.aliases.includes(item.rawLabel)
            ? existing.aliases
            : [...existing.aliases, sanitizeLabel(item.rawLabel)];
          await this.db.entities.put({
            ...existing,
            aliases,
            label: existing.label.length >= item.rawLabel.length ? existing.label : sanitizeLabel(item.rawLabel),
            updatedAt: now
          });
          await incrementEntityRef(this.db, existing.id, now);
          entityIds.push(existing.id);
          continue;
        }

        const newEntity: GraphEntity = {
          id: canonicalKey,
          canonicalKey,
          label: sanitizeLabel(item.rawLabel),
          aliases: [sanitizeLabel(item.rawLabel)],
          type: "term",
          pageRefCount: 1,
          createdAt: now,
          updatedAt: now
        };
        await this.db.entities.add(newEntity);
        entityIds.push(newEntity.id);
      }

      const relationIds: string[] = [];
      const deduplicatedEntityIds = [...new Set(entityIds)];
      const idByCanonicalKey = new Map<string, string>(deduplicatedEntityIds.map((id) => [id, id]));

      for (const pairKey of extraction.relationKeys) {
        const [leftKey, rightKey] = pairKey.split("::");
        const sourceEntityId = idByCanonicalKey.get(leftKey);
        const targetEntityId = idByCanonicalKey.get(rightKey);
        if (!sourceEntityId || !targetEntityId || sourceEntityId === targetEntityId) {
          continue;
        }

        const relationId = relationIdOf(sourceEntityId, targetEntityId);
        const existingRelation = await this.db.relations.get(relationId);
        if (existingRelation) {
          await incrementRelationRef(this.db, existingRelation.id, now);
          relationIds.push(existingRelation.id);
          continue;
        }

        const relation: GraphRelation = {
          id: relationId,
          sourceEntityId: sourceEntityId < targetEntityId ? sourceEntityId : targetEntityId,
          targetEntityId: sourceEntityId < targetEntityId ? targetEntityId : sourceEntityId,
          relationType: "co_occurs",
          weight: 1,
          pageRefCount: 1,
          createdAt: now,
          updatedAt: now
        };
        await this.db.relations.add(relation);
        relationIds.push(relation.id);
      }

      const nextPage: GraphPage = {
        id: pageId,
        url: input.url,
        title: sanitizeLabel(input.title) || input.url,
        textLength: input.pageText.length,
        contentSample: normalizeSampleText(input.pageText).slice(0, 8000),
        entityIds: [...new Set(entityIds)],
        relationIds: [...new Set(relationIds)],
        indexedAt: now,
        updatedAt: now
      };
      await this.db.pages.put(nextPage);
    });

    const page = await this.db.pages.get(pageId);
    return {
      pageId,
      entityCount: page?.entityIds.length ?? 0,
      relationCount: page?.relationIds.length ?? 0
    };
  }

  async search(query: string): Promise<GraphSearchResult> {
    const normalized = normalizeCanonicalKey(query);
    if (!normalized) {
      return { query, nodes: [], edges: [] };
    }

    const directMatches = await this.db.entities
      .where("canonicalKey")
      .startsWith(normalized)
      .or("label")
      .startsWithIgnoreCase(query.trim())
      .limit(25)
      .toArray();

    const matchedIds = new Set(directMatches.map((item) => item.id));
    const allEdges = await this.db.relations
      .filter((edge) => matchedIds.has(edge.sourceEntityId) || matchedIds.has(edge.targetEntityId))
      .limit(80)
      .toArray();

    const allNodeIds = new Set<string>([...matchedIds]);
    for (const edge of allEdges) {
      allNodeIds.add(edge.sourceEntityId);
      allNodeIds.add(edge.targetEntityId);
    }

    const allNodes = await this.db.entities.bulkGet([...allNodeIds]);
    const nodes = allNodes.filter((item): item is GraphEntity => Boolean(item));
    return {
      query,
      nodes,
      edges: allEdges
    };
  }

  async getStats(): Promise<{ entities: number; relations: number; pages: number }> {
    const [entities, relations, pages] = await Promise.all([
      this.db.entities.count(),
      this.db.relations.count(),
      this.db.pages.count()
    ]);
    return { entities, relations, pages };
  }

  async buildQaEvidence(question: string): Promise<GraphQaEvidenceResult> {
    const terms = extractQuestionTerms(question);
    const results = await Promise.all(
      terms.map(async (term) => {
        const searchResult = await this.search(term);
        return searchResult;
      })
    );

    const nodeMap = new Map<string, GraphEntity>();
    const edgeMap = new Map<string, GraphRelation>();
    for (const item of results) {
      for (const node of item.nodes) {
        nodeMap.set(node.id, node);
      }
      for (const edge of item.edges) {
        edgeMap.set(edge.id, edge);
      }
    }

    const entities = [...nodeMap.values()];
    const edges = [...edgeMap.values()];
    const matchedIds = new Set(entities.map((item) => item.id));
    if (matchedIds.size === 0) {
      return {
        question,
        entities: [],
        edges: [],
        sources: []
      };
    }

    const pages = await this.db.pages
      .filter((page) => page.entityIds.some((entityId) => matchedIds.has(entityId)))
      .toArray();
    const labelByEntityId = new Map(entities.map((item) => [item.id, item.label]));
    const sourceItems: GraphQaEvidenceSource[] = pages
      .map((page) => {
        const matchedEntityIds = page.entityIds.filter((entityId) => matchedIds.has(entityId)).slice(0, 8);
        const entityLabels = matchedEntityIds.map((entityId) => labelByEntityId.get(entityId) ?? "");
        const snippet = buildSnippet(page.contentSample ?? "", entityLabels);
        const relationMatchCount = page.relationIds.filter((relationId) => edgeMap.has(relationId)).length;
        const score = matchedEntityIds.length * 3 + relationMatchCount * 2 + Math.min(20, page.textLength / 1500);
        return {
          id: page.id,
          url: page.url,
          title: page.title,
          snippet,
          matchedEntityIds,
          score
        };
      })
      .filter((item) => item.snippet.length > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);

    return {
      question,
      entities,
      edges,
      sources: sourceItems
    };
  }
}
