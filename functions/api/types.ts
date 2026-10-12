import {AuthVerificationError} from '../../server/auth/identity.ts';
import type {SyncIdentity} from '../../src/sync/contracts.ts';

export type SyncApiEnv = {
  DB: D1Database;
  AUTH_ISSUER?: string;
  AUTH_AUDIENCE?: string;
  AUTH_JWKS_URL?: string;
};

export type SyncApiData = Record<string, unknown> & {syncIdentity?: SyncIdentity};
export type SyncApiContext = EventContext<SyncApiEnv, string, SyncApiData>;

export function requireSyncIdentity(data: SyncApiData): SyncIdentity {
  if (!data.syncIdentity) throw new AuthVerificationError('invalid_token');
  return data.syncIdentity;
}
