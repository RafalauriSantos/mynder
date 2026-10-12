# Sincronização Cloudflare e MCP — Plano de Implementação

> **Para agentes:** seguir `EXECUTION_STATE.yml` e executar uma etapa por vez. Cada etapa exige testes específicos, `npm test`, `npm run build`, atualização do estado, commit e push para `origin/main`, conforme autorização explícita do usuário. Não iniciar uma etapa dependente antes de validar a anterior.

**Objetivo:** sincronizar mapas entre dispositivos e permitir operações autenticadas por MCP, preservando uso local/offline e backups portáteis.

**Arquitetura:** React/Vite continua no Cloudflare Pages. Pages Functions fornecem API com D1 para mapas. Um Worker com MCP remoto usa OAuth 2.1 e o mesmo serviço e banco. Identidade é validada no servidor e convertida em `owner_id` interno. O navegador mantém cache offline local separado por identidade e pelo espaço anônimo.

**Stack:** React, TypeScript, Vite, Cloudflare Pages Functions, Workers, D1, protocolo MCP via HTTP streamable, OAuth 2.1. Nenhuma integração Supabase.

## Restrições globais

- Não quebrar o documento local v2 nem o backup JSON Mynder v1.
- Não enviar `ownerId` como autoridade; usar somente identidade validada no servidor.
- Preservar edição, persistência e exportação local sem login/rede.
- Não criar/alterar configuração de produção Pages sem auditar e comparar o painel, pois o `wrangler.jsonc` atual é apenas local.
- Não incluir credenciais, tokens ou IDs reais de Cloudflare no Git.
- Toda operação remota é idempotente ou protegida por revisão; conflitos e exclusões são recuperáveis.
- Nenhuma sincronização de dados reais é executada em teste; fixtures são sintéticas.

## Inventário de arquivos e responsabilidades

- `src/document.ts`, `src/storage.ts`, `src/backup.ts`: contrato local existente a preservar.
- `src/sync/`: identidade de conta local, fila de pendências, cliente da API e estados de sincronização.
- `functions/api/`: Pages Functions autenticadas para sessão, bootstrap, leitura, gravação condicional e tombstone.
- `migrations/`: schema D1 versionado, com índices por proprietário e revisão.
- `server/maps/`: lógica de domínio sem dependência de React, usada por Functions e MCP.
- `mcp/`: Worker dedicado, OAuth 2.1 e ferramentas MCP de mapas.
- `*.test.mjs` e novos testes: unit, integração D1 local, authz multi-identidade e transport/MCP.
- `SPEC.md`: requisitos e arquitetura normativa; este arquivo: passos; `EXECUTION_STATE.yml`: estado e provas.

## Etapa 0 — Baseline e especificação executável

**Arquivos:** `SPEC.md`, `IMPLEMENTATION.md`, `EXECUTION_STATE.yml`.

**Ações:** registrar checkout, estado Git, branch/remoto, comportamento já existente, decisões firmes, decisões abertas, arquitetura e gates. Preservar artefatos não rastreados.

**Validar:** `npm test`; `npm run build`; conferir diff apenas dos três documentos e verificar que nenhum segredo/ID Cloudflare foi adicionado.

**Aceite:** três documentos coerentes; estado Git inicial conhecido; 18 testes existentes e build passam; commit e push na branch de produção.

## Etapa 1 — Contratos de documento, identidade e sync

**Arquivos previstos:** `src/sync/contracts.ts`, `src/sync/contracts.test.mjs`, `src/document.ts` somente se o adaptador precisar exportar serialização canônica.

**Interfaces:** `SyncIdentity { issuer: string; subject: string }`; `SyncRevision { mapId: string; revision: number }`; `SyncMap { document: Document; revision: number; updatedAt: number; deletedAt?: number }`; `SyncError` discriminada por `unauthenticated | forbidden | conflict | too_large | quota | unavailable | invalid`.

