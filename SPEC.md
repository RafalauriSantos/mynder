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
4. **Os dados pertencem à pessoa.** O protótipo salva no navegador e oferece exportação local.
5. **Interface quieta, conteúdo em destaque.** A identidade deve parecer uma ferramenta de pensamento, com espaço, contraste legível e controles claros.

## Experiência principal

1. A pessoa cria um quadro vazio ou cola texto/Markdown.
2. Mynder converte títulos e listas em nós organizados hierarquicamente.
3. A pessoa ajusta a estrutura no canvas, adicionando nós, conexões e desenhos.
4. O quadro salva localmente e pode ser exportado como JSON.

## Escopo do protótipo atual

- Lista local de quadros, com criação e seleção.
- Conversão de texto/Markdown em hierarquia editável no canvas.
- Edição de texto, criação de nós filhos e irmãos, mudança de pai, recolhimento de ramos e organização automática.
- Conexões livres entre nós.
- Desenho livre: caneta, marca-texto, formas, setas, texto e borracha.
- Seleção, arraste, zoom, pan, ajuste à tela, desfazer/refazer e exportação/importação JSON.
- Salvamento no `localStorage`; sem conta, servidor de dados ou sincronização entre dispositivos.
- Layout responsivo para desktop e celular.

## Distinções importantes

- O fluxo atual converte Markdown em nós do canvas. Ainda não há uma visualização Markmap separada nem sincronização bidirecional entre Markdown e mapa depois da importação.
- A aparência desejada pode se aproximar de mapas mentais visuais como os do NotebookLM, mas Mynder deve manter edição livre e desenho no próprio quadro.
- “Profissional” nesta etapa significa identidade coerente, interface confiável, boa usabilidade e dados exportáveis; não implica login ou infraestrutura de equipe.

## Fora do escopo por enquanto

Login, nuvem e sincronização, colaboração simultânea, inteligência artificial, agentes, RAG, integrações MCP, banco externo, permissões de equipe, cobrança e arquitetura distribuída.

## Critérios de qualidade

- Uma pessoa consegue criar um quadro, importar uma ideia e continuar editando sem sair da tela principal.
- Hierarquia e conexões livres são visualmente distinguíveis.
- Salvamento e exportação são compreensíveis; dados existentes continuam legíveis após atualizações.
- Os controles essenciais funcionam em telas pequenas e não bloqueiam o quadro.
- A marca Mynder aparece de forma consistente na interface, na aba e nos materiais do projeto.

## Próximas etapas

### Etapa 1 — Fundamento visual e identidade

Aplicar a marca Mynder, estabelecer tipografia, cores, hierarquia de controles e estados de interação. Preservar o formato dos documentos e as chaves de armazenamento atuais.

### Etapa 2 — Fluxo de mapa mental

Dar mais clareza ao começo por texto/Markdown, à edição da estrutura e à transição para o quadro livre. Avaliar uma apresentação de mapa visual mais próxima do modo radial/orgânico, mantendo os mesmos dados editáveis.

### Etapa 3 — Robustez de uso pessoal

Revisar estados vazios, salvamento, recuperação e exportação/importação; validar o uso real em celular e desktop.

### Etapa 4 — Decisão de produto

Só após uso recorrente, decidir se Mynder precisa de sincronização na nuvem ou compartilhamento. Essa decisão muda privacidade, autenticação, suporte e custo.

## Decisão técnica atual

Aplicação web em React, TypeScript e Vite; canvas baseado em React Flow; desenhos vetoriais persistidos como dados; armazenamento local no navegador; hospedagem estática no Cloudflare Pages. Manter a solução simples enquanto o fluxo principal é validado.
