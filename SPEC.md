# Mynder — product specification

## Vision

Mynder is a public tool for individual visual thinking. Each person works in their own private space: they start with an idea, organize concepts as a mind map, and keep working on the same board by creating nodes, relations and freehand drawings.

**Product promise:** turn thoughts into a visual map that stays editable.

## Audience

For people who study, plan projects or need to organize an explanation without choosing between a rigid tree and a blank canvas.

**Product direction (27/09/2026):** Mynder should be usable by different people with their own accounts. Each person sees and syncs only their own boards. Sharing boards with other people remains a separate future step.

## Principles

1. **The board is the center.** Hierarchy, free connections and drawings live in the same space.
2. **Starting is fast.** An idea can be pasted as text or Markdown and become a visual structure.
3. **The structure stays malleable.** Nodes can be moved, edited, collapsed, reorganized and connected in other ways.
4. **Data belongs to the person.** Local use does not depend on an account or a connection; open-format export lets people take their boards out of the service.
5. **Quiet interface, content in focus.** The identity should feel like a thinking tool, with space, readable contrast and clear controls.

## Main experience

1. The person creates a board or pastes text/Markdown.
2. Mynder turns headings and lists into a hierarchy and shows the mind map.
3. The person switches to the free canvas to move nodes, create connections and draw.
4. Both views show the same hierarchy; editing the Markdown updates the map and the canvas.
5. The board saves locally and can be exported as JSON.

## Scope of the initial prototype (historical)

- Local board list, with creation and selection.
- Mind map mode with Markmap and expanding/collapsing branches.
- Free canvas mode with an editable hierarchy, independent connections and drawings.
- Text/Markdown conversion into a shared hierarchy; regenerating the Markdown updates both views.
- The empty state offers a direct action to enter Markdown and rebuild the same board.
- Text editing, creating child and sibling nodes, changing parent, collapsing branches and automatic layout.
- Free connections between nodes.
- Freehand drawing: pen, highlighter, shapes, arrows, text and eraser.
- Selection, dragging, zoom, pan, fit to screen, undo/redo and JSON export/import.
- Export of one map or of all maps as a JSON backup; importing a backup adds copies without replacing local boards.
- Saving to `localStorage`. This prototype had no account, data server or sync between devices. Those came later (see "Current state" below).
- Direction for the next steps: let people create their own accounts and sync between devices. The server must authorize each operation from the verified identity data and the board owner; it must never trust an `ownerId` sent by the browser. One account cannot read, change or delete another account's data.
- Local boards stay editable and exportable without login or network. In the same browser, the anonymous local space and the caches of signed-in accounts must stay separate. Importing data into an account requires confirmation and never deletes the local copy.
- Responsive layout for desktop and mobile. In the review of 27/09/2026, the canvas was checked in a browser viewport of 390 × 844 px. That review does not replace testing on a physical device.

## Important distinctions

- The node structure is shared between Mind map and Canvas. Free connections and drawings are Canvas features.
- Editing the Markdown rebuilds the hierarchy. IDs and positions of nodes whose path and text stay the same are preserved; connections attached to removed nodes are discarded, and drawings stay on the board.
- The desired look may be close to visual mind maps such as NotebookLM's, but Mynder must keep free editing and drawing on the board itself.
- "Professional" at this stage means a coherent identity, a reliable interface, good usability and exportable data; it does not imply login or team infrastructure.

## Out of scope of the local prototype (historical)

When this section was written, login, cloud and sync were not implemented. They are now (see "Current state"). Still out of scope for the first multi-user version: simultaneous collaboration, board sharing, artificial intelligence, agents, RAG, permissions for teams and billing.

## Quality criteria

