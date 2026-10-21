# Cloudflare sync and MCP — implementation plan

> **For agents:** follow `EXECUTION_STATE.yml` and run one step at a time. Each step needs its specific tests, `npm test`, `npm run build`, a state update, a commit and a push to `origin/main`, only with explicit user authorization. Do not start a dependent step before the previous one is validated.

**Goal:** sync maps between devices and allow authenticated operations through MCP, preserving local/offline use and portable backups.

**Architecture:** React/Vite stays on Cloudflare Pages. Pages Functions provide the API with D1 for maps. A Worker with a remote MCP server uses OAuth 2.1 and the same service and database. Identity is validated on the server and converted into an internal `owner_id`. The browser keeps an offline local cache separated by identity and by the anonymous space.

**Stack:** React, TypeScript, Vite, Cloudflare Pages Functions, Workers, D1, MCP over Streamable HTTP, OAuth 2.1. No Supabase integration.

## Global constraints

- Do not break the local v2 document or the Mynder v1 JSON backup.
- Do not send `ownerId` as an authority; use only the identity validated on the server.
- Keep local editing, persistence and export working without login or network.
- Do not create or change the Pages production configuration without auditing and comparing with the dashboard, because the current `wrangler.jsonc` is only local.
- Do not include Cloudflare credentials, tokens or real IDs in Git.
- Every remote operation is idempotent or protected by a revision; conflicts and deletions are recoverable.
- No real data is synced in tests; fixtures are synthetic.

## File inventory and responsibilities

- `src/document.ts`, `src/storage.ts`, `src/backup.ts`: the existing local contract to preserve.
- `src/sync/`: local account identity, pending-change queue, API client and sync states.
- `functions/api/`: authenticated Pages Functions for session, bootstrap, read, conditional write and tombstone.
- `migrations/`: versioned D1 schema, with indexes by owner and revision.
- `server/maps/`: domain logic with no React dependency, used by Functions and MCP.
- `mcp/`: stateless MCP Worker over Streamable HTTP, protected by OAuth 2.1 and a configurable generic upstream OIDC login. The real IdP/client and bindings were still activation gates.
- `*.test.mjs` and new tests: unit, local D1 integration, multi-identity authorization, and transport/MCP.
- `SPEC.md`: requirements and normative architecture; this file: steps; `EXECUTION_STATE.yml`: state and evidence.

## Step 0 — Baseline and executable specification

**Files:** `SPEC.md`, `IMPLEMENTATION.md`, `EXECUTION_STATE.yml`.

**Actions:** record the checkout, Git state, branch/remote, existing behavior, firm decisions, open decisions, architecture and gates. Preserve untracked artifacts.

**Validate:** `npm test`; `npm run build`; check that the diff touches only the three documents and that no secret or Cloudflare ID was added.

**Acceptance:** three coherent documents; known initial Git state; the 18 existing tests and the build pass; commit and push on the production branch.

## Step 1 — Document, identity and sync contracts

**Planned files:** `src/sync/contracts.ts`, `src/sync/contracts.test.mjs`, and `src/document.ts` only if the adapter needs to export canonical serialization.

**Interfaces:** `SyncIdentity { issuer: string; subject: string }`; `SyncRevision { mapId: string; revision: number }`; `SyncMap { document: Document; revision: number; updatedAt: number; deletedAt?: number }`; `SyncError` discriminated by `unauthenticated | forbidden | conflict | too_large | quota | unavailable | invalid`.

**Red/green:** first test the conversion of the current document into a UTF-8 JSON payload measured in bytes, the rejection of owner IDs in client data, and validation of a positive revision; watch the tests fail; implement the minimal types and canonical validation; add tests for a document near the limit and for a serializable error without sensitive data.

**Acceptance:** the contract is independent of React and `localStorage`; the payload does not accept owner identity; bytes are measured as real UTF-8; the specific tests, full suite and build pass. The initial cap is 1,900,000 bytes (a margin below the documented 2,000,000-byte D1 row limit) and must be re-evaluated with the schema in step 2. Record the sizes of the small, medium and large synthetic fixtures for the storage step.

## Step 2 — D1 schema and repository

