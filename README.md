# Mynder

Espaço visual para organizar ideias, conectar conceitos e desenhar livremente no mesmo quadro.

Mynder tem dois modos no mesmo quadro: **Mapa mental**, renderizado com Markmap, e **Canvas livre**, para reorganizar nós, conectá-los e desenhar. As duas vistas compartilham a hierarquia. Edite o Markdown para regenerar o mapa; mudanças compatíveis preservam os nós e conexões existentes.

## Executar

```powershell
npm install
npm run dev -- --host 0.0.0.0
```

No computador, abra o endereço informado pelo Vite. Para testar em um celular na mesma rede Wi-Fi, use o endereço `http://IP-DO-COMPUTADOR:5173/`.

## Testar a versão publicada no celular

Abra [mynder.pages.dev](https://mynder.pages.dev/) no navegador do celular e use um quadro seu. Faça esta verificação curta:

Antes de editar seu quadro, toque em **Exportar** para guardar um backup. **Importar JSON** cria outro quadro com o sufixo “(importado)” e não substitui o atual.

1. Abra ou crie um quadro e confira se consegue editar o Markdown e ver a hierarquia mudar.
2. No Canvas, mova um nó, conecte dois nós e faça um desenho usando toque.
3. Toque em **Salvar**, recarregue a página e abra o quadro de novo. Confira se os nós, a conexão e o desenho continuam lá.
4. Toque em **Exportar**. Depois use **Importar JSON** e selecione o arquivo exportado; confira se o quadro importado abre com o mesmo conteúdo.
5. Em um quadro separado, apague os nós, toque em **Escrever uma ideia** e gere um mapa novo. Assim você verifica a recuperação sem apagar seu quadro pessoal.

Anote o modelo do celular, o navegador e qualquer toque que não funcionou. O armazenamento é local ao navegador e ao dispositivo; a importação deve usar o arquivo exportado, pois quadros não são sincronizados entre celulares ou navegadores.

### Conferir o backup completo sem tocar nos seus mapas

1. Abra `mynder.pages.dev` em uma aba anônima/privada do celular.
2. Crie dois mapas temporários em **Novo mapa**; coloque uma ideia diferente em cada um.
3. Toque em **Backup completo** e confirme que o arquivo `mynder-backup.json` foi baixado.
4. Toque em **Importar JSON**, escolha esse arquivo na pasta de Downloads/Arquivos e confira se os dois mapas aparecem com o sufixo “(importado)” e o conteúdo correto.
5. Feche a aba privada. Os mapas do navegador normal não são afetados; o arquivo de teste pode ser removido da pasta Downloads se desejar.

Esse roteiro testa toque, download e seleção do arquivo no aparelho físico. Não use seus mapas pessoais nessa validação: importar sempre cria cópias adicionais.

## Fluxo principal

1. Use `Texto → mapa` para criar um quadro a partir de Markdown.
2. Alterne entre `Mapa mental` e `Canvas livre`.
3. No Mapa mental, use `Editar Markdown` para regenerar a hierarquia.
4. No Canvas, selecione um nó para editar, adicionar filho/irmão, conectar, mudar o pai ou excluir o ramo.
5. Use a barra inferior para caneta, marca-texto, formas, seta, texto e borracha.
6. Salve manualmente ou aguarde o salvamento local automático; `Exportar` gera um JSON transferível.

Os dados ficam no `localStorage` do navegador. **Exportar** baixa o quadro aberto; **Backup completo** baixa todos os mapas e seus dados de canvas em um único JSON Mynder. Importar um arquivo de mapa ou backup completo acrescenta cópias à lista e não substitui os quadros existentes. Guarde o backup fora do dispositivo: o app não sincroniza dispositivos.

## Validação atual

Rode `npm test` para validar regras de documentos e armazenamento e `npm run build` para validar a compilação. Os dados ficam no `localStorage`; a validação de toque em aparelho Android ou iOS real ainda depende do uso em um dispositivo físico.

## Licença

MIT.
