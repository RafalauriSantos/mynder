# Plano proposto — sincronização pessoal

**Estado:** proposta revisada em 27/09/2026; nenhuma infraestrutura, conta de autenticação ou sincronização foi implementada. As escolhas abaixo são recomendação para revisão, não autorização para configurar recursos Cloudflare.

## Resultado da revisão do plano (27/09/2026)

- **Preservar a URL pública `mynder.pages.dev`** continua sendo a direção preferida, porque é a hospedagem e o endereço já apresentados para o app. A raiz `/` deve permanecer pública para o modo local; autenticação deve valer somente para as rotas `/api` e `/api/*`.
- **O destino de produção está confirmado como Pages Git integration.** No painel, `mynder.pages.dev` está ligado a `RafalauriSantos/mynder`; `main` é a branch de produção, deploys automáticos estão habilitados, o comando de build é `npm run build` e a saída é `dist` (build system 3). O commit `17b4475` estava publicado quando o painel foi inspecionado. A configuração `wrangler.jsonc` usa o formato Workers Static Assets e não é a configuração do Pages exibida no painel. O script manual do pacote foi alinhado ao Pages. A partir desta verificação, não há mais dúvida sobre qual projeto serve o app publicado.
- **O deploy de confirmação terminou com sucesso.** O push do commit `9de6ce9` gerou implantação Pages de produção em `main`, status `success`, duração de 32 segundos. O log mostrou que o Pages encontra o `wrangler.json` produzido pelo plugin Vite, considera inválido para configuração de Pages por não ter `pages_build_output_dir` e o ignora; depois usa as configurações do painel, compila e publica os assets. O log também confirma que não existe diretório `/functions` neste commit. O aviso não bloqueou o app estático, mas precisa ser resolvido ao adicionar Pages Functions ou bindings gerenciados por arquivo.
- **A configuração de backend ainda não existe.** Nas configurações de produção do Pages não há variáveis/segredos ou bindings listados; em Zero Trust, a lista de aplicações Access está vazia. A integração de provedores mostra somente Cloudflare como IdP; sem outro IdP, o painel indica código de uso único como método padrão. Não há Google IdP, app Access, política para `/api` ou D1 configurados. O painel foi apenas lido.
- **Não converter a configuração Wrangler atual para Pages às cegas.** Cloudflare documenta `npx wrangler pages download config` como forma de obter a configuração do painel, mas o comando substitui o arquivo Wrangler local. Adicionar `pages_build_output_dir` também transforma esse arquivo na fonte de verdade de produção. Antes, preservar o `wrangler.jsonc` atual e conferir as configurações de produção; manter o Pages existente e sua URL. Antes de introduzir Functions, escolher entre manter configurações no painel ou migrar cuidadosamente para um arquivo Pages que represente a produção; hoje o arquivo atual não configura o Pages.
- **O Access deve proteger a API sem bloquear o app local.** Não ativar uma política geral de Access para todo `pages.dev` sem provar o comportamento. Testar na URL publicada: `/` continua acessível sem login; `/api` e `/api/*` negam ou encaminham para autenticação sem sessão; a API funciona após login; falha de login/rede não impede edição e exportação local. A rota exata `/api` precisa de verificação separada de `/api/*`.
- **A API deve validar o Access JWT em cada rota protegida e autorizar o proprietário no servidor.** Não confiar só no bloqueio de borda, em `ownerId` enviado pelo navegador ou no e-mail fornecido pelo cliente. A proposta inicial continua sendo Cloudflare Access com Google, restrita à identidade do proprietário; cadastro de OAuth no Google e política Access ainda dependem de configuração externa. Confirmar os claims reais assinados, incluindo `iss` e `sub`, antes de definir a chave interna. Usar o plugin oficial de Pages para validar JWT caso Pages Functions seja confirmado; no Worker, usar validação compatível com o runtime e a mesma regra fail-closed.
- **Resolver o tamanho de documentos antes de escolher o esquema de armazenamento.** O plano anterior propunha uma linha D1 por quadro. A documentação atual limita cada string, BLOB ou linha a 2.000.000 bytes, enquanto os desenhos do Mynder crescem com pontos vetoriais. Medir um quadro representativo grande antes da implementação. Se o JSON serializado não couber com margem, desenhar e testar armazenamento em partes transacionais ou outra solução compatível; nunca truncar nem apagar a cópia local. Esse limite também deve aparecer na mensagem de falha e no indicador de sincronização.
- **Tratar cotas Free como falha recuperável.** Hoje, Workers/Pages Functions compartilham 100.000 requisições por dia; D1 Free lista 5 milhões de linhas lidas e 100 mil escritas por dia, 500 MB por banco, 5 GB por conta e sete dias de Time Travel. Desde 01/09/2026, consultas D1 falham até o reset diário após exceder limites de leitura/escrita. A aplicação deve manter a gravação local e indicar sync pendente nessas respostas. Conferir novamente os limites no momento de provisionar.