**Red/Green:** primeiro testar conversão do documento atual para payload JSON UTF-8 medido em bytes, rejeição de IDs proprietários nos dados do cliente e validação de revisão positiva; observar os testes falharem; implementar tipos/validação canônica mínima; adicionar testes de documento próximo do limite e erro serializável sem dados sensíveis.

**Aceite:** contrato independente de React e `localStorage`; payload não aceita identidade proprietária; bytes medidos como UTF-8 reais; testes específicos, suíte completa e build passam. O teto inicial é 1.900.000 bytes (margem em relação aos 2.000.000 bytes por linha D1 documentados) e deverá ser reavaliado com o schema na etapa 2. Registrar tamanhos de fixtures sintéticas pequenas, médias e grandes para a etapa de armazenamento.

## Etapa 2 — Schema e repositório D1

**Arquivos previstos:** `migrations/0001_sync.sql`, `server/maps/repository.ts`, `server/maps/repository.test.ts`, `vitest.config.ts` ou config Vite equivalente, configuração de bindings apenas para testes locais.

**Interfaces:** `list(identity)`, `get(identity, mapId)`, `create(identity, document)`, `update(identity, mapId, expectedRevision, document)`, `tombstone(identity, mapId, expectedRevision)`, `restore(identity, mapId)`; nenhum método recebe `ownerId` separado.

**Ações:** tabelas internas de identidade e mapas, índice composto por proprietário; prepared statements; `UNIQUE(owner_id, map_id)`; revisão monotônica; transação/condição para update e exclusão lógica. Medir tamanho de JSON completo com desenhos. Se não couber abaixo do limite D1 confirmado no momento, não truncar: parar e redesenhar armazenamento em chunks D1/R2 antes de seguir.

**Validar:** testes de migração, CRUD, condição de revisão, tombstone/restauração e tentativa de identidade A ler/alterar/apagar mapa de B. Usar a integração Workers Vitest (`vitest@^4.1.0`, `@cloudflare/vitest-plugin@^1`) com Miniflare/D1 por arquivo de teste; nada consulta banco remoto. Comando: `npm run test:cloudflare`.

**Aceite:** isolamento demonstrado no repositório, operação atômica de revisão, migração repetível; suíte completa e build passam.

## Etapa 3 — Autenticação configurável e API Pages

**Arquivos previstos:** `functions/_middleware.ts`, `functions/api/session.ts`, `functions/api/maps.ts`, `functions/api/maps/[id].ts`, `server/auth/`, testes de handler e `wrangler` local isolado.

**Ações:** middleware valida assinatura/chaves, issuer, audience, expiração e subject do provedor selecionado; cria `SyncIdentity` do token verificado. API valida corpo e limites, ignora ou rejeita qualquer `ownerId`, deriva todas as operações da identidade middleware. Raiz pública; API privada. Falha de login não impede modo local.

**Gate externo antes de ativar:** provedor de login público, claims reais, URLs, credenciais OAuth e binding D1 real. Sem isso, testar validação com chaves/JWT efêmeros gerados em testes; não habilitar API anônima.

**Validar:** tokens ausentes, expirados, issuer/audience incorretos, subject vazio, tentativa de falsificar proprietário, rate/size limit e handlers locais com banco local.

**Aceite:** autorização server-side fail-closed; todas as rotas isolam identidade; `npm test`, build e teste integrado local passam.

## Etapa 4 — Cache local separado e sincronização

**Arquivos previstos:** `src/sync/local-store.ts`, `src/sync/client.ts`, `src/sync/queue.ts`, `src/sync/*.test.mjs`, alterações mínimas em `src/main.tsx` e UI.

**Ações:** separar chave anônima de chaves por `(issuer, subject)`; primeira cópia para nuvem apresenta quantidade e pede confirmação; nunca apaga a origem; salvar local antes da rede; fila idempotente; baixar apenas revisão alterada; expor estados `local`, `pending`, `synced`, `conflict`, `error`; conflito preserva cópia local recuperável; exclusões sincronizam tombstone. Sem merge automático.

