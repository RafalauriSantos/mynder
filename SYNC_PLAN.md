# Plano proposto — sincronização pessoal

**Estado:** proposta de MVP para revisão; nenhuma infraestrutura, conta de autenticação ou sincronização foi implementada.

## Critério principal: resiliência e sustentabilidade

- O armazenamento local continua sendo editável sem login, rede ou disponibilidade de Cloudflare/Google. A sincronização não é necessária para abrir, alterar ou exportar um quadro.
- A nuvem guarda uma réplica e histórico recuperável; não substitui silenciosamente a cópia local. Falhas de API, limite de cota ou autenticação deixam alterações locais intactas e pendentes.
- Exportação/importação JSON continua sendo o formato portátil de saída. O modelo de dados e a identidade interna não devem depender do e-mail exibido ou de um ID específico do provedor; mapear uma identidade externa verificada a um ID interno estável.
- Exclusões e conflitos precisam de recuperação explícita. Uma sincronização não pode resolver divergências usando “última gravação vence” sem avisar.
- Manter o número de serviços e código próprio pequeno, mas contabilizar o custo de migração se compartilhar quadros exigir outro modelo de identidade.

## Objetivo do primeiro incremento

Abrir os mesmos quadros no celular e no computador usando a mesma identidade. Cada aparelho continua podendo editar localmente e trabalhar sem conexão. Este incremento não inclui edição simultânea nem compartilhamento de quadros.

## Proposta técnica

1. **Manter a hospedagem atual e o endereço `mynder.pages.dev`.** Adicionar uma API pequena em Pages Functions sob `/api/*` e vinculá-la a um banco D1. Pages Functions aceita bindings D1 e executa no runtime Workers. **Pré voo no painel (27/09/2026):** o projeto de produção observado é Cloudflare Pages `mynder`, ligado ao repositório `RafalauriSantos/mynder` e à branch `main`, com publicação em `mynder.pages.dev`. O repositório também declara Workers Static Assets em `wrangler.jsonc`; resolver essa divergência antes de escolher comandos/configuração de deploy para a API e evitar dois deploys concorrentes.
2. **Preferir autenticação gerenciada em vez de criar senhas.** Para o incremento estritamente pessoal, Cloudflare Access com Google na API de sync é a opção inicial de menor código próprio: Access valida o login e o Pages Function valida o JWT em cada chamada; nunca aceitar `ownerId` enviado pelo navegador. A política pode ser restrita ao proprietário no primeiro momento. O app e os dados locais continuam públicos e utilizáveis sem login. No painel observado, Zero Trust está no plano Free, não há aplicação Access criada e o único IdP listado é o Cloudflare embutido; Google exigirá cadastrar credenciais OAuth antes de poder ser usado. Sem IdP externo configurado, Access oferece código de uso único por e-mail como fluxo padrão; essa alternativa pode evitar credenciais OAuth, mas a escolha deve ser fechada antes da configuração.
3. **Guardar um documento Mynder v2 inteiro por linha no D1.** Cada linha associa ID interno de proprietário, ID do quadro, revisão, JSON e data de atualização. Usar prepared statements e verificar que a identidade autenticada tem acesso ao quadro em toda leitura ou escrita. Não usar e-mail mutável como chave primária; mapear `issuer + subject` verificados para um identificador interno e confirmar quais claims o Access entrega antes de fechar o esquema.
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

Na documentação Cloudflare consultada em 27/09/2026, o plano Workers Free inclui 100 mil chamadas de Worker/Pages Functions por dia. D1 Free inclui 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia, 500 MB por banco (5 GB no total da conta) e recuperação Time Travel por 7 dias. O plano Free de Cloudflare One/Access cobre até 50 usuários. O Google IdP do Access não exige Workspace nem domínio próprio; é necessário criar credenciais OAuth no Google Cloud e cadastrá-las no Access. Esses limites parecem amplos para uso pessoal, mas são cotas: chamadas Pages Functions contam no limite de Workers; quando as cotas diárias do D1 são excedidas, consultas falham até o reset. Confirmar os valores atuais e o comportamento de falha antes do deploy.

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

## Fora deste incremento

Compartilhamento entre pessoas, permissões por quadro, colaboração em tempo real, mesclagem de conflitos, migração para domínio próprio e cobrança. Compartilhamento vem depois e exigirá regras de acesso por quadro; liberar um endereço no Access não substitui essas regras.

## Recomendação e limites

Para sincronização pessoal, Access + Google continua sendo a recomendação inicial por delegar autenticação e reduzir código sensível de sessão/senha, dentro do ecossistema já usado. A razão principal não é apenas custo: menos componentes próprios significam menos rotinas de segurança para manter. O formato Mynder, exportação e ID interno precisam continuar independentes do provedor para reduzir lock-in e permitir migração.

Esta escolha vale para sync pessoal, não é compromisso automático com a futura colaboração. Se o produto precisar de cadastro aberto ou contas geridas dentro do Mynder, reavaliar Access contra um fluxo OIDC da aplicação antes dessa etapa; não improvisar compartilhamento ampliando uma allowlist.

### Limitação e pré-requisito de implementação

**Resultado do pré voo somente leitura (27/09/2026):** no painel Zero Trust, o assistente de aplicação Self-hosted permite escolher o hostname `mynder.pages.dev` e exibe um campo opcional Path. Isso confirma que a configuração por caminho pode ser expressa no painel, mas não confirma que uma regra `/api/*` está salva ou efetiva: o rascunho foi descartado, não há aplicação Access, e não houve teste HTTP. A documentação de caminhos explica que `host/api/*` abrange os caminhos descendentes; validar separadamente a rota exata `/api` se ela existir, e manter autenticação/autorização no backend. A documentação geral de Pages ainda instrui proteger o hostname `pages.dev`; portanto o comportamento combinado deve ser testado antes da produção. O painel lista somente o IdP Cloudflare embutido; Google OAuth ainda não foi cadastrado. Antes de implementar, decidir Google versus código por e-mail, configurar a política restrita ao proprietário, testar `/` sem login e `/api/*` com login, e validar claims estáveis, restauração de backup e exportação integral. Se algum requisito falhar, rever o desenho antes de codificar; não proteger o app inteiro nem iniciar sync sem essas garantias.

O login Google via Access é autenticação de acesso ao app e pode servir à sync pessoal. Não equivale a cadastro aberto de usuários Mynder. Compartilhamento futuro exige autorização por quadro e regras de membros no backend, independente do login.

**Critérios para considerar o MVP futuro resiliente:** o modo local funciona durante indisponibilidade de serviços; cópia inicial pede confirmação; conflitos e exclusões são recuperáveis; autorização é validada no servidor por quadro; identidade possui mapeamento interno migrável; exportação completa e restauração foram exercitadas; custo/cotas e limites de recuperação são conhecidos. A configuração de Access, Pages Functions e D1 e esses ensaios pertencem à implementação futura, ainda não realizada.
