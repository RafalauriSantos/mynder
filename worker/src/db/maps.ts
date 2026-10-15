import type { Document } from '../../../src/domain/index';
import { validate } from '../../../src/domain/index';

export type MapSummary = { id: string; title: string; version: number; updatedAt: number };

export async function listMaps(db: D1Database, ownerId: string): Promise<MapSummary[]> {
  const result = await db.prepare(
    'SELECT id, title, version, updated_at FROM maps WHERE owner_id = ? ORDER BY updated_at DESC'
  ).bind(ownerId).all<MapSummary & { updated_at: number }>();
  return result.results.map((row) => ({ id: row.id, title: row.title, version: row.version, updatedAt: row.updated_at }));
}

export async function getMap(db: D1Database, ownerId: string, mapId: string): Promise<Document | null> {
  const row = await db.prepare('SELECT document_json FROM maps WHERE owner_id = ? AND id = ?').bind(ownerId, mapId).first<{ document_json: string }>();
  return row ? validate(JSON.parse(row.document_json)) : null;
}

export async function getMapRecord(db: D1Database, ownerId: string, mapId: string): Promise<{ document: Document; version: number } | null> {
  const row = await db.prepare('SELECT document_json, version FROM maps WHERE owner_id = ? AND id = ?').bind(ownerId, mapId).first<{ document_json: string; version: number }>();
  return row ? { document: validate(JSON.parse(row.document_json)), version: row.version } : null;
}

export async function createMap(db: D1Database, ownerId: string, document: Document): Promise<Document> {
  const valid = validate(document);
  const now = Date.now();
  await db.prepare('INSERT INTO maps (id, owner_id, title, document_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(valid.id, ownerId, valid.title, JSON.stringify(valid), now, now).run();
  return valid;
}

export async function updateMap(db: D1Database, ownerId: string, mapId: string, document: Document, expectedVersion: number): Promise<Document> {
  const valid = validate(document);
  const result = await db.prepare('UPDATE maps SET title = ?, document_json = ?, version = version + 1, updated_at = ? WHERE owner_id = ? AND id = ? AND version = ?')
    .bind(valid.title, JSON.stringify(valid), Date.now(), ownerId, mapId, expectedVersion).run();
  if (!result.meta.changes) throw new Error('MAP_NOT_FOUND_OR_VERSION_CONFLICT');
  return valid;
}

export async function deleteMap(db: D1Database, ownerId: string, mapId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM maps WHERE owner_id = ? AND id = ?').bind(ownerId, mapId).run();
  return result.meta.changes > 0;
}

/** Lê, aplica a edição e grava com controle de versão; refaz a leitura se outra gravação passar na frente. */
export async function mutateMap(db: D1Database, ownerId: string, mapId: string, edit: (document: Document) => Document): Promise<{ document: Document; version: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await getMapRecord(db, ownerId, mapId);
    if (!record) throw new Error('Mapa não encontrado.');
    const next = validate({ ...edit(record.document), id: mapId });
    try {
      await updateMap(db, ownerId, mapId, next, record.version);
      return { document: next, version: record.version + 1 };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'MAP_NOT_FOUND_OR_VERSION_CONFLICT') throw error;
    }
  }
  throw new Error('Conflito de versão persistente; tente novamente.');
}
