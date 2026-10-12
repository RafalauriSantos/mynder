import {cloudflareTest, readD1Migrations} from '@cloudflare/vitest-plugin';
import {defineConfig} from 'vitest/config';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    miniflare: {
      // Test-only D1 binding. Its generated ID is local to this Vitest run and is not a Cloudflare resource ID.
      d1Databases: {TEST_DB: randomUUID()},
      bindings: {TEST_MIGRATIONS: await readD1Migrations(path.join(root, 'migrations'))},
    },
  }))],
  test: {
    include: ['server/maps/**/*.test.ts'],
    fileParallelism: false,
  },
});