**Critério desta etapa de planejamento:** o desenho deve preservar `mynder.pages.dev`, o modo local sem login, dados completos recuperáveis, autorização por proprietário no servidor e um caminho claro para resolver o tamanho máximo antes de provisionar. A confirmação do deploy e a revisão do plano não criaram D1, não configuraram Access e não publicaram outra versão.

## Critério principal: resiliência e sustentabilidade

- O armazenamento local continua sendo editável sem login, rede ou disponibilidade de Cloudflare/Google. A sincronização não é necessária para abrir, alterar ou exportar um quadro.
- A nuvem guarda uma réplica e histórico recuperável; não substitui silenciosamente a cópia local. Falhas de API, limite de cota ou autenticação deixam alterações locais intactas e pendentes.
- Exportação/importação JSON continua sendo o formato portátil de saída. O modelo de dados e a identidade interna não devem depender do e-mail exibido ou de um ID específico do provedor; mapear uma identidade externa verificada a um ID interno estável.
- Exclusões e conflitos precisam de recuperação explícita. Uma sincronização não pode resolver divergências usando “última gravação vence” sem avisar.
- Manter o número de serviços e código próprio pequeno, mas contabilizar o custo de migração se compartilhar quadros exigir outro modelo de identidade.

## Objetivo do primeiro incremento

Abrir os mesmos quadros no celular e no computador usando a mesma identidade. Cada aparelho continua podendo editar localmente e trabalhar sem conexão. Este incremento não inclui edição simultânea nem compartilhamento de quadros.

## Proposta técnica

1. **Manter a hospedagem atual e o endereço `mynder.pages.dev`.** O painel confirma Pages Git integration com produção na branch `main`, build `npm run build` e saída `dist`. A API poderá entrar como Pages Functions sob `/api/*`, no mesmo projeto, com D1. Não manter um segundo deploy de Worker para o app.
2. **Preferir autenticação gerenciada em vez de criar senhas.** A proposta inicial é Cloudflare Access com Google na API de sync: Access valida o login e o Pages Function valida o JWT em cada chamada; nunca aceitar `ownerId` enviado pelo navegador. Restringir a política à identidade do proprietário. O app e os dados locais continuam públicos e utilizáveis sem login. No painel lido em 27/09/2026, não havia aplicação Access e o único IdP listado era Cloudflare; o painel indica código de uso único por e-mail como método padrão quando nenhum outro IdP é adicionado. Google exige cadastrar credenciais OAuth. A escolha do IdP e qualquer configuração externa ficam para uma etapa autorizada própria.
3. **Guardar documentos Mynder v2 no D1 após validar tamanho.** Cada quadro associa ID interno de proprietário, ID do quadro, revisão, JSON e data de atualização. Uma linha por quadro é a opção simples apenas se um documento completo, incluindo desenhos, ficar dentro do limite de 2.000.000 bytes com margem. Se não couber, comparar armazenamento em partes no D1 com alternativa de objetos antes de implementar. Usar prepared statements e verificar que a identidade autenticada tem acesso ao quadro em toda leitura ou escrita. Não usar e-mail mutável como chave primária; mapear `issuer + subject` verificados para um identificador interno e confirmar quais claims o Access entrega antes de fechar o esquema.
4. **Manter `localStorage` como cópia de trabalho e preservar a exportação JSON.** No primeiro acesso autenticado, mostrar os quadros locais e pedir confirmação antes de copiá-los para a nuvem. Nunca limpar os dados locais como efeito da sincronização.
5. **Sincronizar ao abrir e depois de salvar, com indicador de estado.** Sem conexão ou API, salvar localmente e marcar pendência para nova tentativa idempotente. Cada gravação remota inclui a revisão lida; se outra edição já avançou a revisão, recusar sobrescrita e preservar uma cópia recuperável do conflito. Sem mesclagem automática ou colaboração em tempo real.
6. **Propagar exclusões como marcações de excluído**, para quadros apagados em um aparelho não reaparecerem ao sincronizar outro. Manter período de recuperação definido; exportação local deve continuar disponível mesmo se a conta remota for removida.
7. **Definir recuperação e saída antes do deploy:** validar restauração de backup, documentar como exportar todos os quadros da nuvem e como excluir a conta/dados. D1 Time Travel ajuda em recuperação operacional, mas não substitui exportação independente nem restauração testada.

## Critérios de aceite do futuro MVP

- Entrar com a mesma identidade em dois aparelhos carrega os mesmos quadros.
- Uma edição salva em um aparelho aparece no outro após sincronizar.
- Uma edição offline continua salva localmente e sincroniza depois, sem perder conteúdo.
- Edições concorrentes do mesmo quadro não se sobrescrevem silenciosamente; uma cópia recuperável é apresentada.
- Uma identidade não consegue ler, substituir ou excluir os quadros de outra.
- A importação inicial pede confirmação e não apaga a cópia local; exportação/importação JSON continuam funcionando.
- Falha de autenticação ou de rede mostra estado compreensível e mantém os dados locais disponíveis.
- Indisponibilidade do provedor de identidade, da API ou estouro de cota não apaga ou bloqueia edição e exportação local; a pendência é retomada sem duplicar quadros.
- Uma exportação integral pode ser importada em uma instalação limpa, permitindo sair do Cloudflare sem depender da identidade original.
- Uma restauração de backup remoto recupera ao menos um quadro e suas conexões e desenhos, com procedimento documentado.

