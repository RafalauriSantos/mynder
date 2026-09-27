# Plano proposto — sincronização pessoal

**Estado:** proposta de MVP pronta para revisão; nenhuma infraestrutura, conta de autenticação ou sincronização foi implementada.

## Objetivo do primeiro incremento

Abrir os mesmos quadros no celular e no computador usando a mesma identidade. Cada aparelho continua podendo editar localmente e trabalhar sem conexão. Este incremento não inclui edição simultânea nem compartilhamento de quadros.

## Proposta técnica

1. **Manter a hospedagem atual e o endereço `mynder.pages.dev`.** Adicionar uma API pequena em Pages Functions sob `/api/*` e vinculá-la a um banco D1. Pages Functions aceita bindings D1 e executa no runtime Workers. Antes de codificar, confirmar no painel qual projeto publica o site: o endereço público é Pages, enquanto o `wrangler.jsonc` no repositório declara assets para Workers. Evitar manter dois deploys concorrentes.
2. **Usar Cloudflare Access com Google apenas na API de sincronização.** O app e os quadros locais continuam públicos e sem login; ao ativar sync, a pessoa passa pelo login do Access usando Google. A política deve permitir somente a conta Google do proprietário nesta etapa pessoal. O Pages Function valida o JWT do Access em cada chamada e obtém a identidade apenas dessa asserção verificada; nunca aceita `ownerId` enviado pelo navegador. Não criar senhas, cadastro próprio nem reset de senha.
3. **Guardar um documento Mynder v2 inteiro por linha no D1.** Cada linha associa identidade autenticada, ID do quadro, revisão, JSON e data de atualização. Usar prepared statements e verificar que a identidade tem acesso ao quadro em toda leitura ou escrita.
4. **Manter `localStorage` como cópia de trabalho e preservar a exportação JSON.** No primeiro acesso autenticado, mostrar os quadros locais e pedir confirmação antes de copiá-los para a nuvem. Nunca limpar os dados locais como efeito da sincronização.
5. **Sincronizar ao abrir e depois de salvar, com indicador de estado.** Sem conexão, salvar localmente e marcar pendência para nova tentativa. Cada gravação remota inclui a revisão que o aparelho leu; se outra edição já avançou a revisão, recusar a sobrescrita e preservar uma cópia recuperável do conflito. Sem mesclagem automática ou colaboração em tempo real.
6. **Propagar exclusões como marcações de excluído**, para quadros apagados em um aparelho não reaparecerem ao sincronizar outro. A recuperação deve ser explícita e compatível com o backup local.

## Critérios de aceite do futuro MVP

- Entrar com a mesma identidade em dois aparelhos carrega os mesmos quadros.
- Uma edição salva em um aparelho aparece no outro após sincronizar.
- Uma edição offline continua salva localmente e sincroniza depois, sem perder conteúdo.
- Edições concorrentes do mesmo quadro não se sobrescrevem silenciosamente; uma cópia recuperável é apresentada.
- Uma identidade não consegue ler, substituir ou excluir os quadros de outra.
- A importação inicial pede confirmação e não apaga a cópia local; exportação/importação JSON continuam funcionando.
- Falha de autenticação ou de rede mostra estado compreensível e mantém os dados locais disponíveis.

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

## Decisões registradas

O app continua público e utilizável localmente sem conta. O login Google via Cloudflare Access será exigido somente para sincronizar quadros entre dispositivos, condicionado ao ensaio de roteamento indicado abaixo.

### Recomendação de autenticação

Recomenda-se Cloudflare Access usando Google como provedor de identidade e protegendo apenas a API de sync. Para o estágio de sincronização pessoal, permitir somente o e-mail do proprietário; o modo local segue público. O Access valida o login, Pages Functions valida a asserção JWT e D1 guarda os quadros separados por identidade. Isso evita construir e operar cadastro, senha, verificação de e-mail e recuperação de conta. O plano Access Free admite até 50 usuários e a configuração Google documentada não requer Google Workspace nem domínio próprio.

### Limitação e pré-requisito de implementação

A documentação confirma que Access aceita regras por caminho, que Pages integra com Access em `pages.dev` e que Pages Functions pode validar JWTs do Access. Contudo, o procedimento documentado para habilitar Access na URL de produção `pages.dev` protege o hostname; ele não demonstra claramente que a integração pelo painel permite limitar a proteção apenas a `/api/*`. Antes de implementar, fazer um ensaio de configuração sem publicar alterações: confirmar no painel do projeto se a aplicação Access pode ser limitada a `/api/*` e verificar que `/` continua público. Se o Pages não permitir essa combinação, reavaliar o desenho antes de codificar; não proteger o app inteiro por acidente.

O login Google via Access é autenticação de acesso ao app e pode servir à sync pessoal. Não equivale a cadastro aberto de usuários Mynder. Compartilhamento futuro exige autorização por quadro e regras de membros no backend, independente do login.

**Critérios para considerar este planejamento concluído:** objetivo e exclusões do MVP definidos; cópia local e importação inicial protegidas; controle de conflito e exclusão especificados; modelo de identidade e segurança por quadro definidos; custo gratuito e pré-requisito de roteamento registrados. A configuração real de Access, OAuth, Pages Functions e D1 pertence a uma etapa de implementação posterior.