**Validar:** offline edit → recarregar → reconectar; alternar contas A/B/anon; retry duplicado; conflito de duas revisões; exclusão propagada; exportar/importar JSON em cada estado.

**Aceite:** todos os critérios locais da SPEC passam; automação com duas identidades e API local demonstra sincronização sem vazamento; suíte completa e build passam.

## Etapa 5 — Serviço de domínio compartilhado

**Arquivos previstos:** `server/maps/service.ts`, `server/maps/service.test.mjs`; refatoração para API e MCP chamarem a mesma validação/repositório.

**Ações:** concentrar regras de criação, edição condicional, listagem, exclusão recuperável e auditoria; funções de transporte apenas validam auth e formato e chamam o serviço.

**Aceite:** API e testes invocam serviço comum; nenhum handler contém consulta SQL sem filtro proprietário; testes de autorização continuam passando.

## Etapa 6 — Worker MCP autenticado

**Arquivos previstos:** `mcp/src/index.ts`, `mcp/src/tools.ts`, `mcp/wrangler.jsonc` sem IDs reais, `mcp/*.test.mjs`, pacote/scripts do Worker.

**Ferramentas:** `list_maps`, `get_map`, `create_map`, `update_map`, `delete_map`, `restore_map`, `export_backup`. Entradas JSON Schema estritas; nunca aceitar owner ID; ferramentas limitadas ao subject OAuth; `delete_map` exige confirmação de elicitação/segunda chamada ou argumento de confirmação emitido para aquele mapId/revisão.

**Ações:** usar protocolo HTTP streamable e provedor OAuth 2.1 suportado; ferramentas chamam `server/maps/service.ts`. D1 binding no Worker compartilhado via binding nomeado, com IDs configurados fora do repositório ou fornecidos somente após recurso real existir.

**Validar:** MCP Inspector local; descoberta de ferramentas; chamada autenticada; usuário sem token; token de A contra mapa B; revisão conflitante; exclusão sem/ com confirmação; formato de backup.

**Gate externo:** cliente OAuth/registro dinâmico, provedor de login e secrets reais precisam de configuração do usuário. Nunca publicar endpoint sem auth.

## Etapa 7 — Empacotamento e configuração Cloudflare

**Arquivos previstos:** `functions/`, `migrations/`, scripts de validação; `wrangler` Pages local somente após preservar e comparar `wrangler.jsonc` atual com painel.

**Ações:** adicionar Functions sem tornar a configuração Wrangler atual fonte de verdade acidental; baixar configuração real do Pages somente após arquivar conteúdo original, revisar diff e confirmar que representa produção. Adicionar binding D1 a preview separado antes de produção; secrets via Wrangler/dashboard, nunca `.env` versionado. MCP em Worker separado em ambiente preview.

**Validar:** root público sem sessão, `/api/*` e `/mcp` sem sessão negados, sessão válida autorizada, preview isolado do banco de produção, rollback e logs sem tokens/conteúdo de mapa.

**Gate externo:** autenticação do painel Cloudflare, IDs reais, decisão sobre migração da configuração de produção e autorização de deploy.

## Etapa 8 — Testes ponta a ponta e produção

**Ações:** testar duas contas sintéticas isoladas; validar login real com usuário; sync em dois dispositivos; offline e recuperação; ferramenta MCP no cliente configurado; backup remoto completo restaurado em instalação limpa; revisar cotas/custos/retention, política de cadastro, abuso e exclusão de conta.

**Aceite final:** cada critério de aceite de `SPEC.md` tem evidência de produção ou ambiente remoto equivalente; nenhum bloqueio de identidade, recurso Cloudflare, custo ou recuperação resta; `npm test`, build, integração local e smoke tests passam; produção observada por estado de deploy success.

**Comandos globais por etapa:** `npm test` e `npm run build`. Comandos específicos e artefatos de teste ficam registrados em `EXECUTION_STATE.yml` ao concluir cada gate.
