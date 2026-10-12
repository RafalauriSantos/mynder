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
- `mcp/`: Worker stateless de MCP via Streamable HTTP, protegido por OAuth 2.1 e login upstream OIDC genérico configurável; o IdP/cliente real e bindings ainda são gates de ativação.
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

**Interfaces:** `list(identity)`, `get(identity, mapId)`, `create(identity, document)`, `update(identity, mapId, expectedRevision, document)`, `tombstone(identity, mapId, expectedRevision)`, `restore(identity, mapId, expectedRevision)`; nenhum método recebe `ownerId` separado. Criação, atualização, tombstone e restauração aceitam retry idempotente sem avançar revisão novamente.

**Ações:** tabelas internas de identidade e mapas, índice composto por proprietário; prepared statements; `UNIQUE(owner_id, map_id)`; revisão monotônica; batch atômico ao criar proprietário/mapa e condição de revisão para mutações. Medir tamanho de JSON completo com desenhos. Se não couber abaixo do limite D1 confirmado no momento, não truncar: parar e redesenhar armazenamento em chunks D1/R2 antes de seguir.

**Validar:** testes de migração, CRUD, condição concorrente de revisão, tombstone/restauração/idempotência e tentativa de identidade A ler/alterar/apagar mapa de B. Confirmar que o maior payload permitido é persistido em D1 local abaixo do teto de linha. Usar a integração Workers Vitest (`vitest@^4.1.0`, `@cloudflare/vitest-plugin@^1`) com Miniflare/D1 por arquivo de teste; nada consulta banco remoto. Comando: `npm run test:cloudflare`.

**Aceite:** isolamento demonstrado no repositório, operação atômica de revisão, migração repetível; suíte completa e build passam.

## Etapa 3 — Autenticação configurável e API Pages

**Arquivos:** `functions/_middleware.ts`, `functions/api/session.ts`, `functions/api/maps.ts`, `functions/api/maps/[id].ts`, `functions/api/types.ts`, `server/auth/`, `server/http/` e testes locais. O TypeScript do servidor inclui as Pages Functions.

**Ações:** verificador OIDC/JWT sem dependência de provedor valida assinatura/JWKS, issuer HTTPS, audience, expiração e subject; cria `SyncIdentity` exclusivamente do token verificado. API valida corpo JSON em streaming (limite de 1.916.384 bytes por request), rejeita envelopes desconhecidos, ignora `ownerId` dentro do documento por validação de contrato e deriva operações da identidade middleware. Raiz e assets públicos; `/api/*` privado. Falha de login não impede modo local.

**Gate externo antes de ativar:** provedor de login público, claims reais, URLs, credenciais OAuth e binding D1 real. Sem isso, a implementação fica genérica e é testada com chaves/JWT efêmeros e D1 local; não habilitar API anônima.

**Validar:** tokens ausentes, expirados, assinatura/issuer/audience incorretos, subject vazio, JWKS indisponível, tentativa de falsificar proprietário, limite de tamanho e handlers locais com banco local. `npm run test:cloudflare` inclui caminho integrado JWT → middleware → Pages API → D1 local.

**Aceite:** autorização server-side fail-closed; todas as rotas isolam identidade; `npm test`, build e teste integrado local passam. Ativação pública continua bloqueada por configuração real do provedor.

## Etapa 4 — Cache local separado e sincronização

**Arquivos:** `src/sync/local-store.ts`, `src/sync/client.ts`, `src/sync/engine.ts` e testes Node. O login ainda não tem provedor escolhido; por isso a UI não inicia sessão nem sync sozinha. A API client recebe um fornecedor de token em memória, que será ligado ao login na ativação.

**Ações:** separar chave anônima existente de cache por hash SHA-256 de `(issuer, subject)`; a separação não move nem altera os JSON anônimos. Cache de conta mantém backup local, baselines de revisão e mapas descartados. API client solicita token sob demanda, não o persiste, e suporta sessão/CRUD condicional. Motor idempotente envia mapas novos e edições locais, baixa alterações remotas, registra tombstones, checkpointa cada progresso e preserva edições divergentes como conflitos. Sem merge automático. A integração UI e a confirmação para importar mapas anônimos permanecem antes da ativação com provedor real.

**Validar:** alternar stores A/B/anon; cache danificado e backup; credencial ausente antes de rede; payload sem proprietário; create/pull/update/delete/tombstone/retry, alterações divergentes preservadas e checkpoints após escrita.