- A person can create a board, import an idea and keep editing without leaving the main screen.
- Different accounts cannot see or change each other's boards; the separation is enforced on the server, not only in the interface.
- Switching accounts in the same browser does not mix their local boards; the anonymous local space stays separate.
- Hierarchy and free connections are visually distinguishable.
- Saving and export are understandable; existing data stays readable after updates.
- An outage of the cloud or of the identity provider does not prevent opening, editing and exporting local boards.
- Synced data can be exported in the provider-independent Mynder format and restored after a failure or a change of service.
- Essential controls work on small screens and do not block the board.
- The Mynder brand appears consistently in the interface, the tab and the project materials.

## Automated validation

Current state (21/10/2026):

- `npm test` runs the unit tests for Markdown rules, hierarchy, regeneration, connections, JSON validation, local storage, backup, ordering and the sync client and engine. It needs Node 22.18 or newer, pinned in `.nvmrc`.
- `npm run test:cloudflare` runs the Pages Functions and MCP Worker tests with Miniflare and D1 locally.
- `npm run build` builds the app, and `npm run build --prefix mcp` builds the MCP Worker.
- GitHub Actions runs all of the above on every push to `main` and on pull requests.
- The editor and canvas interactions still need review in the browser. There are no end-to-end tests.

## Next steps

### Step 1 — Visual foundation and identity (done)

Apply the Mynder brand and set the typography, colors, control hierarchy and interaction states. Keep the current document format and storage keys.

### Step 2 — Refine the mind map flow (done)

Make the start from text/Markdown, the structure editing and the move to the free board clearer. Refine navigation controls, touch editing and the radial/organic presentation without duplicating data.

**Validation (27/09/2026):** on the published version, in a browser viewport of 390 × 844 px, the flow Markdown → map → Markdown editing → Canvas was checked; the new branch appeared in both views with the matching hierarchy. Then the user confirmed testing on a physical phone with their own board, including editing the map, using the Canvas and saving/reloading, and reported that everything worked well. The device model, the browser and specific interactions such as connecting and drawing were not detailed. **Step completed** based on that reported validation.

### Step 3 — Personal use robustness

Review empty states, saving, recovery and export/import; validate real use on phone and desktop.

**Empty state (done):** in a browser viewport of 390 × 844 px, deleting the last node showed the action to write an idea. Filling in the Markdown rebuilt the same board without duplicating the list; after saving and reloading, the hierarchy was still available in the Canvas. This does not replace validation on a physical device.

**Export/import and mobile canvas (done in the browser):** in a 390 × 844 px viewport, exporting and importing a board kept the 7 nodes and their hierarchy. In the Canvas, a free connection and a drawing were kept in the exported JSON; saving and reloading kept those elements on the board. During this review, the action bar of a selected node covered the top controls on small screens and blocked tapping "Import JSON". The bar now has its own band between the board controls and the Canvas, with horizontal scrolling on mobile. After the fix, the import was repeated with a node selected and worked. The screen was also reviewed in a 1280 × 800 px viewport.

**Physical validation (27/09/2026):** after the updated script, the user confirmed that they tested on a phone with their own board and that everything was fine. The flows in the script are considered confirmed: editing Markdown, manipulating and drawing on the Canvas, saving and reloading, exporting and importing JSON, and recovering an empty board separately. The device model and the browser were not reported.

**Automated validation of step 3 (27/09/2026):** `npm test` passed with 14 tests; `npm run build` completed. The bundler emitted an informational warning about `use client` in `@xyflow/react`. The browser review recorded no console errors. The visual fix was reviewed in the browser viewports listed above; this is not equivalent to a physical device test.

**Step 3 completed:** automated validation, browser review and the physical test reported by the user cover the flows of this step. The script used is in [README.pt-BR.md](README.pt-BR.md), section "Testar no celular".

### Step 4 — Product decision

**Direction set with the user:** the app will be public and can be used by people with their own accounts; each account has private boards. The order is: first sync one person's boards across their devices; then, in a separate step, allow sharing boards with other people. Authentication, local and remote isolation, costs and abuse protection still needed a plan before implementation.

