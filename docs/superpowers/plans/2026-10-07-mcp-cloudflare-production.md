# Mynder MCP Cloudflare MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Mynder maps through a secure Cloudflare-hosted MCP endpoint so compatible AI clients can create and edit maps while the existing visual app remains usable.

**Architecture:** Keep the existing Cloudflare Pages frontend and add a separately deployable Cloudflare Worker at `/mcp`. Extract document validation and map operations into a shared server-safe module. Store authenticated maps in D1, retain browser `localStorage` for offline work, and add explicit synchronization later after the core MCP vertical slice is stable.

**Tech Stack:** TypeScript, Cloudflare Workers, Agents MCP SDK, Zod, D1, Vite/React, Vitest with the Workers pool.

**Spec:** `SPEC.md`, `SYNC_PLAN.md`, and this plan.

## Global Constraints

- Preserve the current Pages site and `mynder.pages.dev` deployment.
- Preserve local editing, export/import, and offline behavior.
- Never trust a document owner ID supplied by an MCP client.
- Every mutating MCP operation must validate the complete document before persistence.
- No unauthenticated production write endpoint.
- No automatic dependency upgrades or `npm audit fix --force`.

## Review Focus

- Malformed or cyclic map payloads must be rejected without partial writes — covered by domain and MCP contract tests.
- A user must not read or mutate another user's map — covered by authorization tests.
- Repeated create/update requests must not silently duplicate or corrupt maps — covered by repository tests.
- Existing offline/localStorage behavior must remain unchanged — covered by the existing browser-domain test suite.
- MCP transport failures must return protocol errors without leaking secrets or database details — covered by Worker handler tests.

### Task 1: Establish the shared domain boundary

**Files:**
- Modify: `src/document.ts`, `src/backup.ts`, `src/storage.ts` only as needed for server-safe imports.
- Create: `src/domain/index.ts`.
- Test: `document.test.mjs`, plus focused domain tests.

**Interfaces:**
- Produce `Document`, `validate(document)`, `createDocument(input)`, and deterministic map mutation functions with no browser globals.

- [ ] Identify browser-only imports and move or re-export pure document operations.
- [ ] Add tests proving validation rejects cycles, duplicate IDs, invalid links, and malformed drawings.
- [ ] Run `npm test` and `npm run build`.

### Task 2: Add a production-safe Worker service skeleton

**Files:**
- Create: `worker/src/index.ts`, `worker/src/env.ts`.
- Create: `worker/wrangler.jsonc`.
- Modify: root scripts and lockfile.
- Test: `worker/src/index.test.ts`.

**Interfaces:**
- Produce a Worker `fetch(request, env)` entry point and `/health` endpoint.
- Keep this Worker independently deployable from the Pages frontend.

- [ ] Add exact MCP and Zod dependencies compatible with the chosen Cloudflare SDK version.
- [ ] Add a failing health/route test.
- [ ] Implement `/health` without exposing environment values.
- [ ] Run Worker tests locally with Miniflare/Wrangler tooling.

### Task 3: Implement D1 repository and ownership checks

**Files:**
- Create: `worker/src/db/schema.sql`, `worker/src/db/maps.ts`, `worker/src/db/maps.test.ts`.
- Modify: `worker/wrangler.jsonc` with a placeholder binding only; production IDs remain secrets/configuration.

**Interfaces:**
- `listMaps(ownerId)`
- `getMap(ownerId, mapId)`
- `createMap(ownerId, document)`
- `updateMap(ownerId, mapId, document, expectedVersion)`

- [ ] Define maps table, owner index, timestamps, version, and JSON document storage.
- [ ] Test owner isolation, missing maps, optimistic version conflicts, and atomic update behavior.
- [ ] Reject invalid documents before SQL writes.

### Task 4: Expose the MCP tools

**Files:**
- Create: `worker/src/mcp/server.ts`, `worker/src/mcp/auth.ts`, `worker/src/mcp/tools.test.ts`.
- Modify: `worker/src/index.ts`.

**Interfaces:**
- MCP tools: `list_maps`, `get_map`, `create_map`, `update_map`, `validate_map`.
- All tools derive `ownerId` from authenticated context, never from tool arguments.

- [ ] Add protocol-level schemas with Zod and bounded payload sizes.
- [ ] Implement authenticated read/write tools.
- [ ] Return structured, client-friendly errors for validation, authorization, and conflicts.
- [ ] Test tool discovery and every tool's success and failure paths.

### Task 5: Add authentication and production configuration

**Files:**
- Modify: `worker/src/mcp/auth.ts`, `worker/wrangler.jsonc`.
- Create: `worker/README.md`, `.dev.vars.example`.

- [ ] Choose Cloudflare Access or OAuth based on the target MCP clients; document the decision.
- [ ] Deny production requests without a verified identity.
- [ ] Add CORS and origin rules only where required by the MCP transport.
- [ ] Document local setup without committing secrets.
- [ ] Run dependency audit and review all added packages before deployment.

### Task 6: Connect the Pages app to synchronized maps

**Files:**
- Modify: `src/storage.ts`, `src/main.tsx`.
- Create: `src/sync.ts`, `src/sync.test.ts`.

- [ ] Keep local-first behavior and exports intact.
- [ ] Add explicit sign-in/sync controls; never silently upload local maps.
- [ ] Handle offline edits and version conflicts visibly.
- [ ] Test local-only operation when the Worker is unavailable.

### Task 7: Production readiness and release

**Files:**
- Modify: `README.md`, `SYNC_PLAN.md`.
- Create: `docs/runbooks/mcp-production.md`.

- [ ] Add CI checks for tests, typecheck, build, and dependency audit policy.
- [ ] Deploy a staging Worker and exercise it with MCP Inspector.
- [ ] Verify logs, error redaction, rate limits, rollback, and D1 migrations.
- [ ] Promote to production only after a real AI client creates and edits a test map.
- [ ] Record the public MCP URL, authentication method, and recovery procedure.

