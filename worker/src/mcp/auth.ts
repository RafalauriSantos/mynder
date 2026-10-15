import type { Env } from '../env';
import { ownerFromSession } from '../auth/session';

export function authenticate(request: Request, env: Env): string | null {
  const configured = env.MCP_BEARER_TOKEN;
  const ownerId = env.MCP_OWNER_ID;
  const header = request.headers.get('authorization');
  if (!configured || !ownerId || !header?.startsWith('Bearer ')) return null;
  return header.slice(7) === configured ? ownerId : null;
}

export async function authenticateApi(request: Request, env: Env): Promise<string | null> {
  return authenticate(request, env) ?? await ownerFromSession(request, env);
}
