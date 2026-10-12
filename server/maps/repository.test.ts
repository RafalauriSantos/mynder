import {applyD1Migrations} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {beforeAll, describe, expect, it} from 'vitest';
import {blank} from '../../src/document.ts';
import type {SyncIdentity} from '../../src/sync/contracts.ts';
import {SyncRepository} from './repository.ts';

const db = env.TEST_DB as unknown as D1Database;
const migrations = env.TEST_MIGRATIONS as Parameters<typeof applyD1Migrations>[1];
const repository = new SyncRepository(db);
const identityA: SyncIdentity = {issuer:'https://login.example.test',subject:'user-a'};
const identityB: SyncIdentity = {issuer:'https://login.example.test',subject:'user-b'};

beforeAll(async()=>applyD1Migrations(db,migrations));

describe('D1 migration and sync map repository',()=>{
  it('applies migrations repeatably and creates owner-scoped tables and index',async()=>{
    await applyD1Migrations(db,migrations);
    const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sync_owners','sync_maps') ORDER BY name").all<{name:string}>();
    const indexes=await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='sync_maps_owner_updated'").all<{name:string}>();
    expect(tables.results.map(row=>row.name)).toEqual(['sync_maps','sync_owners']);
    expect(indexes.results).toHaveLength(1);
  });

  it('creates, lists, reads, conditionally updates and detects stale revisions',async()=>{
    const document=blank('Plano inicial');
    const created=await repository.create(identityA,document);
    expect(created.revision).toBe(1);
    expect(created.deletedAt).toBeUndefined();
    expect((await repository.list(identityA)).map(map=>map.document.id)).toContain(document.id);
    expect(await repository.get(identityA,document.id)).toEqual(created);

    const changed={...document,title:'Plano atualizado'};
    const updated=await repository.update(identityA,document.id,1,changed);
    expect(updated.revision).toBe(2);
    expect(updated.document.title).toBe('Plano atualizado');
    await expect(repository.update(identityA,document.id,1,{...changed,title:'Edição obsoleta'})).rejects.toMatchObject({code:'conflict'});
    expect((await repository.get(identityA,document.id))?.document.title).toBe('Plano atualizado');
  });

  it('allows only one concurrent update for the same expected revision',async()=>{
    const document=blank('Concorrente');
    await repository.create({...identityA,subject:'concurrent-user'},document);
    const identity={...identityA,subject:'concurrent-user'};
    const outcomes=await Promise.allSettled([
      repository.update(identity,document.id,1,{...document,title:'Edição A'}),
      repository.update(identity,document.id,1,{...document,title:'Edição B'}),
    ]);

    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result=>result.status==='rejected')).toHaveLength(1);
    expect((await repository.get(identity,document.id))?.revision).toBe(2);
  });

  it('isolates identical map IDs by verified identity for reads and mutations',async()=>{
    const documentA=blank('Mapa da conta A');
    const documentB={...documentA,title:'Mapa da conta B'};
    const savedA=await repository.create(identityA,documentA);
    const savedB=await repository.create(identityB,documentB);

    expect(savedB.document.id).toBe(savedA.document.id);
    expect((await repository.list(identityB)).map(map=>map.document.title)).toEqual(['Mapa da conta B']);
    expect(await repository.get(identityB,documentA.id)).toEqual(savedB);
    await expect(repository.update(identityB,documentA.id,1,{...documentB,title:'Ataque'})).resolves.toMatchObject({document:{title:'Ataque'}});
    expect((await repository.get(identityA,documentA.id))?.document.title).toBe('Mapa da conta A');
    expect(await repository.get({...identityB,subject:'user-c'},documentA.id)).toBeNull();
  });

  it('returns not_found when another identity tries to mutate a private map',async()=>{
    const document=blank('Somente A');
    await repository.create(identityA,document);
    await expect(repository.update(identityB,document.id,1,{...document,title:'Não autorizado'})).rejects.toMatchObject({code:'not_found'});
    await expect(repository.tombstone(identityB,document.id,1)).rejects.toMatchObject({code:'not_found'});
    await expect(repository.restore(identityB,document.id,1)).rejects.toMatchObject({code:'not_found'});
    expect((await repository.get(identityA,document.id))?.document.title).toBe('Somente A');
  });

  it('tombstones and restores with monotonic revisions and idempotent retries',async()=>{
    const document=blank('Recuperável');
    await repository.create(identityA,document);
    const removed=await repository.tombstone(identityA,document.id,1);
    expect(removed.revision).toBe(2);
    expect(removed.deletedAt).toBeGreaterThan(0);
    expect(await repository.tombstone(identityA,document.id,1)).toEqual(removed);
    expect((await repository.list(identityA)).find(map=>map.document.id===document.id)).toEqual(removed);

    const restored=await repository.restore(identityA,document.id,2);
    expect(restored.revision).toBe(3);
    expect(restored.deletedAt).toBeUndefined();
    expect(await repository.restore(identityA,document.id,2)).toEqual(restored);
    await expect(repository.restore(identityA,document.id,1)).rejects.toMatchObject({code:'conflict'});
  });

  it('accepts the sync byte ceiling with row metadata below the D1 row limit',async()=>{
    const document=blank('Grande');
    document.markdown='x'.repeat(1_899_000);
    const created=await repository.create({...identityA,subject:'large-map-user'},document);
    const size=await db.prepare('SELECT length(CAST(document_json AS BLOB)) AS bytes FROM sync_maps WHERE map_id = ? AND owner_id = (SELECT owner_id FROM sync_owners WHERE issuer = ? AND subject = ?)').bind(document.id,identityA.issuer,'large-map-user').first<{bytes:number}>();

    expect(created.revision).toBe(1);
    expect(size?.bytes).toBeGreaterThan(1_800_000);
    expect(size?.bytes).toBeLessThanOrEqual(1_900_000);
  });
});