**Aceite:** primitivas de cache, API client e reconciliação passam testes determinísticos; app existente e JSON anônimo continuam intactos. A ligação à UI e teste offline/reconexão após login ficam para a ativação, pois ainda dependem do provedor externo.

## Etapa 5 — Serviço de domínio compartilhado

**Arquivos:** `server/maps/service.ts`; Pages Functions e futuros transportes chamam este limite de domínio; teste integrado percorre serviço via handlers.

**Ações:** concentrar listagem, leitura, validação do documento e identidade, criação, atualização condicional, tombstone e restauração. Funções de transporte apenas validam auth/formato e chamam o serviço. Pages inclui `POST /api/maps/:id/restore`.

**Aceite:** API e testes invocam o serviço comum; handlers não contêm SQL; testes de autorização, restauração e concorrência continuam passando. O futuro MCP deverá usar este mesmo serviço.

## Etapa 6 — Worker MCP autenticado

**Arquivos:** `mcp/worker.ts`, `mcp/tools.ts`, `mcp/worker.test.ts`, `mcp/package.json` e `mcp/tsconfig.json`. Não há `mcp/wrangler.jsonc` nesta etapa: a conta tem Worker/D1 de staging preexistentes, mas o D1 usa schema legado incompatível e não foi escolhido para migração; não há KV namespace dedicada ao Mynder. Não versionar IDs reais.

**Ferramentas:** `mynder_list_maps`, `mynder_get_map`, `mynder_create_map`, `mynder_update_map`, `mynder_delete_map`, `mynder_restore_map`, `mynder_export_backup`. Entradas JSON Schema estritas; nunca aceitar owner ID; ferramentas limitadas à identidade e scopes OAuth; `mynder_delete_map` exige confirmação de elicitação amarrada à chamada atual/mapId/revisão.

**Implementação local atual:** Worker stateless atende `/mcp` por Streamable HTTP. `OAuthAuthorizationServer` implementa metadata, DCR, PKCE, emissão/troca/revogação de tokens; `OAuthResourceServer` publica protected-resource metadata e valida tokens com audiência exata. O login upstream é OIDC genérico configurável; discovery, HTTPS, assinatura/JWKS, issuer, audience, expiração, subject e nonce são validados. Consentimento MCP ocorre antes do redirect ao provedor e usa helpers de CSRF/estado vinculado do OAuth Provider. O Worker emite para o MCP token próprio vinculado a scopes e identidade OIDC `(issuer, subject)`; token upstream não é entregue às ferramentas nem persistido nos mapas.

**Segurança/contratos:** ferramentas recebem apenas identidade/scopes do token OAuth validado e chamam `server/maps/service.ts`; não aceitam `ownerId`. `mynder:read` libera ler/exportar; `mynder:write` libera criar/alterar/excluir/restaurar, e ferramentas de escrita nem são anunciadas sem esse scope. Exclusão é tombstone recuperável e pede confirmação por elicitação; cliente sem suporte falha fechado. Backup retorna páginas limitadas no formato JSON Mynder. DCR está habilitado; CIMD fica desabilitado até configurar/validar a compatibility flag Cloudflare `global_fetch_strictly_public`. Nenhum Worker foi publicado ou reconfigurado nesta etapa.

**Gate de ativação:** OAuth 2.1 e login OIDC foram exercitados com issuer, JWKS, cliente e chaves sintéticos locais. Antes de conectar usuários reais, escolher IdP/política de cadastro e abuso; registrar cliente OIDC com callbacks reais; configurar issuer, audience, JWKS e segredo fora do Git; configurar bindings D1/KV e endpoint MCP reais. Não publicar/ativar sem esses valores e validação remota.

**Validar:** `npm run test --prefix mcp` (suite Workers com cliente Streamable HTTP SDK); `npm run test:cloudflare`; `npm test`; `npm run build`; `npm run build --prefix mcp`; `npm audit --prefix mcp`; `git diff --check`. Teste SDK local cobre DCR, consentimento, OIDC/PKCE/nonce, token MCP, escopos, duas identidades, conflito, elicitação e backup. É validação de protocolo automatizada, não smoke test em Inspector/produção.

**Gate externo:** escolher/configurar IdP OIDC e registrar callbacks reais; configurar secrets e bindings fora do Git. DCR para clientes MCP está habilitado. Nunca publicar endpoint sem auth.

## Etapa 7 — Empacotamento e configuração Cloudflare

