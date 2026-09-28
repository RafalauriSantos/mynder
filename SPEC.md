# Mynder — especificação do produto

## Visão

Mynder é um espaço pessoal para pensar visualmente. A pessoa começa com uma ideia, organiza conceitos como um mapa mental e continua trabalhando no mesmo quadro: cria nós, estabelece relações e desenha à mão livre.

**Promessa do produto:** transformar pensamentos em um mapa visual que continua editável.

## Para quem

Para quem estuda, planeja projetos ou precisa organizar uma explicação sem ter de escolher entre uma árvore rígida e uma tela em branco.

## Princípios

1. **O quadro é o centro.** Hierarquia, conexões livres e desenhos convivem no mesmo espaço.
2. **Começar é rápido.** Uma ideia pode ser colada como texto ou Markdown e virar uma estrutura visual.
3. **A estrutura continua maleável.** Nós podem ser movidos, editados, recolhidos, reorganizados e conectados de outras formas.
4. **Os dados pertencem à pessoa.** O uso local não depende de conta ou conexão; exportação em formato aberto permite levar os quadros para fora do serviço.
5. **Interface quieta, conteúdo em destaque.** A identidade deve parecer uma ferramenta de pensamento, com espaço, contraste legível e controles claros.

## Experiência principal

1. A pessoa cria um quadro ou cola texto/Markdown.
2. Mynder converte títulos e listas em uma hierarquia e mostra o mapa mental.
3. A pessoa alterna para o canvas livre para mover nós, criar conexões e desenhar.
4. As duas vistas mostram a mesma hierarquia; editar Markdown atualiza o mapa e o canvas.
5. O quadro salva localmente e pode ser exportado como JSON.

## Escopo do protótipo atual

- Lista local de quadros, com criação e seleção.
- Modo Mapa mental com Markmap e expansão/recolhimento de ramos.
- Modo Canvas livre com a hierarquia editável, conexões independentes e desenhos.
- Conversão de texto/Markdown em hierarquia compartilhada; regenerar Markdown atualiza as duas vistas.
- O estado sem nós oferece ação direta para inserir Markdown e reconstruir o mesmo quadro.
- Edição de texto, criação de nós filhos e irmãos, mudança de pai, recolhimento de ramos e organização automática.
- Conexões livres entre nós.
- Desenho livre: caneta, marca-texto, formas, setas, texto e borracha.
- Seleção, arraste, zoom, pan, ajuste à tela, desfazer/refazer e exportação/importação JSON.
- Exportação de um mapa ou de todos os mapas em um backup JSON; importar backup acrescenta cópias sem substituir documentos locais.
- Salvamento no `localStorage`; sem conta, servidor de dados ou sincronização entre dispositivos.
- Princípio para futuras etapas de nuvem: sincronização é uma cópia recuperável, nunca requisito para abrir ou editar localmente; falhas de autenticação, rede ou serviço não podem apagar nem bloquear dados locais.
- Layout responsivo para desktop e celular; na revisão de 27/09/2026, o canvas foi conferido em viewport de navegador de 390 × 844 px. A revisão não substitui teste em aparelho físico.

## Distinções importantes

- A estrutura dos nós é compartilhada entre Mapa mental e Canvas. Conexões livres e desenhos são recursos do Canvas.
- A edição de Markdown reconstrói a hierarquia. IDs e posições de nós cujo caminho e texto continuam iguais são preservados; conexões ligadas a nós removidos são descartadas e desenhos permanecem no quadro.
- A aparência desejada pode se aproximar de mapas mentais visuais como os do NotebookLM, mas Mynder deve manter edição livre e desenho no próprio quadro.
- “Profissional” nesta etapa significa identidade coerente, interface confiável, boa usabilidade e dados exportáveis; não implica login ou infraestrutura de equipe.

## Fora do escopo por enquanto

Login, nuvem e sincronização, colaboração simultânea, inteligência artificial, agentes, RAG, integrações MCP, banco externo, permissões de equipe, cobrança e arquitetura distribuída.

## Critérios de qualidade

- Uma pessoa consegue criar um quadro, importar uma ideia e continuar editando sem sair da tela principal.
- Hierarquia e conexões livres são visualmente distinguíveis.
- Salvamento e exportação são compreensíveis; dados existentes continuam legíveis após atualizações.
- Indisponibilidade da nuvem ou do provedor de identidade não impede abrir, editar e exportar quadros locais.
- Dados sincronizados podem ser exportados em formato Mynder independente do provedor e restaurados após falha ou troca de serviço.
- Os controles essenciais funcionam em telas pequenas e não bloqueiam o quadro.
- A marca Mynder aparece de forma consistente na interface, na aba e nos materiais do projeto.