**Planned files:** `migrations/0001_sync.sql`, `server/maps/repository.ts`, `server/maps/repository.test.ts`, `vitest.config.ts` or an equivalent Vite config, and bindings configuration for local tests only.

**Interfaces:** `list(identity)`, `get(identity, mapId)`, `create(identity, document)`, `update(identity, mapId, expectedRevision, document)`, `tombstone(identity, mapId, expectedRevision)`, `restore(identity, mapId, expectedRevision)`; no method receives a separate `ownerId`. Create, update, tombstone and restore accept idempotent retry without advancing the revision again.

**Actions:** internal identity and map tables, composite index by owner; prepared statements; `UNIQUE(owner_id, map_id)`; monotonic revision; atomic batch when creating the owner and map, and a revision condition for mutations. Measure the full JSON size including drawings. If it does not fit below the confirmed D1 limit at that time, do not truncate: stop and redesign the storage in D1/R2 chunks before continuing.

**Validate:** migration, CRUD, concurrent revision condition, tombstone/restore/idempotency tests, and an attempt by identity A to read, change or delete map B. Confirm that the largest allowed payload is persisted in local D1 below the row cap. Use the Workers Vitest integration (`vitest@^4.1.0`, `@cloudflare/vitest-plugin@^1`) with Miniflare/D1 per test file; nothing queries a remote database. Command: `npm run test:cloudflare`.

**Acceptance:** isolation demonstrated in the repository, atomic revision operation, repeatable migration; full suite and build pass.

## Step 3 — Configurable authentication and Pages API

**Files:** `functions/_middleware.ts`, `functions/api/session.ts`, `functions/api/maps.ts`, `functions/api/maps/[id].ts`, `functions/api/types.ts`, `server/auth/`, `server/http/` and local tests. The server TypeScript includes the Pages Functions.

**Actions:** a provider-independent OIDC/JWT verifier validates signature/JWKS, HTTPS issuer, audience, expiration and subject; it creates a `SyncIdentity` only from the verified token. The API validates the JSON body in streaming mode (limit of 1,916,384 bytes per request), rejects unknown envelopes, ignores an `ownerId` inside the document through contract validation, and derives operations from the middleware identity. Root and public assets stay public; `/api/*` is private. A login failure does not block local mode.

**External gate before activation:** a public login provider, real claims, URLs, OAuth credentials and a real D1 binding. Without these, the implementation stays generic and is tested with ephemeral keys/JWTs and local D1; do not enable anonymous API access.

**Validate:** missing, expired, wrong-signature/issuer/audience tokens, empty subject, unavailable JWKS, attempts to forge the owner, size limit, and local handlers with a local database. `npm run test:cloudflare` includes the integrated path JWT → middleware → Pages API → local D1.

**Acceptance:** server-side authorization fails closed; every route isolates identity; `npm test`, the build and the local integrated test pass. Public activation stays blocked until the real provider is configured.

## Step 4 — Separate local cache and sync

**Files:** `src/sync/local-store.ts`, `src/sync/client.ts`, `src/sync/engine.ts` and Node tests. Login had no chosen provider yet, so the UI did not start a session or sync by itself. The API client receives an in-memory token provider, which would be connected to login at activation.

**Actions:** separate the existing anonymous key from an account cache keyed by the SHA-256 hash of `(issuer, subject)`; the separation does not move or change the anonymous JSON. The account cache keeps a local backup, revision baselines and discarded maps. The API client requests a token on demand, does not persist it, and supports session and conditional CRUD. The idempotent engine sends new maps and local edits, downloads remote changes, records tombstones, checkpoints each progress step, and keeps diverging edits as conflicts. No automatic merge. UI integration and the confirmation for importing anonymous maps stayed until activation with a real provider.

**Validate:** switching the A/B/anonymous stores; a damaged cache and backup; a missing credential before the network; a payload without owner; create/pull/update/delete/tombstone/retry; diverging changes preserved; checkpoints after writes.

**Acceptance:** cache primitives, API client and reconciliation pass deterministic tests; the existing app and the anonymous JSON stay intact. Binding to the UI and the offline/reconnect test after login were left for activation, because they still depended on the external provider.

## Step 5 — Shared domain service

**Files:** `server/maps/service.ts`; the Pages Functions and future transports call this domain boundary; an integrated test runs the service through the handlers.

