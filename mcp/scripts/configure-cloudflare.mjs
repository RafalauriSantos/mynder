import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerDirectory = path.resolve(scriptDirectory, '..');
const repositoryDirectory = path.resolve(workerDirectory, '..');
const wranglerCli = path.join(repositoryDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const outputDirectory = path.join(workerDirectory, '.wrangler');
const outputPath = path.join(outputDirectory, 'wrangler.generated.jsonc');
// One shared Mynder D1 is intentional per the user's explicit choice. Keep the
// legacy schema and maps in place while adding the sync schema to this DB.
const databaseName = 'mynder-staging';
const namespaceTitle = 'mynder-oauth-staging';
const workerName = 'mynder-mcp-oauth-staging';
const workersSubdomain = process.env.MYNDER_WORKERS_SUBDOMAIN?.trim();
if (!workersSubdomain || !/^[a-z0-9-]+$/.test(workersSubdomain)) {
  throw new Error('Set MYNDER_WORKERS_SUBDOMAIN to the exact workers.dev subdomain verified in the target Cloudflare account.');
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: workerDirectory,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Wrangler command failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Could not parse Wrangler ${label} output as JSON.`);
  }
}

function selectExactlyOne(items, predicate, label) {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${matches.length}. No config was written.`);
  }
  return matches[0];
}

const databases = parseJson(runWrangler(['d1', 'list', '--json']), 'D1 list');
const database = selectExactlyOne(databases, (item) => item.name === databaseName, `D1 database named ${databaseName}`);
const databaseId = database.uuid || database.database_id || database.id;
if (typeof databaseId !== 'string' || databaseId.length === 0) {
  throw new Error(`The ${databaseName} database has no recognized identifier. No config was written.`);
}

const namespaces = parseJson(runWrangler(['kv', 'namespace', 'list']), 'KV namespace list');
const namespace = selectExactlyOne(namespaces, (item) => item.title === namespaceTitle, `KV namespace named ${namespaceTitle}`);
const namespaceId = namespace.id || namespace.namespace_id;
if (typeof namespaceId !== 'string' || namespaceId.length === 0) {
  throw new Error(`The ${namespaceTitle} namespace has no recognized identifier. No config was written.`);
}

const issuer = `https://${workerName}.${workersSubdomain}.workers.dev`;
const config = {
  name: workerName,
  main: '../worker.ts',
  compatibility_date: '2026-10-12',
  compatibility_flags: ['global_fetch_strictly_public'],
  workers_dev: true,
  observability: {enabled: true},
  vars: {
    OAUTH_ISSUER: issuer,
    MCP_RESOURCE: `${issuer}/mcp`,
  },
  d1_databases: [{
    binding: 'DB',
    database_name: databaseName,
    database_id: databaseId,
    migrations_dir: '../../migrations',
  }],
  kv_namespaces: [{
    binding: 'OAUTH_KV',
    id: namespaceId,
  }],
};

await mkdir(outputDirectory, {recursive: true});
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {encoding: 'utf8', flag: 'w'});
process.stdout.write(`Generated local Cloudflare config: ${path.relative(workerDirectory, outputPath)}\n`);
