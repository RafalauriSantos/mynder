import type { Env } from './env';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { validate, type Document } from '../../src/domain/index';
import { registerTools } from './mcp/tools';
import { authenticateApi } from './mcp/auth';
import { callback, googleCallback, googleLogin, login, logout } from './auth/session';
import { createMap, getMapRecord, listMaps, updateMap } from './db/maps';

function server(env: Env, ownerId: string) {
  const mcp = new McpServer({ name: 'mynder', version: '0.2.0' });
  registerTools(mcp, env, ownerId);
  return mcp;
}

/** Origem permitida: a configurada, previews do próprio projeto Pages e localhost (desenvolvimento). */
export function resolveOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return env.MCP_ALLOWED_ORIGIN;
  if (origin === env.MCP_ALLOWED_ORIGIN) return origin;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === 'https:' && /^[a-z0-9-]+\.mynder\.pages\.dev$/.test(hostname)) return origin;
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
  } catch { /* origem inválida */ }
  return env.MCP_ALLOWED_ORIGIN;
}

function corsHeaders(origin?: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin ?? 'null', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', Vary: 'Origin' };
}

function json(data: unknown, status = 200, origin?: string): Response {
  // Respostas 204 não podem ter corpo; Response.json lançaria TypeError.
  if (status === 204) return new Response(null, { status, headers: corsHeaders(origin) });
  return Response.json(data, { status, headers: corsHeaders(origin) });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ ok: true, service: 'mynder-mcp' });
    }
    if (url.pathname === '/auth/login' && request.method === 'GET') return login(request, env);
    if (url.pathname === '/auth/callback' && request.method === 'GET') return callback(request, env);
    if (url.pathname === '/auth/google/login' && request.method === 'GET') return googleLogin(request, env);
    if (url.pathname === '/auth/google/callback' && request.method === 'GET') return googleCallback(request, env);
    if (url.pathname === '/auth/logout' && request.method === 'GET') return logout(request, env);
    if (url.pathname === '/auth/me' && request.method === 'GET') {
      const ownerId = await authenticateApi(request, env);
      return json(ownerId ? { authenticated: true, ownerId } : { authenticated: false }, ownerId ? 200 : 401, env.MCP_ALLOWED_ORIGIN);
    }
    if (url.pathname === '/mcp') {
      const ownerId = await authenticateApi(request, env);
      if (!ownerId) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
      return createMcpHandler(() => server(env, ownerId), { route: '/mcp' })(request, env, ctx);
    }
    if (url.pathname.startsWith('/api/maps')) {
      const allowedOrigin = resolveOrigin(request, env);
      if (request.method === 'OPTIONS') return json(null, 204, allowedOrigin);
      const ownerId = await authenticateApi(request, env);
      if (!ownerId) return json({ error: 'Unauthorized' }, 401, allowedOrigin);
      if (request.method === 'GET' && url.pathname === '/api/maps') return json(await listMaps(env.DB, ownerId), 200, allowedOrigin);
      const mapId = url.pathname.split('/').at(-1);
      if (request.method === 'POST' && url.pathname === '/api/maps') {
        try { const body = await request.json() as { document?: unknown }; if (!body.document) return json({ error: 'document is required' }, 400, allowedOrigin); return json(await createMap(env.DB, ownerId, validate(body.document) as Document), 201, allowedOrigin); }
        catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid map' }, 400, allowedOrigin); }
      }
      if (request.method === 'GET' && mapId) {
        const record = await getMapRecord(env.DB, ownerId, mapId);
        return record ? json(record, 200, allowedOrigin) : json({ error: 'Not found' }, 404, allowedOrigin);
      }
      if (request.method === 'PUT' && mapId) {
        try {
          const body = await request.json() as { document?: unknown; expectedVersion?: number };
          if (!body.document || !body.expectedVersion) return json({ error: 'document and expectedVersion are required' }, 400, allowedOrigin);
          return json(await updateMap(env.DB, ownerId, mapId, validate(body.document) as Document, body.expectedVersion), 200, allowedOrigin);
        } catch (error) {
          const conflict = error instanceof Error && error.message === 'MAP_NOT_FOUND_OR_VERSION_CONFLICT';
          return json({ error: error instanceof Error ? error.message : 'Invalid map' }, conflict ? 409 : 400, allowedOrigin);
        }
      }
      return json({ error: 'Not found' }, 404, allowedOrigin);
    }
    return new Response('Not found', { status: 404 });
  },
};