## Validação automatizada

`npm test` cobre regras de Markdown, hierarquia, regeneração, conexões, validação JSON e armazenamento local. GitHub Actions roda os testes e a compilação em cada push para `main` e em pull requests. A interação e a qualidade visual continuam precisando de revisão no navegador; esta etapa ainda não inclui testes de ponta a ponta.

## Próximas etapas

### Etapa 1 — Fundamento visual e identidade (concluída)

Aplicar a marca Mynder, estabelecer tipografia, cores, hierarquia de controles e estados de interação. Preservar o formato dos documentos e as chaves de armazenamento atuais.

### Etapa 2 — Refinar o fluxo de mapa mental (concluída)

Dar mais clareza ao começo por texto/Markdown, à edição da estrutura e à transição para o quadro livre. Refinar controles de navegação, edição por toque e apresentação radial/orgânica sem duplicar os dados.

**Validação (27/09/2026):** na versão publicada, em viewport de navegador de 390 × 844 px, foi conferido o fluxo Markdown → mapa → edição do Markdown → Canvas; o novo ramo apareceu nas duas vistas com a hierarquia correspondente. Depois, o usuário confirmou ter testado em celular físico com um quadro próprio, incluindo editar o mapa, usar o Canvas e salvar/recarregar; relatou que tudo funcionou bem. O modelo do aparelho, o navegador e interações específicas como conexão e desenho não foram detalhados. **Etapa concluída** com base nessa validação relatada pelo usuário.

### Etapa 3 — Robustez de uso pessoal

Revisar estados vazios, salvamento, recuperação e exportação/importação; validar o uso real em celular e desktop.

**Estado vazio (concluído):** em viewport de navegador de 390 × 844 px, apagar o último nó mostrou a ação para escrever uma ideia. Preencher o Markdown reconstituiu o mesmo quadro, sem duplicar a lista; após salvar e recarregar, a hierarquia continuou disponível no Canvas. Isso não substitui a validação em aparelho físico.

**Exportação/importação e canvas móvel (concluídos no navegador):** em viewport de 390 × 844 px, exportar e importar um quadro preservou os 7 nós e sua hierarquia. No Canvas, uma conexão livre e um desenho foram mantidos no JSON exportado; salvar e recarregar manteve esses elementos no quadro. Durante essa revisão, a barra de ações de um nó selecionado cobria os controles superiores em tela pequena e impedia tocar em “Importar JSON”. A barra agora ocupa uma faixa própria entre os controles do quadro e o Canvas, com rolagem horizontal no celular. Após o ajuste, a importação foi repetida com um nó selecionado e funcionou. A tela também foi revisada em viewport de navegador de 1280 × 800 px.

**Validação física (27/09/2026):** após o roteiro atualizado, o usuário confirmou que testou no celular com um quadro próprio e que está tudo certo. Considero confirmados os fluxos do roteiro: editar Markdown, manipular e desenhar no Canvas, salvar e recarregar, exportar e importar JSON, e recuperar um quadro vazio separado. O modelo do aparelho e o navegador não foram informados.

**Validação automatizada da etapa 3 (27/09/2026):** `npm test` passou com 14 testes; `npm run build` concluiu. O bundler emitiu um aviso informativo sobre `use client` em `@xyflow/react`. A revisão do navegador não registrou erros de console. O ajuste visual foi revisado nas viewports de navegador indicadas acima; não equivale a teste físico.

**Etapa 3 concluída:** validações automatizadas, revisão de navegador e teste físico relatado pelo usuário cobrem os fluxos desta etapa. O roteiro usado está em [README.md](README.md), seção “Testar a versão publicada no celular”.

### Etapa 4 — Decisão de produto

**Direção definida com o usuário:** a evolução desejada segue esta ordem: primeiro sincronizar os quadros da mesma pessoa entre seus dispositivos; depois permitir compartilhar quadros com outras pessoas. A preferência define prioridade de produto, mas não define arquitetura, autenticação, privacidade, custos ou prazo.

**Limite atual:** o protótipo continua local, com exportação/importação JSON. Nenhuma sincronização ou colaboração foi implementada. Planejar cada uma em uma etapa própria, começando pela sincronização pessoal e considerando seus efeitos em privacidade, autenticação, suporte e custo.

### Etapa 5 — Planejar sincronização pessoal (plano aprovado; implementação pendente)

