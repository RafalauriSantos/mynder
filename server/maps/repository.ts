import {createSyncPayload, validateSyncIdentity, validateSyncRevision, type SyncIdentity, type SyncMap} from '../../src/sync/contracts.ts';
import type {Document} from '../../src/document.ts';

export class SyncRepositoryError extends Error {
  constructor(readonly code: 'conflict' | 'not_found' | 'already_exists') {
    const messages = {
      conflict: 'A revisão do mapa mudou. Recupere a cópia local antes de tentar novamente.',
      not_found: 'O mapa não existe para esta conta.',
      already_exists: 'Já existe um mapa com este identificador nesta conta.',
    };
    super(messages[code]);
    this.name = 'SyncRepositoryError';
  }
}

type StoredMapRow = {
  map_id: string;
  document_json: string;
  revision: number;
  updated_at: number;
  deleted_at: number | null;
};

export class SyncRepository {
  constructor(private readonly db: D1Database) {}

  async list(identityValue: SyncIdentity): Promise<SyncMap[]> {
    const identity = validateSyncIdentity(identityValue);
    const result = await this.db.prepare(`
      SELECT map_id, document_json, revision, updated_at, deleted_at
      FROM sync_maps
      WHERE owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?)
      ORDER BY updated_at DESC, map_id ASC
    `).bind(identity.issuer, identity.subject).all<StoredMapRow>();
    return result.results.map((row) => this.toSyncMap(row));
  }

  async get(identityValue: SyncIdentity, mapIdValue: string): Promise<SyncMap | null> {
    const identity = validateSyncIdentity(identityValue);
    const mapId = this.validateMapId(mapIdValue);
    const row = await this.db.prepare(`
      SELECT map_id, document_json, revision, updated_at, deleted_at
      FROM sync_maps
      WHERE owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?) AND map_id = ?
    `).bind(identity.issuer, identity.subject, mapId).first<StoredMapRow>();
    return row ? this.toSyncMap(row) : null;
  }

  async create(identityValue: SyncIdentity, documentValue: Document): Promise<SyncMap> {
    const identity = validateSyncIdentity(identityValue);
    const payload = createSyncPayload(documentValue);
    const mapId = this.validateMapId(payload.document.id);
    const now = this.now();
    const ownerId = crypto.randomUUID();
    const result = await this.db.batch([
      this.db.prepare(`
        INSERT INTO sync_owners(owner_id, issuer, subject, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(issuer, subject) DO NOTHING
      `).bind(ownerId, identity.issuer, identity.subject, now),
      this.db.prepare(`
        INSERT INTO sync_maps(owner_id, map_id, document_json, revision, updated_at, deleted_at)
        VALUES (
          (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?),
          ?, ?, 1, ?, NULL
        )
        ON CONFLICT(owner_id, map_id) DO NOTHING
      `).bind(identity.issuer, identity.subject, mapId, payload.json, now),
    ]);
    const stored = await this.get(identity, mapId);
    if (!stored) throw new Error('The owner-scoped map insert did not persist.');
    if (result[1].meta.changes === 1 || this.samePayload(stored, payload.json)) return stored;
    throw new SyncRepositoryError('already_exists');
  }

  async update(identityValue: SyncIdentity, mapIdValue: string, expectedRevision: number, documentValue: Document): Promise<SyncMap> {
    const identity = validateSyncIdentity(identityValue);
    const {mapId, revision} = validateSyncRevision({mapId: mapIdValue, revision: expectedRevision});
    this.validateMapId(mapId);
    const payload = createSyncPayload(documentValue);
    if (payload.document.id !== mapId) throw new Error('The map identifier does not match its document.');
    const now = this.now();
    const result = await this.db.prepare(`
      UPDATE sync_maps
      SET document_json = ?, revision = revision + 1, updated_at = MAX(updated_at + 1, ?)
      WHERE owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?)
        AND map_id = ? AND revision = ? AND deleted_at IS NULL
    `).bind(payload.json, now, identity.issuer, identity.subject, mapId, revision).run();
    const stored = await this.get(identity, mapId);
    if (result.meta.changes === 1 && stored) return stored;
    if (!stored) throw new SyncRepositoryError('not_found');
    if (stored.revision === revision + 1 && stored.deletedAt === undefined && this.samePayload(stored, payload.json)) return stored;
    throw new SyncRepositoryError('conflict');
  }

  async tombstone(identityValue: SyncIdentity, mapIdValue: string, expectedRevision: number): Promise<SyncMap> {
    const identity = validateSyncIdentity(identityValue);
    const {mapId, revision} = validateSyncRevision({mapId: mapIdValue, revision: expectedRevision});
    this.validateMapId(mapId);
    const now = this.now();
    const result = await this.db.prepare(`
      UPDATE sync_maps
      SET revision = revision + 1,
          updated_at = MAX(updated_at + 1, ?),
          deleted_at = MAX(updated_at + 1, ?)
      WHERE owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?)
        AND map_id = ? AND revision = ? AND deleted_at IS NULL
    `).bind(now, now, identity.issuer, identity.subject, mapId, revision).run();
    const stored = await this.get(identity, mapId);
    if (result.meta.changes === 1 && stored) return stored;
    if (!stored) throw new SyncRepositoryError('not_found');
    if (stored.revision === revision + 1 && stored.deletedAt !== undefined) return stored;
    throw new SyncRepositoryError('conflict');
  }

  async restore(identityValue: SyncIdentity, mapIdValue: string, expectedRevision: number): Promise<SyncMap> {
    const identity = validateSyncIdentity(identityValue);
    const {mapId, revision} = validateSyncRevision({mapId: mapIdValue, revision: expectedRevision});
    this.validateMapId(mapId);
    const now = this.now();
    const result = await this.db.prepare(`
      UPDATE sync_maps
      SET revision = revision + 1, updated_at = MAX(updated_at + 1, ?), deleted_at = NULL
      WHERE owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?)
        AND map_id = ? AND revision = ? AND deleted_at IS NOT NULL
    `).bind(now, identity.issuer, identity.subject, mapId, revision).run();
    const stored = await this.get(identity, mapId);
    if (result.meta.changes === 1 && stored) return stored;
    if (!stored) throw new SyncRepositoryError('not_found');
    if (stored.revision === revision + 1 && stored.deletedAt === undefined) return stored;
    throw new SyncRepositoryError('conflict');
  }

  private toSyncMap(row: StoredMapRow): SyncMap {
    const document = createSyncPayload(JSON.parse(row.document_json)).document;
    if (document.id !== row.map_id || !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isSafeInteger(row.updated_at) || row.updated_at <= 0) {
      throw new Error('Stored sync map data violates its repository contract.');
    }
    return {
      document,
      revision: row.revision,
      updatedAt: row.updated_at,
      ...(row.deleted_at === null ? {} : {deletedAt: row.deleted_at}),
    };
  }

  private samePayload(map: SyncMap, json: string): boolean {
    return JSON.stringify(map.document) === json;
  }

  private validateMapId(value: string): string {
    if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).byteLength > 255) {
      throw new Error('The map identifier is invalid.');
    }
    return value;
  }

  private now(): number {
    const value = Date.now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('The server clock is invalid.');
    return value;
  }
}
