# Plano em revisão — sincronização multiusuário

**Estado:** a direção de sincronização e resiliência foi aprovada em 27/09/2026. O usuário esclareceu que o app deve ser público e cada pessoa deve ter seus próprios quadros privados. O plano precisa ser revisado para esse requisito antes da implementação. Nenhuma infraestrutura, conta de autenticação ou sincronização foi implementada.

## Resultado da revisão do plano (27/09/2026)

- **Requisito multiusuário esclarecido:** pessoas fora da conta Cloudflare também devem poder criar/usar uma conta Mynder; cada conta acessa somente seus quadros. Compartilhamento entre contas continua fora da primeira versão. A política de cadastro aberto, os controles contra abuso e o procedimento de exclusão de conta ainda precisam ser definidos.

- **Preservar a URL pública `mynder.pages.dev`** continua sendo a direção preferida, porque é a hospedagem e o endereço já apresentados para o app. A raiz `/` deve permanecer acessível para uso local; chamadas de sincronização devem exigir uma sessão autenticada e ser autorizadas no servidor. Cloudflare Access protegendo `/api` é uma opção, não uma decisão tomada.
- **O destino de produção está confirmado como Pages Git integration.** No painel, `mynder.pages.dev` está ligado a `RafalauriSantos/mynder`; `main` é a branch de produção, deploys automáticos estão habilitados, o comando de build é `npm run build` e a saída é `dist` (build system 3). O commit `17b4475` estava publicado quando o painel foi inspecionado. A configuração `wrangler.jsonc` usa o formato Workers Static Assets e não é a configuração do Pages exibida no painel. O script manual do pacote foi alinhado ao Pages. A partir desta verificação, não há mais dúvida sobre qual projeto serve o app publicado.
- **O deploy de confirmação terminou com sucesso.** O push do commit `f4dc106` gerou implantação Pages de produção em `main`, status `success`, duração de 22 segundos; o deploy anterior do commit `9de6ce9` também terminou com `success` em 32 segundos. O log mostrou que o Pages encontra o `wrangler.json` produzido pelo plugin Vite, considera inválido para configuração de Pages por não ter `pages_build_output_dir` e o ignora; depois usa as configurações do painel, compila e publica os assets. O log também confirma que não existe diretório `/functions` neste commit. O aviso não bloqueou o app estático, mas precisa ser resolvido ao adicionar Pages Functions ou bindings gerenciados por arquivo.
- **A configuração de backend ainda não existe.** Na inspeção de 27/09/2026, as configurações de produção do Pages não tinham variáveis/segredos ou bindings; em Zero Trust, a lista de aplicações Access estava vazia. A integração de provedores mostrava Cloudflare como IdP, sem Google ou One-time PIN cadastrados. A documentação atual diz que novas organizações usam Cloudflare como IdP padrão e que OTP pode ser adicionado separadamente; portanto OTP não deve ser descrito como método automaticamente ativo. Ainda não foi verificado se o IdP Cloudflare está restrito a membros da conta. Não há app Access, política para `/api` ou D1 configurados. O painel foi apenas lido.
- **Provedores e público aberto (revisão, sem configuração):** Cloudflare IdP com **Restrict to account members** não serve para cadastro público, pois limita login aos membros da conta do proprietário. Google via Cloudflare Access aceita qualquer conta Google se a política permitir, mas o plano gratuito do Cloudflare One tem limite de 50 usuários; o preço publicado para Pay-as-you-go é US$ 7 por usuário/mês. Autenticações consomem assentos, e usuários ativos permanecem ocupando assento até serem removidos. Uma alternativa é autenticação OIDC integrada diretamente ao Mynder, sem assentos do Access, mas isso acrescenta código próprio de sessão e segurança. Comparar custo, facilidade e operação para o público esperado antes de escolher. Referências: [Google IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/), [Cloudflare IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/), [planos Zero Trust](https://www.cloudflare.com/plans/zero-trust-services/) e [gerenciamento de assentos](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/).
- **Isolamento necessário:** Cloudflare Access, Google ou OIDC identifica quem entrou; isso não separa os quadros automaticamente. Cada Pages Function deve validar a identidade assinada e obter o proprietário a partir de um identificador estável verificado, não de `ownerId` enviado pelo navegador. Toda leitura, criação, edição e exclusão no banco deve ser limitada a esse proprietário. No navegador, os quadros locais de cada conta devem usar espaços separados; o modo local anônimo e a importação inicial também não podem misturar contas. A primeira importação de quadros locais para uma conta deve pedir confirmação.
- **Pré-requisito local/offline esclarecido.** O app usa `localStorage` e a etapa 7 da SPEC validou em desktop e celular físico a reabertura offline após visita online. A primeira visita, outro navegador/dispositivo ou dados do site apagados ainda exigem conexão. A futura separação por contas deve preservar o cache local e a exportação; ela ainda não foi implementada.
- **Não converter a configuração Wrangler atual para Pages às cegas.** Cloudflare documenta `npx wrangler pages download config` como forma de obter a configuração do painel, mas o comando substitui o arquivo Wrangler local. Adicionar `pages_build_output_dir` também transforma esse arquivo na fonte de verdade de produção. Antes, preservar o `wrangler.jsonc` atual e conferir as configurações de produção; manter o Pages existente e sua URL. Antes de introduzir Functions, escolher entre manter configurações no painel ou migrar cuidadosamente para um arquivo Pages que represente a produção; hoje o arquivo atual não configura o Pages.
- **A autenticação deve proteger a sincronização sem bloquear o uso local.** Não proteger o site inteiro. Se Access for escolhido, testar `/` sem login e `/api`, `/api/*` com e sem sessão; se o app emitir as próprias sessões, testar os mesmos limites nas Pages Functions. Falha de login ou rede não pode impedir edição e exportação local.
- **O servidor deve impor isolamento por conta em cada operação.** Validar a sessão/JWT no servidor, derivar o ID interno do proprietário da identidade verificada e limitar cada consulta e mutação a esse proprietário. Nunca confiar em `ownerId` recebido do navegador. Não usar e-mail como chave primária; mapear uma identidade estável, como `issuer + subject`, após verificar as claims emitidas pelo provedor escolhido.
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
2. **Escolher autenticação para público, não só para o proprietário.** Cloudflare IdP restrito a membros da conta está descartado para cadastro público. Access com Google permite autenticar qualquer conta Google se a política permitir, mas o Free cobre até 50 usuários e o Pay-as-you-go publicado custa US$ 7 por usuário/mês; esse preço pode não ser sustentável para um app aberto. Comparar essa opção para um piloto pequeno com OIDC integrado ao Mynder ou outro serviço de identidade gerenciado sem Supabase. Qualquer solução deve permitir cadastro individual e entregar uma identidade verificável. A escolha final depende do público esperado e de aceitar login Google.
3. **Guardar documentos Mynder v2 no D1 após validar tamanho.** Cada quadro associa ID interno de proprietário, ID do quadro, revisão, JSON e data de atualização. Uma linha por quadro é a opção simples apenas se um documento completo, incluindo desenhos, ficar dentro do limite de 2.000.000 bytes com margem. Se não couber, comparar armazenamento em partes no D1 com alternativa de objetos antes de implementar. Usar prepared statements e verificar que a identidade autenticada tem acesso ao quadro em toda leitura ou escrita. Não usar e-mail mutável como chave primária; mapear `issuer + subject` verificados para um identificador interno e confirmar quais claims o Access entrega antes de fechar o esquema.
4. **Manter `localStorage` como cópia de trabalho e preservar a exportação JSON.** No primeiro acesso autenticado, mostrar os quadros locais e pedir confirmação antes de copiá-los para a nuvem. Nunca limpar os dados locais como efeito da sincronização.
   **Isolar também a cópia local:** usar espaços separados por identidade autenticada e manter o espaço anônimo separado. Alternar ou sair de uma conta não deve exibir os quadros locais da conta anterior. A importação atual de quadros locais para uma conta pede confirmação; a identidade de Rafael e as demais contas não compartilham o mesmo espaço local.
5. **Sincronizar ao abrir e depois de salvar, com indicador de estado.** Sem conexão ou API, salvar localmente e marcar pendência para nova tentativa idempotente. Cada gravação remota inclui a revisão lida; se outra edição já avançou a revisão, recusar sobrescrita e preservar uma cópia recuperável do conflito. Sem mesclagem automática ou colaboração em tempo real.
6. **Propagar exclusões como marcações de excluído**, para quadros apagados em um aparelho não reaparecerem ao sincronizar outro. Manter período de recuperação definido; exportação local deve continuar disponível mesmo se a conta remota for removida.
7. **Definir recuperação e saída antes do deploy:** validar restauração de backup, documentar como exportar todos os quadros da nuvem e como excluir a conta/dados. D1 Time Travel ajuda em recuperação operacional, mas não substitui exportação independente nem restauração testada.

## Critérios de aceite do futuro MVP

- Entrar com a mesma identidade em dois aparelhos carrega os mesmos quadros.
- Uma edição salva em um aparelho aparece no outro após sincronizar.
- Uma edição offline continua salva localmente e sincroniza depois, sem perder conteúdo.
- Edições concorrentes do mesmo quadro não se sobrescrevem silenciosamente; uma cópia recuperável é apresentada.
- Uma identidade não consegue ler, substituir ou excluir os quadros de outra.
- Uma pessoa fora da conta Cloudflare do proprietário pode criar sua própria conta Mynder, conforme o método de cadastro definido.
- Alterar `ownerId` ou IDs de quadros na requisição do navegador não permite acessar dados de outra conta.
- Alternar contas no mesmo navegador mantém caches locais separados; os dados do espaço anônimo não são atribuídos automaticamente a uma conta.
- A importação inicial pede confirmação e não apaga a cópia local; exportação/importação JSON continuam funcionando.
- Falha de autenticação ou de rede mostra estado compreensível e mantém os dados locais disponíveis.
- Indisponibilidade do provedor de identidade, da API ou estouro de cota não apaga ou bloqueia edição e exportação local; a pendência é retomada sem duplicar quadros.
- Uma exportação integral pode ser importada em uma instalação limpa, permitindo sair do Cloudflare sem depender da identidade original.
- Uma restauração de backup remoto recupera ao menos um quadro e suas conexões e desenhos, com procedimento documentado.

## Custo e limites a conferir antes de provisionar

Na documentação consultada em 27/09/2026, Workers Free inclui 100 mil requisições por dia, compartilhadas com Pages Functions; D1 Free inclui 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 500 MB por banco, com limite de 2.000.000 bytes por linha/valor. Desde 01/09/2026, consultas D1 falham até o reset após exceder as cotas diárias, sem remover dados armazenados. Cloudflare One Free cobre até 50 usuários; o preço publicado do Pay-as-you-go é US$ 7 por usuário/mês. A integração Google exige criar credenciais OAuth no Google Cloud e guardar Client ID/secret no Access. Esses valores devem ser conferidos novamente antes de provisionar.

Referências oficiais:

- [Pages Functions e bindings](https://developers.cloudflare.com/pages/functions/)
- [Bindings D1 em Pages](https://developers.cloudflare.com/pages/functions/bindings/)
- [Limites do D1](https://developers.cloudflare.com/d1/platform/limits/)
- [Preço do D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Preço de Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare One: planos e preços](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare Access em `pages.dev`](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
- [Google como provedor do Access](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)
- [Cloudflare como provedor de identidade no Access](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/)
- [One-time PIN no Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
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

Para um piloto limitado a até 50 usuários, Access + Google pode reduzir o código de login próprio, desde que o custo e as regras de entrada sejam aceitáveis. Para cadastro público que possa passar desse limite, esse modelo pode gerar custo por usuário e não é a recomendação sustentável sem uma previsão de escala. O plano deve comparar isso com OIDC integrado ao app ou outro serviço gerenciado que não seja Supabase. O modelo de dados e a exportação permanecem independentes do provedor.

O escopo atual é público, com espaços privados por conta e sem compartilhamento entre usuários. O método de cadastro ainda deve ser definido. Não usar uma allowlist exclusiva do proprietário para simular isolamento de dados: cada operação da API deve autorizar o proprietário no servidor. Compartilhamento futuro exige autorização por quadro e regras de membros separadas.

### Pré-requisitos para a implementação multiusuário

**Resultado do pré voo somente leitura (27/09/2026):** não há aplicação Access salva nem regra efetiva para `/api`; a inspeção anterior apenas confirmou que o formulário aceita hostname e caminho. O root público e a API precisam ser testados separadamente se Access for escolhido. Mesmo com Access na borda, cada Pages Function deve validar o JWT assinado e derivar o proprietário da identidade validada. O banco precisa aplicar o filtro por proprietário em todas as operações; proteção de rota sozinha não isola registros. A API nunca deve confiar em um ID de proprietário recebido do cliente.

Antes de implementar, definir cadastro público e login, prever custos por usuário, escolher a fonte de identidade, definir o ID interno mapeado de `issuer + subject`, particionar o cache local por conta e especificar a migração confirmada dos quadros atuais do Rafael. Validar que a raiz permanece acessível localmente, que chamadas da API exigem identidade e que usuários distintos não conseguem ler, alterar ou excluir dados uns dos outros. Compartilhamento futuro exige autorização por quadro separada.

**Critérios para considerar o MVP futuro resiliente:** o modo local funciona durante indisponibilidade de serviços; cópia inicial pede confirmação; conflitos e exclusões são recuperáveis; autorização é validada no servidor por quadro; identidade possui mapeamento interno migrável; exportação completa e restauração foram exercitadas; custo/cotas e limites de recuperação são conhecidos. A configuração de Access, Pages Functions e D1 e esses ensaios pertencem à implementação futura, ainda não realizada.