O usuário aprovou em 27/09/2026 o plano em [SYNC_PLAN.md](SYNC_PLAN.md): abrir os mesmos quadros em dispositivos diferentes, preservar uso local/offline, manter uma cópia remota recuperável, exportação portátil e conflitos recuperáveis. A recomendação é validar primeiro Cloudflare IdP restrito a membros da conta; Google continua alternativa, então o provedor final ainda precisa ser confirmado. A inspeção anterior registrou Pages Git integration em `mynder.pages.dev`, produção na branch `main`, build `npm run build` e saída `dist`; sem bindings D1 ou variáveis/segredos, sem aplicação Access e com Cloudflare como IdP listado, sem Google. Nenhum login, backend ou sync foi iniciado; a aprovação do plano não alterou recursos Cloudflare.

### Etapa 6 — Portabilidade local completa

**Implementação concluída:** o botão “Backup completo” exporta todos os mapas, incluindo conexões, desenhos e viewport, num JSON identificado como backup Mynder v1. A importação ainda aceita JSON de mapa individual e também reconhece o backup completo; mapas entram como cópias com novos IDs de documento, sem substituir os que já existem. Arquivos antigos de mapa continuam aceitos.

**Validação feita:** `npm test` passou com 18 testes, incluindo roundtrip de múltiplos mapas, preservação de conteúdo de canvas, importação do formato individual e rejeição de backups inválidos; `npm run build` passou. Na versão publicada `mynder.pages.dev`, um fluxo Playwright isolado usou três mapas fictícios: baixou um arquivo Mynder v1 com os três mapas, importou-o e exibiu as três cópias com sufixo “(importado)”. Uma cópia foi aberta tanto no Mapa mental como no Canvas. O estado responsivo foi conferido em viewport de 390 × 844 px; console sem erros nem avisos. A interface local também havia sido revista em 713 × 720 px.

**Validação física confirmada (27/09/2026):** o usuário confirmou que conseguiu baixar e importar o backup completo pelo navegador do celular, usando um quadro próprio e seguindo o roteiro em aba privada para manter a lista original intacta. O modelo do aparelho e o navegador não foram informados.

**Etapa 6 concluída:** portabilidade de múltiplos mapas foi validada por testes automatizados, navegador isolado e teste físico relatado pelo usuário.

### Etapa 7 — Acesso local quando a rede falha (concluída)

**Objetivo:** depois de uma primeira visita conectada, permitir abrir o shell do app sem rede e continuar editando e salvando mapas existentes no armazenamento local. A implementação não cria conta, API ou sync. O service worker pré-armazena os recursos de produção e mostra uma confirmação para atualizações; antes de atualizar, salva os mapas locais. A primeira abertura, outro navegador/dispositivo ou dados do site apagados ainda exigem rede; backups continuam necessários.

**Validação em desktop (27/09/2026):** build de produção local servido por `wrangler pages dev`, viewport de navegador de 1536 × 864 px. O aviso “Mynder está pronto para abrir sem conexão neste navegador” apareceu. Com o servidor interrompido, recarregar abriu o app pelo cache; um quadro sintético previamente salvo apareceu na lista, foi editado sem conexão e continuou disponível após novo recarregamento offline. O botão Exportar permaneceu disponível; o download não pôde ser confirmado no desktop.

**Publicado para validação física (27/09/2026):** o commit `4918136` foi publicado automaticamente em produção pelo Cloudflare Pages e o painel registrou status `success`. O app está disponível em [mynder.pages.dev](https://mynder.pages.dev/).

**Validação física confirmada pelo usuário (27/09/2026):** o usuário confirmou que o teste offline passou em um celular físico usando um quadro próprio. O roteiro cobria primeira abertura conectada, reabertura com a rede desligada, edição e salvamento, recarregamento offline com a edição preservada e exportação do JSON sem conexão. Isso confirma também a exportação que não pôde ser verificada no teste desktop. Modelo do aparelho e navegador não foram informados.

**Etapa 7 concluída:** shell do app, quadro local, edição/salvamento após recarga offline e exportação foram validados em uso físico relatado pelo usuário; o desktop também confirmou a reabertura e persistência offline. A confirmação física é relato do usuário, sem telemetria ou identificação do aparelho.

## Decisão técnica atual

Aplicação web em React, TypeScript e Vite; canvas baseado em React Flow; desenhos vetoriais persistidos como dados; armazenamento local no navegador; hospedagem estática no Cloudflare Pages. Manter a solução simples enquanto o fluxo principal é validado.
