# Runbook de produção do Mynder MCP

## Pré-requisitos

- Conta Cloudflare correta autenticada no Wrangler.
- D1 de staging criado e identificado no `worker/wrangler.jsonc`.
- Migração aplicada em staging.
- OAuth ou Cloudflare Access configurado; Bearer fixo é apenas para desenvolvimento/single-owner.
- Token e identificador do proprietário armazenados como secrets, nunca no Git.

O ambiente de staging atualmente publicado usa `https://mynder-mcp-staging.mynder.workers.dev/mcp`. Ele está protegido por Bearer token e não deve ser tratado como endpoint público de produção.

## Validação antes do deploy

```bash
npm test
npm run build
cd worker
npm test
npx wrangler deploy --dry-run --config ./wrangler.jsonc
npx wrangler d1 migrations apply mynder --remote --config ./wrangler.jsonc
```

Testar no staging:

1. `GET /health` retorna apenas `{ "ok": true, "service": "mynder-mcp" }`.
2. `/mcp` sem credencial retorna `401`.
3. Cliente MCP autenticado lista ferramentas.
4. Criar, ler, atualizar e validar um mapa de teste.
5. Uma identidade diferente não consegue ler ou atualizar o mapa.
6. Conflito de versão retorna erro sem sobrescrever a versão atual.

## Operação e rollback

- Inspecionar erros pelo `wrangler tail mynder-mcp`.
- Reverter para o último deployment conhecido usando o histórico do Worker.
- Nunca apagar o D1 como mecanismo de rollback.
- Fazer exportação dos mapas antes de migrações destrutivas.
- Rotacionar tokens após qualquer exposição suspeita.
