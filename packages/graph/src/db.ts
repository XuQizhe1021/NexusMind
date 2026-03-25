import Dexie, { type EntityTable } from "dexie";
import type { GraphEntity, GraphPage, GraphRelation } from "./models";

export class NexusMindGraphDb extends Dexie {
  entities!: EntityTable<GraphEntity, "id">;
  relations!: EntityTable<GraphRelation, "id">;
  pages!: EntityTable<GraphPage, "id">;

  constructor(dbName = "nexusmind_graph") {
    super(dbName);
    this.version(1).stores({
      entities: "id, canonicalKey, label, updatedAt",
      relations: "id, sourceEntityId, targetEntityId, relationType, updatedAt",
      pages: "id, url, indexedAt, updatedAt"
    });
  }
}
