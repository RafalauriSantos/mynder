# Mynder MCP Worker

Worker separado que expõe os mapas Mynder por MCP via Streamable HTTP.

## Estado atual

- Endpoint: `/mcp`.
- Staging: `https://SEU-WORKER.workers.dev/mcp`.
- Saúde: `/health`.
- Autenticação local/primeiro ambiente: Bearer token configurado em `MCP_BEARER_TOKEN`.
- Identidade inicial: `MCP_OWNER_ID` (modo single-owner; OAuth/Cloudflare Access será necessário antes de abrir para múltiplos usuários).
- Persistência: D1, tabela `maps`, com versionamento otimista.

## Desenvolvimento

```bash
cp .dev.vars.example .dev.vars
# substitua os valores locais por segredos fortes
npm install
npx wrangler d1 create mynder-local
npx wrangler d1 migrations apply mynder --local
npm test
npm run dev
```

O `database_id` em `wrangler.jsonc` é um placeholder. Copie o arquivo para `wrangler.local.jsonc` (ignorado pelo Git), preencha o ID real e publique com `npx wrangler deploy -c wrangler.local.jsonc`. Nunca commite tokens, IDs privados ou `.dev.vars`.

## Ferramentas MCP

- `list_maps`
- `get_map`
- `create_map`
- `update_map`
- `validate_map`

Antes da publicação, configurar OAuth ou Cloudflare Access, criar D1 de staging, testar com MCP Inspector e executar a migração de produção de forma controlada.

## Ferramentas (v0.2)

Leitura: `list_maps`, `get_outline`, `get_map`, `get_map_markdown`. Criação e mapa: `create_map`, `duplicate_map`, `rename_map`, `delete_map`, `organize_map`. Estrutura: `set_markdown` (reescreve preservando nós iguais), `add_node`, `add_branch`, `rename_node`, `move_node`, `delete_node`, `set_collapsed`, `set_color`, `link_nodes`, `unlink_nodes`. Avançadas: `update_map`, `validate_map`.

Comece com `list_maps` e `get_outline`: o outline mostra o ID de cada nó, necessário nas edições. As edições por nó gravam com controle de versão e refazem a leitura se houver conflito.

## Conectar o Claude

```bash
# 1. gere um token e grave no Worker (não vai para o Git)
openssl rand -hex 32 > ~/.config/mynder/mcp-token && chmod 600 ~/.config/mynder/mcp-token
cd worker && npx wrangler secret put MCP_BEARER_TOKEN < ~/.config/mynder/mcp-token
# MCP_OWNER_ID identifica o dono dos mapas; defina uma vez e não mude (mapas ficam presos a ele)

# 2. publique
npx wrangler deploy

# 3. registre o conector no Claude Code
claude mcp add --transport http --scope user mynder https://SEU-WORKER.workers.dev/mcp \
  --header "Authorization: Bearer $(cat ~/.config/mynder/mcp-token)"
```

Depois de rotacionar o secret, a propagação leva alguns segundos; se `claude mcp list` mostrar 401, repita. Abra uma sessão nova do Claude para as ferramentas aparecerem.
