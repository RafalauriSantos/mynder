# Mynder

A visual space to organize ideas, connect concepts and draw freely on the same board. Open source (MIT).

Mynder has two views of one board: a **mind map** (rendered with Markmap) and a **free canvas** (React Flow) where you can move nodes, link them and draw. Both share the same hierarchy; editing the Markdown regenerates the map while preserving compatible nodes and links.

- Works offline as a PWA. Boards live in your browser's `localStorage`; JSON export/import and a full backup are built in.
- Optional account sync (Google sign-in) and an **MCP server** so an AI assistant such as Claude can create, reorganize and edit your maps node by node.

The Portuguese [README.md](README.md) has the full user guide, including the phone test checklists.

## Run the app

```bash
npm install
npm run dev
npm test && npm run test:cloudflare && npm run build
```

`npm test` covers the document, storage, backup and sync logic. `npm run test:cloudflare` covers the Pages Functions and the MCP Worker.

## Backend overview

The backend has two Cloudflare pieces that share one D1 database:

- **Pages Functions** (`functions/`, `server/`): the sync API under `/api` used by the app.
- **MCP Worker** (`mcp/`): an OAuth 2.1 protected MCP endpoint at `/mcp`, built on `@cloudflare/workers-oauth-provider`. Clients register dynamically, the user approves a consent screen, and sign-in goes through Google OIDC with PKCE. Tokens carry `mynder:read` and `mynder:write` scopes; write tools are only exposed to tokens that have the write scope. Every account only sees its own maps.

Schema lives in `migrations/`. No secrets are committed: configure them in Cloudflare and keep `.env*` files out of Git.

## Self-hosting the MCP Worker

You need a Cloudflare account, `wrangler` logged in, and a Google OAuth **Web** client.

1. Create the resources the config script looks up by exact name: a D1 database `mynder-staging` and a KV namespace `mynder-oauth-staging`. Apply the schema from `migrations/` to the database.
2. In the Google client, register `https://<worker>.<your-subdomain>.workers.dev/callback` as a redirect URI.
3. Generate the local Wrangler config. It writes the resource IDs to `mcp/.wrangler/wrangler.generated.jsonc`, which is ignored by Git:

   ```bash
   MYNDER_WORKERS_SUBDOMAIN=<your-workers-dev-subdomain> \
   MYNDER_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com \
   npm run cloudflare:configure --prefix mcp
   ```

4. Store the Google client secret as a Worker secret named `OIDC_CLIENT_SECRET` (`wrangler secret put`). Never paste it in chat or commit it.
5. Check, then deploy:

   ```bash
   npm run cloudflare:migrate:staging --prefix mcp
   npm run cloudflare:dry-run:staging --prefix mcp
   npm run cloudflare:deploy:staging --prefix mcp
   ```

6. Add the server to your MCP client using the URL `https://<worker>.<your-subdomain>.workers.dev/mcp`. The client will walk you through the consent screen and Google sign-in.

For the web app, set the public Google client ID at build time as `VITE_GOOGLE_CLIENT_ID` (see `.env.example`). It is public; the client secret must never use a `VITE_` prefix.

Names in the config script (`mynder-staging`, `mynder-oauth-staging`, `mynder-mcp-oauth-staging`) are the project's own staging names; edit `mcp/scripts/configure-cloudflare.mjs` if you want different ones.

## MCP tools

Read: `mynder_list_maps`, `mynder_get_map`, `mynder_get_outline`, `mynder_get_markdown`, `mynder_export_backup`.

Maps (write scope): `mynder_create_map`, `mynder_create_map_from_markdown`, `mynder_duplicate_map`, `mynder_rename_map`, `mynder_organize_map`, `mynder_delete_map` (asks the human for confirmation and is recoverable), `mynder_restore_map`, `mynder_update_map`.

Structure (write scope): `mynder_set_markdown`, `mynder_add_node`, `mynder_add_branch`, `mynder_rename_node`, `mynder_move_node`, `mynder_delete_node`, `mynder_set_collapsed`, `mynder_set_color`, `mynder_link_nodes`, `mynder_unlink_nodes`.

Start with `mynder_list_maps` and `mynder_get_outline`, which shows the ID of each node.

## License

MIT.