**Estado (12/10/2026): concluída em staging; produção preservada.** O painel Pages foi comparado com `wrangler.jsonc`: o projeto GitHub `mynder` publica `main`, `npm run build` → `dist`; a configuração do painel continua fonte de verdade e o arquivo local permanece sem `pages_build_output_dir`, sem migração acidental. Foi criado o D1 vazio `mynder-sync-staging`, aplicada nele a migration `0001_sync.sql`, e criado o KV `mynder-oauth-staging`. O D1 legado `mynder-staging` (1 usuário, 4 sessões e 4 mapas) não foi tocado. O Worker legado `mynder-mcp-staging` também não foi alterado.

**Configuração reproduzível:** `mcp/scripts/configure-cloudflare.mjs` encontra D1/KV por nome exato usando Wrangler e escreve IDs apenas em `mcp/.wrangler/wrangler.generated.jsonc`, diretório ignorado pelo Git. Antes de configurar, defina `MYNDER_WORKERS_SUBDOMAIN` com o subdomínio `workers.dev` confirmado na conta. Comandos: `npm run cloudflare:configure --prefix mcp`, `npm run cloudflare:migrations:staging --prefix mcp`, `npm run cloudflare:migrate:staging --prefix mcp`, `npm run cloudflare:dry-run:staging --prefix mcp` e `npm run cloudflare:deploy:staging --prefix mcp`. O gerador usa o nome novo `mynder-mcp-oauth-staging`, `DB`, `OAUTH_KV`, issuer/resource desse Worker e a flag `global_fetch_strictly_public`; não reutiliza bindings nem secrets do Worker antigo.

**Pages Preview isolado:** o binding `DB` do preview aponta ao D1 limpo; production mantém a mesma configuração anterior sem D1/vars. `npm run deploy:preview` compila e publica `dist` mais `functions/` no alias de staging; não use `npm run deploy` para validar preview.

**Evidência live:** Pages Preview e MCP staging retornam 200 para a raiz; `/api/session` e `/api/maps` sem token retornam 401 com `WWW-Authenticate`; `/mcp` sem token retorna 401 com desafio OAuth. O endpoint MCP publica metadata com issuer/audiência iguais ao próprio Worker. As rotas reais com identidade e D1 foram exercitadas nas suites locais; login OIDC, ferramentas MCP autorizadas, rollback operacional e logs sob tráfego autenticado permanecem para etapa 8.

**Gate da etapa 8:** IdP, política de cadastro/abuso e cliente OAuth ainda precisam de escolha/configuração. Não há autenticação real em staging; produção não tem binding D1, secrets ou deploy de sync ativados.

## Etapa 8 — Testes ponta a ponta e produção

**Estado (12/10/2026): em andamento; bloqueada por decisões de identidade e ativação de produção, não por build.** O audit de produção foi corrigido sem `--force`: `npm audit fix` atualizou as dependências transitivas e o override de KaTeX foi fixado em `0.19.0`, versão corrigida. `npm audit --omit=dev` e `npm audit --prefix mcp` agora reportam zero vulnerabilidades; `npm test` (37), `npm run test:cloudflare` (26), `npm run build` e `npm run build --prefix mcp` passaram depois da atualização.

**Ainda necessário:** escolher o IdP OIDC e a política de cadastro público/abuso; registrar o cliente do app e o cliente MCP com callbacks reais; definir os valores reais de issuer/audience/JWKS e o segredo MCP fora do Git; implementar o fluxo de login e ligar o `SyncApiClient`/`syncAccount` à interface sem misturar o espaço anônimo; provisionar D1 de produção separado; validar login/sync entre duas contas e dispositivos, recuperação/offline, MCP autenticado e restauração do backup remoto. Nenhum token de provedor foi inventado e produção permanece sem D1/auth/sync.

**Perguntas de decisão para retomar:** (1) GitHub OIDC, Google OIDC ou outro IdP? (2) cadastro aberto a qualquer usuário desse IdP ou restrito por convite? (3) autorizar um D1 de produção novo e vazio, mantendo o legado intacto? Depois dessas respostas, registrar os clientes/callbacks e disponibilizar as credenciais pelos segredos/bindings do ambiente, nunca no repositório.

**Aceite final:** cada critério de aceite de `SPEC.md` tem evidência de produção ou ambiente remoto equivalente; nenhum bloqueio de identidade, recurso Cloudflare, custo ou recuperação resta; `npm test`, build, integração local e smoke tests passam; produção observada por estado de deploy success.

**Comandos globais por etapa:** `npm test` e `npm run build`. Comandos específicos e artefatos de teste ficam registrados em `EXECUTION_STATE.yml` ao concluir cada gate.