**Actions:** centralize listing, reading, document and identity validation, creation, conditional update, tombstone and restore. Transport functions only validate auth/format and call the service. Pages includes `POST /api/maps/:id/restore`.

**Acceptance:** the API and tests call the common service; handlers contain no SQL; authorization, restore and concurrency tests keep passing. The future MCP must use this same service.

## Step 6 — Authenticated MCP Worker

**Files:** `mcp/worker.ts`, `mcp/tools.ts`, `mcp/worker.test.ts`, `mcp/package.json` and `mcp/tsconfig.json`. There was no `mcp/wrangler.jsonc` in this step: the account had pre-existing staging Worker/D1, but the D1 had an incompatible legacy schema and was not chosen for migration; there was no dedicated KV namespace for Mynder. Real IDs are not versioned.

**Tools:** `mynder_list_maps`, `mynder_get_map`, `mynder_create_map`, `mynder_update_map`, `mynder_delete_map`, `mynder_restore_map`, `mynder_export_backup`. Strict JSON Schema inputs; never accept an owner ID; tools are limited to the identity and OAuth scopes; `mynder_delete_map` requires an elicitation confirmation tied to the current call/mapId/revision.

**Current local implementation:** the stateless Worker serves `/mcp` over Streamable HTTP. `OAuthAuthorizationServer` implements metadata, DCR, PKCE, and token issuance, exchange and revocation; `OAuthResourceServer` publishes protected-resource metadata and validates tokens with an exact audience. The upstream login is a configurable generic OIDC; discovery, HTTPS, signature/JWKS, issuer, audience, expiration, subject and nonce are validated. MCP consent happens before the redirect to the provider and uses the OAuth Provider's CSRF/bound-state helpers. The Worker issues the MCP its own token bound to scopes and to the OIDC identity `(issuer, subject)`; the upstream token is not delivered to the tools or persisted in the maps.

**Security and contracts:** tools receive only the identity and scopes from the validated OAuth token and call `server/maps/service.ts`; they do not accept `ownerId`. `mynder:read` allows reading and exporting; `mynder:write` allows creating, changing, deleting and restoring, and write tools are not even advertised without that scope. Deletion is a recoverable tombstone and asks for elicitation confirmation; a client without support fails closed. Backup returns paginated results in the Mynder JSON format. DCR is enabled; CIMD stays disabled until the Cloudflare compatibility flag `global_fetch_strictly_public` is configured and validated. No Worker was published or reconfigured in this step.

**Activation gate:** OAuth 2.1 and OIDC login were exercised with a synthetic issuer, JWKS, client and keys locally. Before connecting real users, choose the IdP and sign-up/abuse policy; register an OIDC client with real callbacks; configure issuer, audience, JWKS and the secret outside Git; configure the real D1/KV bindings and MCP endpoint. Do not publish or activate without these values and a remote validation.

**Validate:** `npm run test --prefix mcp` (Workers suite with the Streamable HTTP SDK client); `npm run test:cloudflare`; `npm test`; `npm run build`; `npm run build --prefix mcp`; `npm audit --prefix mcp`; `git diff --check`. The local SDK test covers DCR, consent, OIDC/PKCE/nonce, MCP token, scopes, two identities, conflict, elicitation and backup. This is automated protocol validation, not an Inspector or production smoke test.

**External gate:** choose and configure the OIDC IdP and register real callbacks; configure secrets and bindings outside Git. DCR for MCP clients is enabled. Never publish an endpoint without auth.

## Step 7 — Packaging and Cloudflare configuration

**Status (12/10/2026): consolidated into a single D1.** By the user's explicit decision, Preview and production share the D1 `mynder-staging`; there is no physical isolation between environments. The database keeps the existing data (1 user, 4 sessions and 4 maps) and received only the `0001_sync.sql` migration; the sync tables start empty. Before the consolidation, an SQL backup was exported and restored into a temporary local D1 to validate recovery. The temporary D1 `mynder-sync-staging`, which had no user or map data, was removed after confirming that no binding used it. The local backup stays in `mcp/.wrangler/` (ignored by Git). The legacy Worker `mynder-mcp-staging` was not changed.

