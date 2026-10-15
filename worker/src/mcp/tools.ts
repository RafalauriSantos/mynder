import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Env } from '../env';
import {
  addBranch, addNode, blank, deleteNode, duplicateDocument, importMarkdown, linkNodes, moveNode, organizeDocument, outline,
  regenerateMarkdown, renameDocument, renameNode, setCollapsed, setColor, unlinkNodes, validate, type Document,
} from '../../../src/domain/index';
import { createMap, deleteMap, getMap, listMaps, mutateMap, updateMap } from '../db/maps';

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Falha inesperada.' }] });
const saved = (document: Document, version: number, extra = '') => text(`${extra}${extra ? '\n\n' : ''}${outline(document)}\n\n(versão ${version})`);
const mapId = z.string().min(1).describe('ID do mapa (use list_maps).');
const nodeId = z.string().min(1).describe('ID do nó, o valor entre colchetes em get_outline.');

export function registerTools(mcp: McpServer, env: Env, ownerId: string): void {
  const db = env.DB;
  const run = (fn: () => Promise<ReturnType<typeof text>>) => fn().catch(failure);
  const edit = (id: string, change: (document: Document) => Document, extra?: (document: Document) => string) =>
    run(async () => { const { document, version } = await mutateMap(db, ownerId, id, change); return saved(document, version, extra?.(document)); });

  mcp.registerTool('list_maps', { description: 'Lista os mapas mentais com id, título e versão. Comece por aqui.' }, () => run(async () => text(JSON.stringify(await listMaps(db, ownerId)))));
  mcp.registerTool('get_outline', { description: 'Mostra a árvore do mapa em texto compacto, com o ID de cada nó e as conexões. Use antes de editar para saber os IDs.', inputSchema: { mapId } }, ({ mapId: id }) => run(async () => {
    const document = await getMap(db, ownerId, id);
    return document ? text(outline(document)) : failure(new Error('Mapa não encontrado.'));
  }));
  mcp.registerTool('get_map', { description: 'Lê o documento completo em JSON (posições, cores, desenhos). Prefira get_outline.', inputSchema: { mapId } }, ({ mapId: id }) => run(async () => {
    const document = await getMap(db, ownerId, id);
    return document ? text(JSON.stringify(document)) : failure(new Error('Mapa não encontrado.'));
  }));
  mcp.registerTool('get_map_markdown', { description: 'Exporta o mapa como Markdown (títulos e listas).', inputSchema: { mapId } }, ({ mapId: id }) => run(async () => {
    const document = await getMap(db, ownerId, id);
    return document ? text(document.markdown) : failure(new Error('Mapa não encontrado.'));
  }));
  mcp.registerTool('create_map', { description: 'Cria um mapa. Com markdown, a hierarquia vem de títulos (#) e listas (-); sem ele, cria um mapa com um nó central.', inputSchema: { title: z.string().min(1).max(200).optional(), markdown: z.string().max(100000).optional() } }, ({ title, markdown }) => run(async () => {
    const base = markdown ? importMarkdown(markdown) : blank(title);
    const document = await createMap(db, ownerId, title && markdown ? renameDocument(base, title) : base);
    return saved(document, 1, 'Mapa criado.');
  }));
  mcp.registerTool('set_markdown', { description: 'Reescreve a estrutura do mapa a partir de Markdown, preservando nós iguais (mesmo caminho e texto), posições e conexões. A forma mais rápida de reorganizar muita coisa.', inputSchema: { mapId, markdown: z.string().min(1).max(100000) } }, ({ mapId: id, markdown }) => edit(id, document => regenerateMarkdown(document, markdown)));
  mcp.registerTool('add_node', { description: 'Adiciona um nó. Sem parentId, cria uma nova raiz. O novo ID aparece na árvore devolvida.', inputSchema: { mapId, text: z.string().min(1).max(2000), parentId: nodeId.optional() } }, ({ mapId: id, text: label, parentId }) => edit(id, document => addNode(document, label, parentId).doc));
  mcp.registerTool('add_branch', { description: 'Adiciona vários nós de uma vez: um Markdown com a sub-árvore, colocado sob parentId (ou como novas raízes). Reorganiza o layout.', inputSchema: { mapId, markdown: z.string().min(1).max(100000), parentId: nodeId.optional() } }, ({ mapId: id, markdown, parentId }) => edit(id, document => addBranch(document, markdown, parentId).doc));
  mcp.registerTool('rename_node', { description: 'Muda o texto de um nó.', inputSchema: { mapId, nodeId, text: z.string().min(1).max(2000) } }, ({ mapId: id, nodeId: node, text: label }) => edit(id, document => renameNode(document, node, label)));
  mcp.registerTool('move_node', { description: 'Muda o pai de um nó (com seus filhos). Omitir newParentId torna o nó uma raiz. Recusa ciclos.', inputSchema: { mapId, nodeId, newParentId: nodeId.optional() } }, ({ mapId: id, nodeId: node, newParentId }) => edit(id, document => moveNode(document, node, newParentId)));
  mcp.registerTool('delete_node', { description: 'Apaga um nó e todos os seus descendentes, além das conexões ligadas a eles.', inputSchema: { mapId, nodeId } }, ({ mapId: id, nodeId: node }) => edit(id, document => deleteNode(document, node)));
  mcp.registerTool('set_collapsed', { description: 'Recolhe ou expande um ramo.', inputSchema: { mapId, nodeId, collapsed: z.boolean() } }, ({ mapId: id, nodeId: node, collapsed }) => edit(id, document => setCollapsed(document, node, collapsed)));
  mcp.registerTool('set_color', { description: 'Define a cor de um nó no formato #RRGGBB.', inputSchema: { mapId, nodeId, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) } }, ({ mapId: id, nodeId: node, color }) => edit(id, document => setColor(document, node, color)));
  mcp.registerTool('link_nodes', { description: 'Cria uma conexão livre entre dois nós, independente da hierarquia.', inputSchema: { mapId, sourceId: nodeId, targetId: nodeId } }, ({ mapId: id, sourceId, targetId }) => edit(id, document => linkNodes(document, sourceId, targetId).doc));
  mcp.registerTool('unlink_nodes', { description: 'Remove uma conexão livre pelo ID mostrado em get_outline.', inputSchema: { mapId, linkId: z.string().min(1) } }, ({ mapId: id, linkId }) => edit(id, document => unlinkNodes(document, linkId)));
  mcp.registerTool('rename_map', { description: 'Muda o título do mapa.', inputSchema: { mapId, title: z.string().min(1).max(200) } }, ({ mapId: id, title }) => edit(id, document => renameDocument(document, title)));
  mcp.registerTool('organize_map', { description: 'Recalcula as posições de todos os nós em um layout limpo. Sobrescreve posições manuais.', inputSchema: { mapId } }, ({ mapId: id }) => edit(id, organizeDocument));
  mcp.registerTool('duplicate_map', { description: 'Copia um mapa com novo ID.', inputSchema: { mapId, title: z.string().min(1).max(200).optional() } }, ({ mapId: id, title }) => run(async () => {
    const source = await getMap(db, ownerId, id);
    if (!source) return failure(new Error('Mapa não encontrado.'));
    return saved(await createMap(db, ownerId, duplicateDocument(source, title)), 1, 'Mapa duplicado.');
  }));
  mcp.registerTool('delete_map', { description: 'Apaga o mapa inteiro. Irreversível: confirme com a pessoa antes.', inputSchema: { mapId, confirm: z.literal(true).describe('Deve ser true.') } }, ({ mapId: id }) => run(async () => (await deleteMap(db, ownerId, id)) ? text('Mapa apagado.') : failure(new Error('Mapa não encontrado.'))));
  mcp.registerTool('update_map', { description: 'Substitui o documento completo (avançado; prefira as ferramentas por nó). Exige a versão atual.', inputSchema: { mapId, expectedVersion: z.number().int().positive(), document: z.record(z.string(), z.unknown()) } }, ({ mapId: id, expectedVersion, document }) => run(async () => {
    const valid = await updateMap(db, ownerId, id, validate(document), expectedVersion);
    return saved(valid, expectedVersion + 1);
  }));
  mcp.registerTool('validate_map', { description: 'Valida um documento Mynder sem salvá-lo.', inputSchema: { document: z.record(z.string(), z.unknown()) } }, ({ document }) => run(async () => { validate(document); return text('{"valid":true}'); }));
}
