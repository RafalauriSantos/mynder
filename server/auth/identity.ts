import {createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload} from 'jose';
import {validateSyncIdentity, type SyncIdentity} from '../../src/sync/contracts.ts';

export type IdentityVerificationConfig = Readonly<{
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  nonce?: string;
}>;

export class AuthVerificationError extends Error {
  constructor(readonly code: 'configuration' | 'invalid_token' | 'unavailable') {
    const messages = {
      configuration: 'A autenticação da sincronização não está configurada.',
      invalid_token: 'A sessão é inválida ou expirou. Entre novamente para sincronizar.',
      unavailable: 'O serviço de autenticação está temporariamente indisponível.',
    };
    super(messages[code]);
    this.name = 'AuthVerificationError';
  }
}

const MAX_BEARER_TOKEN_BYTES = 8_192;
const allowedAlgorithms = ['RS256', 'ES256'];
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const invalidTokenCodes = new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWKS_NO_MATCHING_KEY',
]);

function configuredHttpsUrl(value: string | undefined): URL {
  if (!value) throw new AuthVerificationError('configuration');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthVerificationError('configuration');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new AuthVerificationError('configuration');
  }
  return url;
}

function getRemoteKeySet(url: URL, fetcher?: typeof fetch): ReturnType<typeof createRemoteJWKSet> {
  if (!fetcher) {
    const cached = keySets.get(url.href);
    if (cached) return cached;
  }

  const trustedFetch: typeof fetch = async (input, init) => {
    let response: Response;
    try {
      response = await (fetcher ?? fetch)(input, init);
    } catch {
      throw new AuthVerificationError('unavailable');
    }
    if (response.status !== 200) throw new AuthVerificationError('unavailable');
    return response;
  };

  const remote = createRemoteJWKSet(url, {
    [customFetch]: trustedFetch,
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 300_000,
  });
  if (!fetcher) keySets.set(url.href, remote);
  return remote;
}

export async function verifyIdentityToken(
  token: string,
  config: IdentityVerificationConfig,
  fetcher?: typeof fetch,
): Promise<SyncIdentity> {
  if (typeof token !== 'string' || !token || new TextEncoder().encode(token).byteLength > MAX_BEARER_TOKEN_BYTES) {
    throw new AuthVerificationError('invalid_token');
  }
  if (!config.audience?.trim()) throw new AuthVerificationError('configuration');
  const issuerUrl = configuredHttpsUrl(config.issuer);
  const jwksUrl = configuredHttpsUrl(config.jwksUrl);
  const remoteKeySet = getRemoteKeySet(jwksUrl, fetcher);

  let payload: JWTPayload;
  try {
    ({payload} = await jwtVerify(token, remoteKeySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: allowedAlgorithms,
      requiredClaims: ['exp', 'sub'],
      clockTolerance: 30,
    }));
  } catch (error) {
    if (error instanceof AuthVerificationError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (invalidTokenCodes.has(code)) throw new AuthVerificationError('invalid_token');
    throw new AuthVerificationError('unavailable');
  }

  try {
    if (config.nonce !== undefined && (!config.nonce || payload.nonce !== config.nonce)) {
      throw new AuthVerificationError('invalid_token');
    }
    return validateSyncIdentity({issuer: payload.iss, subject: payload.sub});
  } catch {
    throw new AuthVerificationError('invalid_token');
  }
}