**Current limit (at the time):** the prototype was still local, with JSON export/import. No sync or collaboration had been implemented. Each would be planned in its own step, starting with personal sync and considering its effects on privacy, authentication, support and cost.

### Step 5 — Plan multi-user sync (review needed)

The user approved the sync direction on 27/09/2026 and clarified that the app must serve other people, each with their own private boards. That changed the earlier plan, which emphasized personal sync. [SYNC_PLAN.md](SYNC_PLAN.md) was under review to cover public sign-up, per-account data isolation on the server and separation of local data by account. An identity provider limited to members of the account does not cover public sign-up.

### Step 6 — Full local portability

**Implementation done:** the "Full backup" button exports all maps, including connections, drawings and viewport, as one JSON file identified as a Mynder v1 backup. Import still accepts a single-map JSON and also recognizes the full backup; maps come in as copies with new document IDs, without replacing existing ones. Old map files are still accepted.

**Validation done:** `npm test` passed with 18 tests, including a round trip of multiple maps, preservation of canvas content, import of the single-map format and rejection of invalid backups; `npm run build` passed. On the published `mynder.pages.dev`, an isolated Playwright flow used three fictional maps: it downloaded a Mynder v1 file with the three maps, imported it and showed the three copies with the "(imported)" suffix. One copy was opened in both the Mind map and the Canvas. The responsive state was checked at 390 × 844 px; the console had no errors or warnings. The local interface had also been reviewed at 713 × 720 px.

**Physical validation confirmed (27/09/2026):** the user confirmed they could download and import the full backup in the phone browser, using their own board and following the script in a private tab to keep the original list intact. The device model and the browser were not reported.

**Step 6 completed:** portability of multiple maps was validated by automated tests, an isolated browser and a physical test reported by the user.

### Step 7 — Local access when the network fails (done)

**Goal:** after a first connected visit, allow opening the app shell without network and keep editing and saving existing maps in local storage. The implementation does not create an account, API or sync. The service worker pre-caches the production assets and shows a confirmation for updates; before updating, it saves the local maps. The first opening, another browser/device or cleared site data still require a network; backups are still needed.

**Desktop validation (27/09/2026):** local production build served by `wrangler pages dev`, browser viewport of 1536 × 864 px. The message "Ready to open offline in this browser" appeared. With the server stopped, reloading opened the app from the cache; a synthetic board saved earlier appeared in the list, was edited offline and remained available after another offline reload. The Export button stayed available; the download could not be confirmed on desktop.

