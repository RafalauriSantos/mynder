# Checklist — Claude conectado ao Mynder

**Objetivo final:** o Claude se conecta ao Mynder por MCP e cria, organiza e edita mapas livremente, e a pessoa dona vê o resultado no app.

**Regra de trabalho:** uma tarefa por vez. Cada uma termina com uma validação da pessoa dona antes da próxima. Nada de segredo no Git.

Legenda: `[ ]` pendente · `[~]` feito, aguardando validação · `[x]` validado

## Fase A — Base segura
- [x] **A1.** Criar o branch `feat/mcp-claude-connection` e este checklist. O trabalho não commitado fica fora da `main`.
- [~] **A2.** Corrigir a API HTTP do worker: `OPTIONS` devolve 500 (CORS quebrado) e `/api/maps` não aceita sessão por cookie. Com testes.
- [~] **A3.** `.dev.vars` entrou no `.gitignore`. Decisão: o `database_id` do D1 fica no `wrangler.jsonc` (identificador, não segredo; sem token da conta não dá acesso).

## Fase B — Ferramentas que o Claude precisa
- [~] **B1.** Extrair a lógica de edição de mapas para funções puras testáveis em `src/domain`: adicionar, renomear, mover e remover nó, mudar pai, ligar nós, recolher ramo e reorganizar o layout.
- [~] **B2.** Expor essas edições como ferramentas MCP (`add_node`, `rename_node`, `move_node`, `delete_node`, `link_nodes`, `organize_map`). Cada uma trata a versão otimista sozinha.
- [~] **B3.** Adicionar `delete_map`, `duplicate_map`, `rename_map` e `get_map_markdown`.
- [~] **B4.** Testes das ferramentas contra um D1 local (isolamento de dono, conflito de versão, mapa inexistente).
- [~] **B5.** Descrições e exemplos nas ferramentas para o Claude escolher a certa sem adivinhar.

## Fase C — Conexão de verdade
- [x] **C1.** Passo a passo de segredos e conexão em `worker/README.md`. O token novo está em `~/.config/mynder/mcp-token` (permissão 600).
- [x] **C2.** Worker de staging publicado com 21 ferramentas (versão `b8d95b9b`). Preflight CORS devolve 204 e `/mcp` sem token devolve 401.
- [x] **C3.** Conector `mynder` registrado no Claude (escopo de usuário) com o token novo. Aparece como Connected; as ferramentas só surgem em uma sessão nova.
- [x] **C4.** Teste ao vivo: o Claude cria um mapa, reorganiza e apaga um nó, e confere o resultado.

## Fase D — Ver o resultado no app
- [x] **D1.** O botão de sincronização do app deixa de usar `prompt()` e passa a ter uma tela de configuração.
- [x] **D2.** "Carregar nuvem" não sobrescreve edição local sem avisar, e conflito de versão mostra mensagem clara.
- [x] **D3.** Validar no `mynder.pages.dev` que um mapa criado pelo Claude aparece no app.

## Fase E — Fechamento
- [~] **E1.** README em inglês e guia para rodar o backend por conta própria (open source).
- [ ] **E2.** Commits organizados, PR e checagem de CI.
