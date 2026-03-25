export interface GraphEntity {
  id: string;
  canonicalKey: string;
  label: string;
  aliases: string[];
  type: "term";
  pageRefCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphRelation {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: "co_occurs";
  weight: number;
  pageRefCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphPage {
  id: string;
  url: string;
  title: string;
  textLength: number;
  entityIds: string[];
  relationIds: string[];
  indexedAt: number;
  updatedAt: number;
}

export interface GraphExtractedEntity {
  rawLabel: string;
  canonicalKey: string;
}

export interface GraphIngestInput {
  url: string;
  title: string;
  pageText: string;
  indexedAt?: number;
}

export interface GraphIngestResult {
  pageId: string;
  entityCount: number;
  relationCount: number;
}

export interface GraphSearchResult {
  query: string;
  nodes: GraphEntity[];
  edges: GraphRelation[];
}