**Reproducible configuration:** `mcp/scripts/configure-cloudflare.mjs` finds D1/KV by exact name using Wrangler and writes IDs only to `mcp/.wrangler/wrangler.generated.jsonc`, a directory Git ignores. Before configuring, set `MYNDER_WORKERS_SUBDOMAIN` to the `workers.dev` subdomain confirmed for the account. Commands: `npm run cloudflare:configure --prefix mcp`, `npm run cloudflare:migrations:staging --prefix mcp`, `npm run cloudflare:migrate:staging --prefix mcp`, `npm run cloudflare:dry-run:staging --prefix mcp` and `npm run cloudflare:deploy:staging --prefix mcp`. The generator uses the new name `mynder-mcp-oauth-staging`, `DB`, `OAUTH_KV`, that Worker's issuer/resource and the flag `global_fetch_strictly_public`; it does not reuse bindings or secrets from the legacy Worker.

**Pages:** Preview and production of the `mynder` project now point the `DB` binding to the single D1 above. The dashboard remains the source of truth for Pages configuration. This meets "one D1 total", but staging and production share the same rows; isolation between people is enforced by verified identity (`issuer + subject`) in the queries, not by separating environments.

**Live evidence:** Pages Preview and MCP staging return 200 for the root; `/api/session` and `/api/maps` without a token return 401 with `WWW-Authenticate`; `/mcp` without a token returns 401 with an OAuth challenge. The MCP endpoint publishes metadata whose issuer and audience match the Worker itself. The real routes with identity and D1 were exercised in the local suites; OIDC login, authorized MCP tools, operational rollback and logs under authenticated traffic remained for step 8.

**Step 8 gate:** Google OIDC and sign-up for any Google account with a verified email were chosen. Account login/state and sync are already connected to the local interface, with a per-account cache separate from the anonymous space and consented copying of existing maps. The MCP OAuth Worker was published as a separate service and uses the same D1. Real authentication did not work until the public Client ID and the OAuth secret were configured in the Cloudflare environment; no secret is in Git. Production has the D1 binding but does not yet enable sessions without valid configuration (fail closed).

## Step 8 — End-to-end tests and production

**Status (12/10/2026): implementation and D1 consolidation done; real validation pending Google credentials.** The production audit was fixed without `--force`. `npm audit --omit=dev` and `npm audit --prefix mcp` reported zero vulnerabilities. Validation at that time: `npm test` 39/39, `npm run test:cloudflare` 27/27, `npm run build`, `npm run build --prefix mcp`, local Playwright (offline persistence and zero console errors/warnings) and `git diff --check` passed.

**Status update (21/10/2026):** the production audit found 2 high advisories (`vite` and `markdown-it`). Both were fixed in commit `02451ed`, and `npm audit --omit=dev` now reports zero. The unit suite needs Node 22.18 or newer (pinned in `.nvmrc`). CI also builds the MCP Worker. The points below were not re-verified on 21/10/2026.

**Still needed (as of 12/10/2026):** create/configure the Google OAuth Web Client, set the public Client ID in the UI build, and configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` and the MCP client secret as secrets/settings in the Cloudflare resources. MCP Worker callback: `https://mynder-mcp-oauth-staging.mynder.workers.dev/callback`. Web origins: `https://mynder.pages.dev`, `https://mynder-sync-staging.mynder.pages.dev` and localhost for development. Do not paste the client secret in chat or commit it. After that: publish the build with the Client ID, test real login, sync across two accounts/devices, recovery/offline, authenticated MCP and backup restore. The single D1 is shared between Preview and production by explicit choice; keep backups and review quotas/costs before broad use.

**Recorded decisions:** Google OIDC; any Google account with a verified email can create an account; exactly one D1 for Mynder, shared between environments. Real credentials still need to be configured safely and the authenticated validation completed.

**Final acceptance:** every acceptance criterion in `SPEC.md` has production or equivalent remote-environment evidence; no identity, Cloudflare resource, cost or recovery blocker remains; `npm test`, the build, local integration and smoke tests pass; production observed through a deploy in `success` state.

**Global commands per step:** `npm test` and `npm run build`. Specific commands and test artifacts are recorded in `EXECUTION_STATE.yml` when each gate is closed.
