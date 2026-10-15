import { describe, expect, it } from 'vitest';
import { authenticate } from './auth';

describe('MCP authentication', () => {
  const env = { DB: {} as D1Database, MCP_BEARER_TOKEN: 'secret', MCP_OWNER_ID: 'owner-1' };

  it('returns the configured owner for the exact bearer token', () => {
    expect(authenticate(new Request('https://mcp.test', { headers: { authorization: 'Bearer secret' } }), env)).toBe('owner-1');
  });

  it('rejects missing or incorrect credentials', () => {
    expect(authenticate(new Request('https://mcp.test'), env)).toBeNull();
    expect(authenticate(new Request('https://mcp.test', { headers: { authorization: 'Bearer wrong' } }), env)).toBeNull();
  });
});

describe('API authentication', () => {
  it('accepts a bearer token without touching the database', async () => {
    const env = { DB: {} as D1Database, MCP_BEARER_TOKEN: 'secret', MCP_OWNER_ID: 'owner-1' };
    const { authenticateApi } = await import('./auth');
    expect(await authenticateApi(new Request('https://mcp.test', { headers: { authorization: 'Bearer secret' } }), env)).toBe('owner-1');
  });

  it('accepts a valid session cookie and rejects an expired one', async () => {
    const { authenticateApi } = await import('./auth');
    const dbWith = (expires: number) => ({ prepare: () => ({ bind: () => ({ first: async () => ({ owner_id: 'github:1', expires_at: expires }) }) }) }) as unknown as D1Database;
    const request = new Request('https://mcp.test', { headers: { cookie: 'mynder_session=abc' } });
    expect(await authenticateApi(request, { DB: dbWith(Date.now() + 60000) })).toBe('github:1');
    expect(await authenticateApi(request, { DB: dbWith(Date.now() - 1) })).toBeNull();
  });
});
