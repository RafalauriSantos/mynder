# Mynder

Espaço visual para organizar ideias, conectar conceitos e desenhar livremente no mesmo quadro.

> English (principal): [README.md](README.md). Este é o guia em português.

O Mynder tem dois modos no mesmo quadro: **Mapa mental**, renderizado com Markmap, e **Canvas livre**, para reorganizar nós, conectá-los e desenhar. As duas vistas compartilham a hierarquia. Edite o Markdown para regenerar o mapa; mudanças compatíveis preservam os nós e conexões existentes.

Aplicativo publicado: [mynder.pages.dev](https://mynder.pages.dev/).

## Executar

Use Node 22 (a versão do CI).

```bash
npm install
npm run dev -- --host 0.0.0.0
```

No computador, abra o endereço informado pelo Vite. Para testar em um celular na mesma rede Wi-Fi, use `http://IP-DO-COMPUTADOR:5173/`.

## Publicação

O projeto Cloudflare Pages `mynder` publica o repositório `RafalauriSantos/mynder`: push para `main` inicia automaticamente `npm run build` e publica `dist` em [mynder.pages.dev](https://mynder.pages.dev/). Esse é o fluxo normal de produção.

Para uma publicação manual do branch atual no mesmo projeto Pages, use `npm run deploy`. Prefira o push para `main` no uso normal. Variáveis do projeto Pages só valem a partir do deploy seguinte. A configuração completa para hospedar por conta própria está no [README.md](README.md#self-hosting).

## Como usar

1. Em **Novo mapa**, na lista lateral, crie um quadro. Em **···**, use **Novo mapa por texto** para criar um quadro a partir de Markdown.
2. Alterne entre **Mapa mental** e **Canvas livre** na barra do topo.
3. No Mapa mental, passe o mouse sobre um ramo e use o **+** para adicionar um filho. Em **···**, **Editar estrutura em Markdown** regenera a hierarquia inteira.
4. No Canvas, use a coluna de ferramentas à esquerda (nó livre, selecionar, mover, caneta, marca-texto, retângulo, elipse, seta, texto, borracha e cor) e a barra de cima (organizar ramos, ajustar à tela, desfazer e refazer). Ao selecionar um nó, aparecem as ações editar, adicionar filho ou irmão, conectar, mudar o pai e apagar o ramo.
5. Salve com o botão de salvar ou `Ctrl/Cmd+S`, ou aguarde o salvamento automático. `Ctrl/Cmd+Z` desfaz.
6. A tecla `F` abre o modo foco, que esconde as barras; `Esc` sai. O ícone de painel recolhe a lista de mapas.

### Onde ficam os dados

Sem conta, os dados ficam no `localStorage` do navegador. Em **···** estão **Exportar este mapa**, **Importar JSON** e **Backup completo**. O backup baixa todos os mapas e seus dados de canvas em um único JSON Mynder. Importar um arquivo de mapa ou de backup acrescenta cópias à lista e não substitui os quadros existentes. Guarde o backup fora do dispositivo.

### Entrar com Google e sincronizar

No ícone de conta, **Entrar com Google** mantém seus mapas na nuvem e sincronizados entre aparelhos. O app busca novidades a cada 10 segundos e ao voltar para a aba, e nunca sobrescreve uma edição de nenhum dos lados: em caso de conflito, as cópias locais são preservadas para você revisar. O navegador lembra apenas que você já entrou e pede ao Google uma credencial nova ao carregar; nenhum token é guardado em disco. **Sair desta conta** desfaz isso.

Na primeira vez, o app oferece copiar os mapas locais para a conta. As cópias são criadas e os originais não são movidos nem apagados.

### Uso sem conexão

Depois de abrir o Mynder conectado pelo menos uma vez e aparecer “Mynder está pronto para abrir sem conexão neste navegador”, o shell e os arquivos da aplicação ficam em cache para reabrir o app sem rede. Os quadros continuam no `localStorage` desse navegador; o primeiro acesso, outro navegador ou dados do site apagados exigem conexão. Isso não substitui backups exportados. Quando uma nova versão estiver disponível, o app oferece **Atualizar** ou deixar para depois, e a atualização salva os mapas antes de recarregar.

## Testar no celular

Abra [mynder.pages.dev](https://mynder.pages.dev/) no navegador do celular e use um quadro seu. Antes de editar, abra **···** e toque em **Exportar este mapa** para guardar um backup. **Importar JSON** cria outro quadro com o sufixo “(importado)” e não substitui o atual.

1. Abra ou crie um quadro, use o **+** de um ramo e confira se a hierarquia muda.
2. No Canvas, mova um nó, conecte dois nós e faça um desenho usando toque.
3. Toque em salvar, recarregue a página e abra o quadro de novo. Confira se os nós, a conexão e o desenho continuam lá.
4. Em **···**, toque em **Exportar este mapa**. Depois use **Importar JSON** e selecione o arquivo exportado; confira se o quadro importado abre com o mesmo conteúdo.
5. Em um quadro separado, apague os nós, toque em **Escrever uma ideia** e gere um mapa novo. Assim você verifica a recuperação sem apagar seu quadro pessoal.

### Conferir o backup completo sem tocar nos seus mapas

1. Na aba normal, abra **···** e toque em **Backup completo**. Confirme que `mynder-backup.json` foi baixado.
2. Abra `mynder.pages.dev` em uma aba anônima/privada do celular.
3. Em **···**, toque em **Importar JSON** e escolha o backup na pasta de Downloads/Arquivos.
4. Confira se os mapas aparecem com o sufixo “(importado)”. Abra seu quadro e confira o conteúdo no Mapa mental e no Canvas.
5. Feche a aba privada. A lista original continua intacta.

### Validar o uso offline no celular

Use o mesmo navegador e aparelho durante todo o teste, e confirme que tem um backup recente.

1. Com a internet ligada, abra [mynder.pages.dev](https://mynder.pages.dev/) e espere aparecer “Mynder está pronto para abrir sem conexão neste navegador”. Abra um quadro seu.
2. Faça uma alteração pequena e salve. Desligue Wi-Fi e dados móveis (ou ative o modo avião), feche a aba e abra novamente o mesmo endereço.
3. Confirme que o app e o quadro abrem. Faça outra alteração, salve e recarregue a página ainda sem internet; confira se ela continua lá.
4. Em **···**, toque em **Exportar este mapa** sem internet e confira se o arquivo JSON aparece nos Downloads/Arquivos. Depois, ligue a internet novamente.

Anote o modelo do aparelho e o navegador. Se algum passo falhar, informe o número e o que apareceu; não limpe os dados do site durante o teste.

## Validação

```bash
npm test                 # regras de documentos, armazenamento, backup e sincronização
npm run test:cloudflare  # Pages Functions e Worker MCP
npm run build
```

Se `npm test` falhar com `ERR_UNKNOWN_FILE_EXTENSION`, seu Node não importa arquivos `.ts` diretamente; o CI, com o Node 22 oficial, é a referência. O uso offline em celular físico foi confirmado e está registrado na etapa 7 da [SPEC.md](SPEC.md).

## Limitações conhecidas

- O login do app publicado está em modo de teste no Google: só contas cadastradas como usuários de teste entram. O modo local funciona para todos, sem conta.
- A sincronização é quase em tempo real, não instantânea: mudanças feitas em outro lugar aparecem em até cerca de 10 segundos.
- O servidor MCP não é hospedado por você: é preciso publicar seu próprio Worker (veja o [README.md](README.md#self-hosting)).
- Os testes automáticos cobrem a lógica, a sincronização, a API e o Worker MCP; as interações do editor e do canvas são conferidas à mão.

## Licença

MIT.
