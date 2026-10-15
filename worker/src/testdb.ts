import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** D1 mínimo sobre node:sqlite, só para testes. Aplica as migrações reais do projeto. */
export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, 'db/migrations');
  for (const file of readdirSync(dir).sort()) sqlite.exec(readFileSync(join(dir, file), 'utf8'));
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    run: async () => { const result = sqlite.prepare(sql).run(...(params as never[])); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; },
    first: async () => (sqlite.prepare(sql).get(...(params as never[])) as unknown) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])) as unknown[], success: true, meta: {} }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}
