import {makeSyncError, SyncContractError, type SyncError} from '../../src/sync/contracts.ts';
import {AuthVerificationError} from '../auth/identity.ts';
import {SyncRepositoryError} from '../maps/repository.ts';

export const MAX_API_REQUEST_BYTES = 1_916_384;

export class ApiRequestError extends Error {
  constructor(readonly code: 'invalid' | 'too_large') {
    super(code === 'too_large' ? 'The API request body exceeds its allowed size.' : 'The API request body is invalid.');
    this.name = 'ApiRequestError';
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new ApiRequestError('invalid');

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new ApiRequestError('invalid');
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) throw new ApiRequestError('invalid');
    if (declaredBytes > MAX_API_REQUEST_BYTES) throw new ApiRequestError('too_large');
  }
  if (!request.body) throw new ApiRequestError('invalid');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_API_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiRequestError('too_large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError('invalid');
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));
  } catch {
    throw new ApiRequestError('invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError('invalid');
  return value as Record<string, unknown>;
}

export function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some((key) => !accepted.has(key))) throw new ApiRequestError('invalid');
}

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {'cache-control': 'no-store', 'vary': 'Authorization'},
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AuthVerificationError) {
    const invalid = error.code === 'invalid_token';
    return jsonResponse({error: makeSyncError(invalid ? 'unauthenticated' : 'unavailable')}, invalid ? 401 : 503);
  }
  if (error instanceof ApiRequestError) {
    const syncError: SyncError = makeSyncError(error.code);
    return jsonResponse({error: syncError}, error.code === 'too_large' ? 413 : 400);
  }
  if (error instanceof SyncContractError) {
    const syncError: SyncError = makeSyncError(error.code);
    return jsonResponse({error: syncError}, error.code === 'too_large' ? 413 : 400);
  }
  if (error instanceof SyncRepositoryError) {
    if (error.code === 'not_found') return jsonResponse({error: makeSyncError('forbidden')}, 404);
    return jsonResponse({error: makeSyncError('conflict')}, 409);
  }
  return jsonResponse({error: makeSyncError('unavailable')}, 503);
}
