# Mynder

Espaço visual para organizar ideias, conectar conceitos e desenhar livremente no mesmo quadro.

Mynder tem dois modos no mesmo quadro: **Mapa mental**, renderizado com Markmap, e **Canvas livre**, para reorganizar nós, conectá-los e desenhar. As duas vistas compartilham a hierarquia. Edite o Markdown para regenerar o mapa; mudanças compatíveis preservam os nós e conexões existentes.

## Executar

```powershell
npm install
npm run dev -- --host 0.0.0.0
```

No computador, abra o endereço informado pelo Vite. Para testar em um celular na mesma rede Wi-Fi, use o endereço `http://IP-DO-COMPUTADOR:5173/`.

## Fluxo principal

1. Use `Texto → mapa` para criar um quadro a partir de Markdown.
2. Alterne entre `Mapa mental` e `Canvas livre`.
3. No Mapa mental, use `Editar Markdown` para regenerar a hierarquia.
4. No Canvas, selecione um nó para editar, adicionar filho/irmão, conectar, mudar o pai ou excluir o ramo.
5. Use a barra inferior para caneta, marca-texto, formas, seta, texto e borracha.
6. Salve manualmente ou aguarde o salvamento local automático; `Exportar` gera um JSON transferível.

Os dados ficam no `localStorage` do navegador. O backup é mantido na chave local anterior; o app não sincroniza dispositivos.

## Validação atual

Rode `npm test` para validar regras de documentos e armazenamento e `npm run build` para validar a compilação. Os dados ficam no `localStorage`; a validação em aparelho Android ou iOS real ainda depende de um dispositivo acessível na mesma rede.

## Licença

MIT.