## Custo e limites a conferir antes de provisionar

Na documentação Cloudflare consultada em 27/09/2026, Workers Free inclui 100 mil requisições por dia, compartilhadas com Pages Functions; pedidos de assets estáticos seguem gratuitos. D1 Free inclui 5 milhões de linhas lidas/dia, 100 mil escritas/dia, 500 MB por banco, 5 GB por conta e recuperação Time Travel por 7 dias. Cada linha/valor de texto ou BLOB em D1 é limitado a 2.000.000 bytes. Desde 01/09/2026, consultas D1 falham após exceder limites diários até o reset; os dados armazenados não são removidos. O plano Free de Cloudflare One/Access cobre até 50 usuários. O Google IdP do Access exige criar credenciais OAuth no Google Cloud e cadastrá-las no Access. Confirmar limites e comportamento atuais antes de provisionar.

Referências oficiais:

- [Pages Functions e bindings](https://developers.cloudflare.com/pages/functions/)
- [Bindings D1 em Pages](https://developers.cloudflare.com/pages/functions/bindings/)
- [Limites do D1](https://developers.cloudflare.com/d1/platform/limits/)
- [Preço do D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Preço de Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare One: planos e preços](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare Access em `pages.dev`](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
- [Google como provedor do Access](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)
- [Regras de Access por caminho](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Validação JWT do Access em Pages Functions](https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/)
- [Tutorial oficial Vite SPA + Worker API](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Configuração Wrangler para Pages e cuidado ao migrar arquivo existente](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Limites atuais do D1, incluindo tamanho máximo de linha](https://developers.cloudflare.com/d1/platform/limits/)
- [Preços e limites atuais do D1 Free](https://developers.cloudflare.com/d1/platform/pricing/)
- [Preços atuais de Pages Functions/Workers Free](https://developers.cloudflare.com/pages/functions/pricing/)
- [Enforcement das cotas diárias do D1 desde 01/09/2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
- [Integração Git do Pages e publicação automática](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Publicação manual em projeto Pages com integração Git](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## Fora deste incremento

Compartilhamento entre pessoas, permissões por quadro, colaboração em tempo real, mesclagem de conflitos, migração para domínio próprio e cobrança. Compartilhamento vem depois e exigirá regras de acesso por quadro; liberar um endereço no Access não substitui essas regras.

## Recomendação e limites

Para sincronização pessoal, Access + Google continua sendo a recomendação inicial por delegar autenticação e reduzir código sensível de sessão/senha, dentro do ecossistema já usado. A razão principal não é apenas custo: menos componentes próprios significam menos rotinas de segurança para manter. O formato Mynder, exportação e ID interno precisam continuar independentes do provedor para reduzir lock-in e permitir migração.

Esta escolha vale para sync pessoal, não é compromisso automático com a futura colaboração. Se o produto precisar de cadastro aberto ou contas geridas dentro do Mynder, reavaliar Access contra um fluxo OIDC da aplicação antes dessa etapa; não improvisar compartilhamento ampliando uma allowlist.

### Limitação e pré-requisito de implementação

**Resultado do pré voo somente leitura (27/09/2026):** no painel Zero Trust, o assistente de aplicação Self-hosted permite escolher o hostname `mynder.pages.dev` e exibe um campo opcional Path. Isso confirma que a configuração por caminho pode ser expressa no painel, mas não confirma que uma regra `/api/*` está salva ou efetiva: o rascunho foi descartado, não há aplicação Access, e não houve teste HTTP. A documentação de caminhos explica que `host/api/*` abrange os caminhos descendentes; validar separadamente a rota exata `/api` se ela existir, e manter autenticação/autorização no backend. A documentação geral de Pages ainda instrui proteger o hostname `pages.dev`; portanto o comportamento combinado deve ser testado antes da produção. O painel lista somente o IdP Cloudflare embutido; Google OAuth ainda não foi cadastrado. Antes de implementar, decidir Google versus código por e-mail, configurar a política restrita ao proprietário, testar `/` sem login e `/api/*` com login, e validar claims estáveis, restauração de backup e exportação integral. Se algum requisito falhar, rever o desenho antes de codificar; não proteger o app inteiro nem iniciar sync sem essas garantias.

O login Google via Access é autenticação de acesso ao app e pode servir à sync pessoal. Não equivale a cadastro aberto de usuários Mynder. Compartilhamento futuro exige autorização por quadro e regras de membros no backend, independente do login.

**Critérios para considerar o MVP futuro resiliente:** o modo local funciona durante indisponibilidade de serviços; cópia inicial pede confirmação; conflitos e exclusões são recuperáveis; autorização é validada no servidor por quadro; identidade possui mapeamento interno migrável; exportação completa e restauração foram exercitadas; custo/cotas e limites de recuperação são conhecidos. A configuração de Access, Pages Functions e D1 e esses ensaios pertencem à implementação futura, ainda não realizada.
