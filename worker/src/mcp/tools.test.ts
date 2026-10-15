import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../index';
import { createTestDb } from '../testdb';

let env: { DB: D1Database; MCP_BEARER_TOKEN: string; MCP_OWNER_ID: string };
let rpcId = 0;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function call(name: string, args: Record<string, unknown> = {}, token = 'secret', environment = env) {
  const response = await worker.fetch(new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  }), environment, ctx);
  const body = await response.text();
  const data = JSON.parse(body.split('\n').find(line => line.startsWith('data: '))!.slice(6));
  return { text: data.result.content[0].text as string, isError: Boolean(data.result.isError) };
}
const idOf = (outline: string, label: string) => new RegExp(`\\[([^\\]]+)\\] ${label}(?:\\s|$)`, 'm').exec(outline)![1];
const mapIdOf = (outline: string) => /\(id: ([^)]+)\)/.exec(outline)![1];

describe('MCP map tools', () => {
  beforeEach(() => { env = { DB: createTestDb(), MCP_BEARER_TOKEN: 'secret', MCP_OWNER_ID: 'owner-a' }; });

  it('creates, organizes and edits a map end to end', async () => {
    const created = await call('create_map', { markdown: '# Estudos\n## Matemática\n- Álgebra\n## Programação' });
    expect(created.isError).toBe(false);
    const map = mapIdOf(created.text);
    const prog = idOf(created.text, 'Programação');

    const added = await call('add_node', { mapId: map, text: 'TypeScript', parentId: prog });
    expect(added.text).toContain('TypeScript');
    const branch = await call('add_branch', { mapId: map, parentId: prog, markdown: '# Cloudflare\n## Workers\n## D1' });
    expect(branch.text).toContain('Workers');

    const algebra = idOf(branch.text, 'Álgebra');
    const moved = await call('move_node', { mapId: map, nodeId: algebra, newParentId: prog });
    expect(moved.isError).toBe(false);
    const renamed = await call('rename_node', { mapId: map, nodeId: idOf(moved.text, 'Workers'), text: 'Workers AI' });
    expect(renamed.text).toContain('Workers AI');
    const link = await call('link_nodes', { mapId: map, sourceId: algebra, targetId: idOf(renamed.text, 'D1') });
    expect(link.text).toContain('Conexões livres');
    const deleted = await call('delete_node', { mapId: map, nodeId: prog });
    expect(deleted.text).not.toContain('TypeScript');
    expect(deleted.text).not.toContain('Conexões livres');

    const markdown = await call('get_map_markdown', { mapId: map });
    expect(markdown.text).toContain('Matemática');
    expect((await call('list_maps')).text).toContain('Estudos');
  });

  it('set_markdown keeps ids of unchanged nodes', async () => {
    const created = await call('create_map', { markdown: '# Raiz\n## A\n## B' });
    const map = mapIdOf(created.text);
    const a = idOf(created.text, 'A');
    const result = await call('set_markdown', { mapId: map, markdown: '# Raiz\n## A\n- A1\n## C' });
    expect(idOf(result.text, 'A')).toBe(a);
    expect(result.text).not.toMatch(/\] B(\s|$)/);
  });

  it('reports errors instead of throwing', async () => {
    const created = await call('create_map', { markdown: '# Raiz\n## A\n- A1' });
    const map = mapIdOf(created.text);
    expect((await call('add_node', { mapId: map, text: 'x', parentId: 'nope' })).isError).toBe(true);
    expect((await call('move_node', { mapId: map, nodeId: idOf(created.text, 'A'), newParentId: idOf(created.text, 'A1') })).isError).toBe(true);
    expect((await call('get_outline', { mapId: 'nope' })).isError).toBe(true);
    expect((await call('delete_node', { mapId: map, nodeId: idOf(created.text, 'Raiz') })).isError).toBe(true);
  });

  it('duplicates, renames and deletes maps', async () => {
    const created = await call('create_map', { title: 'Original' });
    const map = mapIdOf(created.text);
    const copy = await call('duplicate_map', { mapId: map, title: 'Cópia' });
    expect(mapIdOf(copy.text)).not.toBe(map);
    await call('rename_map', { mapId: map, title: 'Novo título' });
    expect((await call('list_maps')).text).toContain('Novo título');
    expect((await call('delete_map', { mapId: map, confirm: true })).text).toBe('Mapa apagado.');
    expect((await call('delete_map', { mapId: map, confirm: true })).isError).toBe(true);
    expect(JSON.parse((await call('list_maps')).text)).toHaveLength(1);
  });

  it('keeps maps private to their owner', async () => {
    const created = await call('create_map', { markdown: '# Segredo' });
    const map = mapIdOf(created.text);
    const other = { ...env, MCP_OWNER_ID: 'owner-b' };
    expect((await call('get_outline', { mapId: map }, 'secret', other)).isError).toBe(true);
    expect((await call('delete_map', { mapId: map, confirm: true }, 'secret', other)).isError).toBe(true);
    expect((await call('rename_node', { mapId: map, nodeId: 'x', text: 'y' }, 'secret', other)).isError).toBe(true);
    expect(JSON.parse((await call('list_maps', {}, 'secret', other)).text)).toEqual([]);
    expect((await call('get_outline', { mapId: map })).isError).toBe(false);
  });
});

describe('REST maps API', () => {
  it('answers 409 when the expected version is stale', async () => {
    const environment = { DB: createTestDb(), MCP_BEARER_TOKEN: 'secret', MCP_OWNER_ID: 'owner-a', MCP_ALLOWED_ORIGIN: 'https://mynder.pages.dev' };
    const created = await call('create_map', { markdown: '# Raiz' }, 'secret', environment);
    const map = mapIdOf(created.text);
    const document = JSON.parse((await call('get_map', { mapId: map }, 'secret', environment)).text);
    const put = (expectedVersion: number) => worker.fetch(new Request(`https://mcp.test/api/maps/${map}`, { method: 'PUT', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: JSON.stringify({ document, expectedVersion }) }), environment, ctx);
    expect((await put(1)).status).toBe(200);
    expect((await put(1)).status).toBe(409);
  });
});
