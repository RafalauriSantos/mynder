import {AuthVerificationError, verifyIdentityToken} from '../server/auth/identity.ts';
import {makeSyncError} from '../src/sync/contracts.ts';
import type {SyncApiContext, SyncApiEnv} from './api/types.ts';

function jsonError(value: unknown, status: number, challenge = false): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'vary': 'Authorization',
      ...(challenge ? {'www-authenticate': 'Bearer realm="mynder-api"'} : {}),
    },
  });
}

export const onRequest: PagesFunction<SyncApiEnv, string, SyncApiContext['data']> = async (context) => {
  const path = new URL(context.request.url).pathname;
  if (path !== '/api' && !path.startsWith('/api/')) return context.next();

  const authorization = context.request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) return jsonError({error: makeSyncError('unauthenticated')}, 401, true);

  try {
    context.data.syncIdentity = await verifyIdentityToken(match[1], {
      issuer: context.env.AUTH_ISSUER,
      audience: context.env.AUTH_AUDIENCE,
      jwksUrl: context.env.AUTH_JWKS_URL,
      requireVerifiedEmail: true,
    });
  } catch (error) {
    if (error instanceof AuthVerificationError && error.code === 'invalid_token') {
      return jsonError({error: makeSyncError('unauthenticated')}, 401, true);
    }
    return jsonError({error: makeSyncError('unavailable')}, 503);
  }
  return context.next();
};
