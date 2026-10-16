# Mynder

A visual space to organize ideas, connect concepts and draw freely on the same board. Open source, MIT licensed.

**Live app:** [mynder.pages.dev](https://mynder.pages.dev/) · Portuguese guide: [README.pt-BR.md](README.pt-BR.md)

Mynder has two views of one board: a **mind map** (rendered with [Markmap](https://markmap.js.org/)) and a **free canvas** (React Flow) where you can move nodes, link them and draw. Both share the same hierarchy. Editing the Markdown regenerates the map and keeps the nodes and links that did not change.

## Features

- **Mind map and free canvas** on the same board, with pen, highlighter, shapes, arrows, text and an eraser on the canvas, plus undo and redo.
- **Add branches in place.** Every branch has a **+** button (on hover, always visible on touch). The whole structure can also be edited as Markdown from the **···** menu.
- **Local first, works offline.** Boards live in the browser's `localStorage` and the app opens without a connection after the first visit (PWA). JSON export, import and a full backup are built in.
- **Optional sync with a Google account.** Signing in keeps your maps in the cloud and in sync across devices. The app pulls changes every 10 seconds and when you return to the tab, never overwrites an edit from either side, and keeps conflicting copies for you to review.
- **Stays signed in.** The browser remembers only a flag that you signed in before and asks Google for a fresh credential on load. No token is stored on disk.
- **Focus mode** (press `F`, `Esc` to leave) and a collapsible map list.
- **MCP server.** Any AI assistant that speaks MCP can create, reorganize and edit your maps node by node (see [MCP tools](#mcp-tools)).

Keyboard shortcuts: `Ctrl/Cmd+S` save, `Ctrl/Cmd+Z` undo, `F` focus mode.

## Run it

Requires Node 22 (the version CI uses).

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # app logic: documents, storage, backup, sync
npm run test:cloudflare   # Pages Functions and the MCP Worker
npm run build
```

To try the app from a phone on the same network, run `npm run dev -- --host 0.0.0.0` and open `http://<your-computer-ip>:5173/`.

If `npm test` fails with `ERR_UNKNOWN_FILE_EXTENSION`, your Node build cannot import `.ts` files directly. CI runs the official Node 22 and is the reference.

## How it is built

| Part | Where | What it does |
|---|---|---|
| Web app | `src/` | React 18, TypeScript and Vite. Landing page, editor, local storage, sync engine. |
| Sync API | `functions/`, `server/` | Cloudflare Pages Functions under `/api`. Verifies the Google ID token and stores maps in D1, scoped to the account. |
| MCP server | `mcp/` | A Cloudflare Worker at `/mcp`, protected by OAuth 2.1 (Google sign-in with PKCE). |
| Schema | `migrations/` | D1 migrations shared by the Pages app and the MCP Worker. |

The API never trusts the client about who owns a map: the owner comes from the verified token. The ID token lives in memory only, and a refreshed token is accepted only for the account that is already connected.

## Self-hosting

You need a Cloudflare account, `wrangler` logged in and a Google OAuth **Web** client (Google Auth Platform). No secret is committed: configure them in Cloudflare and keep `.env*` files out of Git.

### 1. The web app and sync API (Cloudflare Pages)

1. Create a D1 database and apply the schema from `migrations/`.
2. Create a Pages project connected to your fork. Build command `npm run build`, output directory `dist`.
3. In the project settings, add a **D1 binding** named `DB` for the database.
4. In the project settings, add these variables for the Production environment:

   | Variable | Value |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | your public Google client ID (used at build time) |
   | `AUTH_AUDIENCE` | the same client ID |
   | `AUTH_ISSUER` | `https://accounts.google.com` |
   | `AUTH_JWKS_URL` | `https://www.googleapis.com/oauth2/v3/certs` |

5. In the Google client, add your site's URL as an **authorized JavaScript origin**. The client secret is not needed by the web app.

Deploys happen on every push to `main`. For a manual deploy use `npm run deploy`. Changes to variables only apply to the next deployment.

### 2. The MCP Worker (optional)

1. Create the resources the config script looks up by exact name: a D1 database `mynder-staging` and a KV namespace `mynder-oauth-staging`. Apply the schema from `migrations/` to the database.
2. In the Google client, add `https://<worker>.<your-subdomain>.workers.dev/callback` as an authorized redirect URI.
3. Generate the local Wrangler config. It writes the resource IDs to `mcp/.wrangler/wrangler.generated.jsonc`, which Git ignores:

   ```bash
   MYNDER_WORKERS_SUBDOMAIN=<your-workers-dev-subdomain> \
   MYNDER_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com \
   npm run cloudflare:configure --prefix mcp
   ```

4. Store the Google client secret as a Worker secret named `OIDC_CLIENT_SECRET` with `wrangler secret put`. Never paste it in chat or commit it.
5. Check, then deploy:

   ```bash
   npm run cloudflare:migrate:staging --prefix mcp
   npm run cloudflare:dry-run:staging --prefix mcp
   npm run cloudflare:deploy:staging --prefix mcp
   ```

6. Add the server to your MCP client with the URL `https://<worker>.<your-subdomain>.workers.dev/mcp`. The client walks you through the consent screen and Google sign-in.

The names in the config script (`mynder-staging`, `mynder-oauth-staging`, `mynder-mcp-oauth-staging`) are this project's own. Edit `mcp/scripts/configure-cloudflare.mjs` to use different ones.

## MCP tools

Tokens carry `mynder:read` and `mynder:write` scopes, and write tools are only offered to tokens with the write scope. Every account sees only its own maps.

- **Read:** `mynder_list_maps`, `mynder_get_map`, `mynder_get_outline`, `mynder_get_markdown`, `mynder_export_backup`
- **Maps (write):** `mynder_create_map`, `mynder_create_map_from_markdown`, `mynder_duplicate_map`, `mynder_rename_map`, `mynder_organize_map`, `mynder_delete_map` (asks a human to confirm, and is recoverable), `mynder_restore_map`, `mynder_update_map`
- **Structure (write):** `mynder_set_markdown`, `mynder_add_node`, `mynder_add_branch`, `mynder_rename_node`, `mynder_move_node`, `mynder_delete_node`, `mynder_set_collapsed`, `mynder_set_color`, `mynder_link_nodes`, `mynder_unlink_nodes`

Start with `mynder_list_maps` and `mynder_get_outline`, which shows the ID of each node.

## Known limitations

- **Sign-in is limited to test users.** The hosted app's Google consent screen is in testing mode, so only accounts added as test users can sign in. Local mode works for everyone, without an account.
- **Sync is near real time, not instant.** Changes made elsewhere (another device, or an AI through MCP) show up within about 10 seconds. There is no push channel.
- **The MCP server is not hosted for you.** To use it you deploy your own Worker (see above). Your assistant must support remote MCP servers with OAuth.
- **One shared database.** The hosted deployment uses a single D1 database for preview and production, a deliberate choice for a small project.
- **Free-tier quotas apply.** Cloudflare Workers and D1 free plans limit daily requests and reads, and queries fail until the quota resets.
- **Browser-dependent silent sign-in.** Staying signed in relies on Google's automatic sign-in, which some browser settings block. The sign-in button then works as usual.
- **No end-to-end browser tests yet.** Logic, the sync engine, the API and the MCP Worker are covered by automated tests; the editor and canvas interactions are checked by hand.

## More documentation

`SPEC.md`, `IMPLEMENTATION.md` and `SYNC_PLAN.md` are the product spec and the implementation notes (in Portuguese).

## License

MIT.
