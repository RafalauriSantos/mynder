import { describe, expect, it } from 'vitest';
import worker from './index';

const env = { DB: {} as D1Database, MCP_ALLOWED_ORIGIN: 'https://mynder.pages.dev' };
const ctx = {} as ExecutionContext;

describe('mynder MCP worker', () => {
  it('reports health without exposing configuration', async () => {
    const response = await worker.fetch(new Request('https://mynder-mcp.test/health'), env, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'mynder-mcp' });
  });

  it('rejects the MCP route without authentication', async () => {
    const response = await worker.fetch(new Request('https://mynder-mcp.test/mcp'), env, ctx);
    expect(response.status).toBe(401);
  });

  it('answers CORS preflight for the maps API with 204 and the allowed origin', async () => {
    const response = await worker.fetch(new Request('https://mynder-mcp.test/api/maps', { method: 'OPTIONS', headers: { origin: 'https://mynder.pages.dev' } }), env, ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mynder.pages.dev');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('rejects the maps API without credentials, keeping CORS headers', async () => {
    const response = await worker.fetch(new Request('https://mynder-mcp.test/api/maps'), env, ctx);
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mynder.pages.dev');
  });
});
