import { id as newId, type Document } from './domain/index';

export type SyncConfig = { apiUrl: string; token?: string };
export type RemoteMap = { document: Document; version: number };
export type MergeResult = { docs: Document[]; versions: Record<string, number>; added: number; replaced: number; keptLocal: number };

export class SyncAuthError extends Error {
  constructor() { super('Autenticação necessária.'); this.name = 'SyncAuthError'; }
}
export class SyncConflictError extends Error {
  constructor(message = 'A nuvem tem uma versão diferente deste mapa. Use “Carregar nuvem” antes de sincronizar.') { super(message); this.name = 'SyncConflictError'; }
}

const CONFIG_API = 'mynder-sync-api';
const CONFIG_TOKEN = 'mynder-sync-token';
const VERSIONS = 'mynder-sync-versions';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const apiUrl = localStorage.getItem(CONFIG_API);
    const token = localStorage.getItem(CONFIG_TOKEN);
    return apiUrl ? { apiUrl, token: token ?? undefined } : null;
  } catch { return null; }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(CONFIG_API, config.apiUrl.trim().replace(/\/+$/, '').replace(/\/mcp$/, ''));
  if (config.token?.trim()) localStorage.setItem(CONFIG_TOKEN, config.token.trim());
  else localStorage.removeItem(CONFIG_TOKEN);
}

export function clearSyncConfig(): void {
  for (const key of [CONFIG_API, CONFIG_TOKEN, VERSIONS]) localStorage.removeItem(key);
}

export function loadVersions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VERSIONS) ?? '{}') as Record<string, number>; } catch { return {}; }
}
export function saveVersions(versions: Record<string, number>): void {
  try { localStorage.setItem(VERSIONS, JSON.stringify(versions)); } catch { /* o sync continua; só perde o controle de versão */ }
}

function requestOptions(config: SyncConfig, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (config.token) headers.set('authorization', `Bearer ${config.token}`);
  return { ...init, headers, credentials: config.token ? 'omit' : 'include' };
}

export function beginLogin(config: SyncConfig): void {
  window.location.assign(`${config.apiUrl}/auth/login`);
}

async function send(config: SyncConfig, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${config.apiUrl}${path}`, requestOptions(config, init));
  if (response.status === 401) throw new SyncAuthError();
  if (response.status === 409) throw new SyncConflictError();
  return response;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Envia um mapa. Só sobrescreve a nuvem se a versão conhecida ainda for a atual. */
export async function pushMap(document: Document, config: SyncConfig, versions: Record<string, number>): Promise<number> {
  const known = versions[document.id];
  if (known === undefined) {
    const existing = await send(config, `/api/maps/${encodeURIComponent(document.id)}`);
    if (existing.ok) throw new SyncConflictError('Este mapa já existe na nuvem. Use “Carregar nuvem” antes de sincronizar.');
    if (existing.status !== 404) throw new Error(`Sincronização falhou (${existing.status}).`);
    const created = await send(config, '/api/maps', jsonInit('POST', { document }));
    if (!created.ok) throw new Error(`Sincronização falhou (${created.status}).`);
    return 1;
  }
  const updated = await send(config, `/api/maps/${encodeURIComponent(document.id)}`, jsonInit('PUT', { document, expectedVersion: known }));
  if (!updated.ok) throw new Error(`Sincronização falhou (${updated.status}).`);
  return known + 1;
}

export async function pullMaps(config: SyncConfig): Promise<RemoteMap[]> {
  const list = await send(config, '/api/maps');
  if (!list.ok) throw new Error(`Sincronização falhou (${list.status}).`);
  const summaries = (await list.json()) as Array<{ id: string }>;
  return Promise.all(summaries.map(async ({ id }) => {
    const response = await send(config, `/api/maps/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Não foi possível carregar o mapa (${response.status}).`);
    return (await response.json()) as RemoteMap;
  }));
}

/**
 * Combina mapas da nuvem com os locais sem perder edição: a versão mais recente vence e,
 * quando a nuvem substitui um mapa local diferente, a cópia local é preservada.
 */
export function mergeRemote(local: Document[], remote: RemoteMap[], versions: Record<string, number>): MergeResult {
  const docs = [...local];
  const nextVersions = { ...versions };
  let added = 0, replaced = 0, keptLocal = 0;
  for (const { document, version } of remote) {
    nextVersions[document.id] = version;
    const index = docs.findIndex(item => item.id === document.id);
    if (index < 0) { docs.push(document); added++; continue; }
    const current = docs[index];
    if (JSON.stringify({ ...current, updatedAt: 0 }) === JSON.stringify({ ...document, updatedAt: 0 })) continue;
    if (document.updatedAt > current.updatedAt) {
      docs[index] = document;
      docs.push({ ...current, id: newId(), title: `${current.title} (antes da nuvem)` });
      replaced++;
    } else keptLocal++;
  }
  return { docs, versions: nextVersions, added, replaced, keptLocal };
}
