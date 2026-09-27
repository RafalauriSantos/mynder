# Mynder

Espaço visual para organizar ideias, conectar conceitos e desenhar livremente no mesmo quadro.

O protótipo combina mapa mental gerado a partir de Markdown com um canvas editável de nós, conexões e desenhos.

## Executar

```powershell
npm install
npm run dev -- --host 0.0.0.0
```

No computador, abra o endereço informado pelo Vite. Para testar em um celular na mesma rede Wi-Fi, use o endereço `http://IP-DO-COMPUTADOR:5173/`.

## Fluxo principal

1. Use `Texto → mapa` para importar Markdown em um novo documento.
2. Selecione um nó para editar, adicionar filho/irmão, conectar, mudar o pai ou excluir o ramo.
3. Use a barra inferior para caneta, marca-texto, retângulo, elipse, seta, texto e borracha.
4. Salve manualmente ou aguarde o salvamento local automático.
5. Use `Exportar` para gerar um JSON transferível para outro navegador ou dispositivo.

Os dados ficam no `localStorage` do navegador. O backup é mantido na chave local anterior; o app não sincroniza dispositivos.

## Validação atual

`npm run build` passa. Os testes `node --test document.test.mjs storage.test.mjs` passam (12 casos). A interação foi verificada no navegador integrado em desktop e em viewport simulado de 390×844. A validação em aparelho Android ou iOS real ainda depende de um dispositivo acessível na mesma rede.

## Licença

MIT.
