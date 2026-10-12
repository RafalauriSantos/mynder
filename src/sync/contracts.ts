import {validate, type Document} from '../document.ts';

export type SyncIdentity = Readonly<{issuer: string; subject: string}>;
export type SyncRevision = Readonly<{mapId: string; revision: number}>;
export type SyncMap = Readonly<{
  document: Document;
  revision: number;
  updatedAt: number;
  deletedAt?: number;
}>;

export type SyncErrorCode = 'unauthenticated' | 'forbidden' | 'conflict' | 'too_large' | 'quota' | 'unavailable' | 'invalid';
export type SyncError = {
  [Code in SyncErrorCode]: Readonly<{code: Code; message: string; retryable: boolean}>
}[SyncErrorCode];

/** D1's documented row limit is 2,000,000 bytes; reserve headroom for row metadata. */
export const MAX_SYNC_DOCUMENT_BYTES = 1_900_000;

const safeErrorDetails: Record<SyncErrorCode, {message: string; retryable: boolean}> = {
  unauthenticated: {message: 'Entre na sua conta para sincronizar.', retryable: false},
  forbidden: {message: 'Você não tem acesso a este mapa.', retryable: false},
  conflict: {message: 'Este mapa mudou em outro dispositivo. Recupere a cópia local antes de tentar novamente.', retryable: false},
  too_large: {message: 'Este mapa ultrapassa o limite de tamanho para sincronização; a cópia local foi preservada.', retryable: false},
  quota: {message: 'O limite temporário do serviço foi atingido. As alterações locais continuam salvas.', retryable: true},
  unavailable: {message: 'Serviço temporariamente indisponível. As alterações locais continuam salvas.', retryable: true},
  invalid: {message: 'Os dados do mapa não podem ser sincronizados.', retryable: false},
};

export class SyncContractError extends Error {
  readonly code: 'too_large' | 'invalid';
  readonly actualBytes?: number;
  readonly limitBytes?: number;

  constructor(code: 'too_large' | 'invalid', details?: {actualBytes: number; limitBytes: number}) {
    super(code === 'too_large' ? safeErrorDetails.too_large.message : safeErrorDetails.invalid.message);
    this.name = 'SyncContractError';
    this.code = code;
    this.actualBytes = details?.actualBytes;
    this.limitBytes = details?.limitBytes;
  }
}

export function validateSyncIdentity(value: unknown): SyncIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyncContractError('invalid');
  rejectOwnershipFields(value);
  const input = value as Record<string, unknown>;
  if (typeof input.issuer !== 'string' || !input.issuer.trim() || typeof input.subject !== 'string' || !input.subject.trim()) {
    throw new SyncContractError('invalid');
  }
  return {issuer: input.issuer, subject: input.subject};
}

export function validateSyncRevision(value: unknown): SyncRevision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyncContractError('invalid');
  rejectOwnershipFields(value);
  const input = value as Record<string, unknown>;
  if (typeof input.mapId !== 'string' || !input.mapId.trim() || !Number.isSafeInteger(input.revision) || (input.revision as number) <= 0) {
    throw new SyncContractError('invalid');
  }
  return {mapId: input.mapId, revision: input.revision as number};
}

function rejectOwnershipFields(value: unknown): void {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (key.toLowerCase().replaceAll('_', '') === 'ownerid') throw new SyncContractError('invalid');
      pending.push(child);
    }
  }
}

export function createSyncPayload(value: unknown, limitBytes = MAX_SYNC_DOCUMENT_BYTES): {document: Document; json: string; bytes: number} {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 0) throw new SyncContractError('invalid');
  rejectOwnershipFields(value);

  let json: string;
  try {
    json = JSON.stringify(validate(value));
    if (typeof json !== 'string') throw new Error('not serializable');
  } catch {
    throw new SyncContractError('invalid');
  }

  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > limitBytes) throw new SyncContractError('too_large', {actualBytes: bytes, limitBytes});
  return {document: JSON.parse(json) as Document, json, bytes};
}

export function makeSyncError(code: SyncErrorCode): SyncError {
  const details = safeErrorDetails[code];
  return {code, ...details} as SyncError;
}
