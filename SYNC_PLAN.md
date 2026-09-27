# Plano proposto — sincronização pessoal

**Estado:** proposta para revisão; nenhum backend, banco, login ou sincronização foi implementado.

## Objetivo do primeiro incremento

Abrir os mesmos quadros no celular e no computador usando a mesma identidade. Cada aparelho continua podendo editar localmente e trabalhar sem conexão. Este incremento não inclui edição simultânea nem compartilhamento de quadros.

## Proposta técnica

1. **Manter a hospedagem atual e o endereço `mynder.pages.dev`.** Adicionar uma API pequena em Pages Functions sob `/api/*` e vinculá-la a um banco D1. Pages Functions aceita bindings D1 e executa no runtime Workers. Antes de codificar, confirmar no painel qual projeto publica o site: o endereço público é Pages, enquanto o `wrangler.jsonc` no repositório declara assets para Workers. Evitar manter dois deploys concorrentes.
2. **Usar Cloudflare Access com PIN por e-mail como autenticação inicial**, permitindo somente endereços aprovados. O servidor valida a asserção JWT do Access em cada endpoint e deriva a identidade do token validado; nunca aceita `ownerId` enviado pelo navegador. Isso evita criar fluxo próprio de senha, mas deixa o app inteiro privado para quem não foi aprovado. Access pode proteger o hostname `pages.dev` pelas configurações do projeto Pages e o plano Free cobre até 50 usuários. Se Mynder precisar continuar público para uso local sem login, será necessário outro fluxo de autenticação para a sincronização.
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

Na documentação Cloudflare consultada em 27/09/2026, o plano Workers Free inclui 100 mil chamadas de Worker/Pages Functions por dia. D1 Free inclui 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia, 500 MB por banco (5 GB no total da conta) e recuperação Time Travel por 7 dias. O plano Free de Cloudflare One/Access cobre até 50 usuários. Esses limites parecem amplos para uso pessoal, mas são cotas: chamadas Pages Functions contam no limite de Workers; quando as cotas diárias do D1 são excedidas, consultas falham até o reset. Confirmar os valores atuais e o comportamento de falha antes do deploy.

Referências oficiais:

- [Pages Functions e bindings](https://developers.cloudflare.com/pages/functions/)
- [Bindings D1 em Pages](https://developers.cloudflare.com/pages/functions/bindings/)
- [Limites do D1](https://developers.cloudflare.com/d1/platform/limits/)
- [Preço do D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Preço de Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare One: planos e preços](https://www.cloudflare.com/plans/zero-trust-services/)
- [Cloudflare Access em `pages.dev`](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
- [PIN de uso único do Access](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Validação JWT do Access em Pages Functions](https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/)

## Fora deste incremento

Compartilhamento entre pessoas, permissões por quadro, colaboração em tempo real, mesclagem de conflitos, migração para domínio próprio e cobrança. Compartilhamento vem depois e exigirá regras de acesso por quadro; liberar um endereço no Access não substitui essas regras.

## Decisão necessária antes da implementação

Escolher entre: (A) tornar todo o Mynder privado atrás do Access, recomendado para a sincronização pessoal mais simples; ou (B) manter o modo local público e criar uma autenticação separada apenas para a sincronização. A opção B dá mais liberdade futura, mas requer mais implementação e manutenção.
