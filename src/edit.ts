import { colors, descendants, id, importMarkdown, organize, removeBranch, reparent, toMarkdown, type Document, type Topic } from './document.ts';

/**
 * Edições de mapa por nó. Todas as funções são puras: recebem um Document e devolvem outro,
 * lançando Error com mensagem em português quando a operação é inválida.
 */

const sync = (doc: Document): Document => ({ ...doc, markdown: toMarkdown(doc), updatedAt: Date.now() });

export function findTopic(doc: Document, topicId: string): Topic {
  const topic = doc.topics.find(item => item.id === topicId);
  if (!topic) throw new Error(`Nó não encontrado: ${topicId}`);
  return topic;
}

function cleanText(text: string): string {
  const value = text.trim();
  if (!value) throw new Error('O texto do nó não pode ficar vazio.');
  if (value.length > 2000) throw new Error('O texto do nó excede 2000 caracteres.');
  return value;
}

function slotFor(doc: Document, parent?: Topic): { x: number; y: number } {
  if (!parent) {
    const roots = doc.topics.filter(item => !item.parentId);
    return { x: 0, y: roots.length ? Math.max(...roots.map(item => item.position.y)) + 140 : 0 };
  }
  const siblings = doc.topics.filter(item => item.parentId === parent.id);
  return { x: parent.position.x + 310, y: siblings.length ? Math.max(...siblings.map(item => item.position.y)) + 140 : parent.position.y };
}

export function addNode(doc: Document, text: string, parentId?: string, color?: string): { doc: Document; nodeId: string } {
  const parent = parentId ? findTopic(doc, parentId) : undefined;
  const siblings = doc.topics.filter(item => item.parentId === parent?.id).length;
  const inherited = parent ? (parent.parentId ? parent.color : colors[siblings % colors.length]) : colors[siblings % colors.length];
  const node: Topic = { id: id(), text: cleanText(text), parentId: parent?.id, position: slotFor(doc, parent), collapsed: false, color: color ?? inherited };
  return { doc: sync({ ...doc, topics: [...doc.topics, node] }), nodeId: node.id };
}

export function renameNode(doc: Document, topicId: string, text: string): Document {
  findTopic(doc, topicId);
  const value = cleanText(text);
  const topics = doc.topics.map(item => (item.id === topicId ? { ...item, text: value } : item));
  const renamed = { ...doc, topics };
  const isFirstRoot = topics.find(item => !item.parentId)?.id === topicId;
  return sync(isFirstRoot ? { ...renamed, title: value } : renamed);
}

export function moveNode(doc: Document, topicId: string, newParentId?: string): Document {
  return sync(reparent(doc, topicId, newParentId));
}

export function deleteNode(doc: Document, topicId: string): Document {
  findTopic(doc, topicId);
  if (doc.topics.length === descendants(doc, topicId).size) throw new Error('Não é possível apagar todos os nós do mapa.');
  return sync(removeBranch(doc, topicId));
}

export function setCollapsed(doc: Document, topicId: string, collapsed: boolean): Document {
  findTopic(doc, topicId);
  return sync({ ...doc, topics: doc.topics.map(item => (item.id === topicId ? { ...item, collapsed } : item)) });
}

export function setColor(doc: Document, topicId: string, color: string): Document {
  findTopic(doc, topicId);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('A cor deve estar no formato #RRGGBB.');
  return sync({ ...doc, topics: doc.topics.map(item => (item.id === topicId ? { ...item, color } : item)) });
}

export function linkNodes(doc: Document, source: string, target: string): { doc: Document; linkId: string } {
  findTopic(doc, source);
  findTopic(doc, target);
  if (source === target) throw new Error('Um nó não pode se conectar a ele mesmo.');
  if (doc.links.some(link => (link.source === source && link.target === target) || (link.source === target && link.target === source))) throw new Error('Esses nós já estão conectados.');
  const linkId = id();
  return { doc: sync({ ...doc, links: [...doc.links, { id: linkId, source, target }] }), linkId };
}

export function unlinkNodes(doc: Document, linkId: string): Document {
  if (!doc.links.some(link => link.id === linkId)) throw new Error(`Conexão não encontrada: ${linkId}`);
  return sync({ ...doc, links: doc.links.filter(link => link.id !== linkId) });
}

export function renameDocument(doc: Document, title: string): Document {
  const value = title.trim();
  if (!value || value.length > 200) throw new Error('O título deve ter de 1 a 200 caracteres.');
  return sync({ ...doc, title: value });
}

export function organizeDocument(doc: Document): Document {
  return sync(organize(doc));
}

export function duplicateDocument(doc: Document, title?: string): Document {
  return { ...doc, id: id(), title: title?.trim() || `${doc.title} (cópia)`, updatedAt: Date.now() };
}

/** Texto compacto com ids, para o Claude enxergar a árvore sem receber o JSON inteiro. */
export function outline(doc: Document): string {
  const children = new Map<string | undefined, Topic[]>();
  for (const topic of doc.topics) {
    const siblings = children.get(topic.parentId) ?? [];
    siblings.push(topic);
    children.set(topic.parentId, siblings);
  }
  const lines: string[] = [`# ${doc.title}  (id: ${doc.id})`];
  const write = (topic: Topic, depth: number) => {
    lines.push(`${'  '.repeat(depth)}- [${topic.id}] ${topic.text.replace(/\s*\n\s*/g, ' ')}${topic.collapsed ? ' (recolhido)' : ''}`);
    for (const child of children.get(topic.id) ?? []) write(child, depth + 1);
  };
  for (const root of children.get(undefined) ?? []) write(root, 0);
  if (doc.links.length) {
    lines.push('', 'Conexões livres:');
    for (const link of doc.links) lines.push(`- [${link.id}] ${link.source} -> ${link.target}`);
  }
  return lines.join('\n');
}

/** Enxerta uma sub-árvore escrita em Markdown sob um nó (ou como novas raízes) e reorganiza o layout. */
export function addBranch(doc: Document, markdown: string, parentId?: string): { doc: Document; added: number } {
  const parent = parentId ? findTopic(doc, parentId) : undefined;
  const fragment = importMarkdown(markdown);
  const ids = new Map(fragment.topics.map(item => [item.id, id()]));
  const siblings = doc.topics.filter(item => item.parentId === parent?.id).length;
  const grafted = fragment.topics.map((item, index) => {
    const root = !item.parentId;
    const rootIndex = fragment.topics.filter((other, otherIndex) => !other.parentId && otherIndex < index).length;
    return { ...item, id: ids.get(item.id)!, parentId: root ? parent?.id : ids.get(item.parentId!), color: root && parent?.parentId ? parent.color : root ? colors[(siblings + rootIndex) % colors.length] : item.color };
  });
  const recolored = grafted.map(item => {
    if (item.parentId && item.parentId !== parent?.id) {
      const top = (function climb(topicId: string): typeof grafted[number] { const node = grafted.find(entry => entry.id === topicId)!; return node.parentId && node.parentId !== parent?.id ? climb(node.parentId) : node; })(item.id);
      return { ...item, color: top.color };
    }
    return item;
  });
  return { doc: sync(organize({ ...doc, topics: [...doc.topics, ...recolored] })), added: recolored.length };
}