**Published for physical validation (27/09/2026):** commit `4918136` was published automatically to production by Cloudflare Pages, and the dashboard recorded status `success`. The app is available at [mynder.pages.dev](https://mynder.pages.dev/).

**Physical validation confirmed by the user (27/09/2026):** the user confirmed that the offline test passed on a physical phone using their own board. The script covered the first connected opening, reopening with the network off, editing and saving, offline reload with the edit preserved and JSON export without a connection. This also confirms the export that could not be verified in the desktop test. The device model and browser were not reported.

**Step 7 completed:** app shell, local board, editing/saving after an offline reload and export were validated in physical use as reported by the user; desktop also confirmed offline reopening and persistence. The physical confirmation is the user's report, with no telemetry or device identification.

## Current technical decision

Web app in React, TypeScript and Vite; canvas based on React Flow; vector drawings persisted as data; local storage in the browser; static hosting on Cloudflare Pages. Keep the solution simple while the main flow is validated.

## Current state and executable target: Cloudflare + MCP sync

**Status as of 12/10/2026:** the React/Vite app keeps `localStorage`, JSON export/import and offline mode. Google sign-in, per-account cache, consented import and sync are integrated locally. Pages and the Worker use the same Cloudflare D1 `mynder-staging`; the database kept 1 user, 4 sessions and 4 maps, and the new sync tables were added without changing those records. Preview and production intentionally share that single D1. The duplicate empty Mynder database was removed after backing up the preserved database, testing a restore and auditing it without bindings. Google OIDC/sign-up were chosen, but real credentials were not yet configured at that time, so authenticated login and sync had not been validated with real Google. The MCP OAuth Worker was published separately and requires a configured OIDC upstream. Endpoints without credentials keep failing closed.

**Status update (21/10/2026):**

- The README describes sign-in and sync as working for accounts added as Google test users. This review did not re-validate the Google flow end to end.
- `npm test` needs Node 22.18 or newer (pinned in `.nvmrc`). The system Node on the development machine was built without TypeScript support, so it could not run the suite.
- Production dependency audit: 0 vulnerabilities. Two high advisories (`vite`, `markdown-it`) were fixed, and `vite` moved to `devDependencies`.
- CI builds the MCP Worker in addition to the app.

**Objective:** let a person use their maps on more than one device and request operations on their own maps via MCP. The cloud will be a recoverable synced copy; local storage stays editable and exportable without a network. Each API and MCP tool will get the owner only from an authenticated identity validated on the server. The client never chooses or provides the owner identity.

**Target architecture:** keep the frontend on `mynder.pages.dev`; Pages Functions under `/api/*` and a D1 binding for sync; a remote MCP Worker for `/mcp`, connected to the same domain service and D1. MCP uses OAuth 2.1 to authorize the AI client, and the user's external authentication maps to a stable Mynder identity. Transport and tokens are never stored in `localStorage`. The MCP Worker can use a `workers.dev` subdomain until there is a custom domain.

**Invariants:**

- Local v2 documents and Mynder v1 backups stay readable and exportable; anonymous/offline use does not require an account.
- The first import of anonymous maps into an account requires confirmation and copies them without deleting the local source.
- The server derives `owner_id` from the validated session. Every map query includes the authenticated owner; an `ownerId` in the body, URL or MCP arguments is ignored or rejected.
- Remote revisions are conditional. Conflict, outage, expired authentication, quotas and size limits keep the local edit and show an actionable pending state or error.
- The JSON payload of each document for sync has an initial cap of 1,900,000 UTF-8 bytes, below the documented D1 limit of 2,000,000 bytes per row. Larger documents stay local/exportable and get a recoverable error. The D1 step must confirm the space reserved for columns and metadata before keeping this cap.
- Remote deletions are recoverable tombstones; conflicts never use last-write-wins without a warning.
- MCP tools call the same domain service as the API. Each token has the minimum scope; deletion requires explicit confirmation and creates a recovery path.
- No secret, OAuth token, real database ID, account ID, hostname or account-specific Cloudflare configuration is committed. The local generator resolves IDs by exact names and writes only to `.wrangler/`, which Git ignores. Production configuration changes only after comparison with the dashboard.

**Cloudflare (12/10/2026):** one D1 database (`mynder-staging`) serves Pages Preview/production and the MCP Worker. A separate KV serves MCP OAuth. The binding does not give access to the account's other D1 databases; Mynder queries separate maps by verified identity. Environments share the database and must be treated as one operational and data boundary. The duplicate empty sync D1 was removed; the remaining D1 keeps the old data and has a local recovery backup, outside Git.

**Remaining gates:** configure real Google credentials (public Client ID at build time and secret/issuer/audience/JWKS in the Cloudflare environments), then validate login, sync between two accounts/devices, recovery/offline and an authenticated MCP client. The decision is to keep a single D1, shared between Preview and production; do not create an extra database. Before broad use, review quotas/costs and validate backup/restore.

**Executable plan and evidence:** [IMPLEMENTATION.md](IMPLEMENTATION.md) defines the steps and gates; [EXECUTION_STATE.yml](EXECUTION_STATE.yml) is the authoritative record of the current step, validations, commits, publication and blockers. A step passes only after the listed commands and criteria pass. The goal stays open until login, sync, multi-user isolation, offline/backup, authorized MCP and production validation are proven.
