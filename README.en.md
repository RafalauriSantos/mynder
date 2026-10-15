# Mynder

A visual space to organize ideas, connect concepts and draw freely on the same board. Open source (MIT).

Mynder has two views of one board: a **mind map** (rendered with Markmap) and a **free canvas** (React Flow) where you can move nodes, link them and draw. Both share the same hierarchy; editing the Markdown regenerates the map while preserving compatible nodes and links.

- Works offline as a PWA. Boards live in your browser's `localStorage`; export/import JSON and a full backup are built in.
- Optional cloud sync and an **MCP server** so an AI assistant (e.g. Claude) can create, reorganize and edit your maps node by node.

## Run the app

```bash
npm install
npm run dev
npm test && npm run build
```

## Self-hosting the backend

The backend is a Cloudflare Worker (`worker/`) with a D1 database. It serves the MCP endpoint (`/mcp`) and a small REST API (`/api/maps`) used by the app's sync buttons. You need a Cloudflare account and `wrangler` logged in.

```bash
cd worker && npm install
npx wrangler d1 create mynder            # copy the database_id into worker/wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
openssl rand -hex 32 > mcp-token && chmod 600 mcp-token   # keep it out of git
npx wrangler secret put MCP_BEARER_TOKEN < mcp-token
echo "my-owner" | npx wrangler secret put MCP_OWNER_ID     # set once; maps belong to this id
npx wrangler deploy
```

Edit `MCP_ALLOWED_ORIGIN` and `APP_ORIGIN` in `worker/wrangler.jsonc` to the URL where you host the app. Then:

- **App sync:** open the gear (⚙) in the app, paste the worker URL and the token.
- **Claude Code:** `claude mcp add --transport http --scope user mynder https://YOUR-WORKER.workers.dev/mcp --header "Authorization: Bearer $(cat mcp-token)"`, then start a new session.

Current limits: single owner per deployment (bearer token). GitHub/Google OAuth code exists but is not enabled by default; multi-user isolation is planned (see `SPEC.md`).

## MCP tools

Read: `list_maps`, `get_outline`, `get_map`, `get_map_markdown`. Maps: `create_map`, `duplicate_map`, `rename_map`, `delete_map`, `organize_map`. Structure: `set_markdown`, `add_node`, `add_branch`, `rename_node`, `move_node`, `delete_node`, `set_collapsed`, `set_color`, `link_nodes`, `unlink_nodes`. Advanced: `update_map`, `validate_map`. Start with `list_maps` and `get_outline`, which shows each node's ID.

## License

MIT.
