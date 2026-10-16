import { useEffect, useRef } from 'react';
import { Markmap } from 'markmap-view';
import type { Document, Topic } from './document';

const branchColors = ['#bf5538', '#536c58', '#b58236', '#627b9b', '#986b85'];
type MindNode = { content: string; children: MindNode[]; payload?: { color: string } };

function treeFromDocument(doc: Document): MindNode {
  const children = new Map<string | undefined, Topic[]>();
  for (const topic of doc.topics) {
    const siblings = children.get(topic.parentId) ?? [];
    siblings.push(topic);
    children.set(topic.parentId, siblings);
  }
  const build = (topic: Topic, color: string): MindNode => ({
    content: topic.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>'),
    payload: { color },
    children: (children.get(topic.id) ?? []).map((child, index) => build(child, topic.parentId ? color : branchColors[index % branchColors.length])),
  });
  const roots = children.get(undefined) ?? [];
  if (roots.length === 1) return build(roots[0], '#262a26');
  return { content: 'Minhas ideias', children: roots.map((root, index) => build(root, branchColors[index % branchColors.length])) };
}

export function MindMap({ doc, onCreate, maxInitialScale = 2 }: { doc: Document; onCreate: () => void; maxInitialScale?: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const hasNodes = doc.topics.length > 0;

  useEffect(() => {
    if (!svg.current || !hasNodes) return;
    const element = svg.current;
    const sizeSvg = () => {
      element.setAttribute('width', String(element.clientWidth));
      element.setAttribute('height', String(element.clientHeight));
    };
    sizeSvg();
    let lastWidth = element.clientWidth;
    let lastHeight = element.clientHeight;
    const map = Markmap.create(element, {
      autoFit: false,
      maxInitialScale,
      duration: 240,
      initialExpandLevel: 6,
      maxWidth: 250,
      spacingHorizontal: 90,
      spacingVertical: 16,
      color: node => String(node.payload?.color ?? '#536c58'),
      lineWidth: node => Math.max(1.5, 3 - node.state.depth * 0.2),
    });
    let cancelled = false;
    void map.setData(treeFromDocument(doc)).then(() => {
      if (!cancelled && element.clientWidth > 0 && element.clientHeight > 0) void map.fit();
    });
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      sizeSvg();
      const { x1, x2, y1, y2 } = map.state.rect;
      if (width > 0 && height > 0 && x2 > x1 && y2 > y1) void map.fit();
    });
    observer.observe(element.parentElement ?? element);
    return () => {
      cancelled = true;
      observer.disconnect();
      map.destroy();
    };
  }, [doc, hasNodes, maxInitialScale]);

  if (!hasNodes) return <div className="map-empty"><span>✳</span><h2>Seu mapa começa com uma ideia</h2><p>Escreva ou cole uma ideia em Markdown para criar os primeiros ramos.</p><button className="primary" onClick={onCreate}>Escrever uma ideia</button></div>;
  return <div className="mindmap-view"><svg ref={svg} className="markmap" role="img" aria-label={`Mapa mental: ${doc.title}`} />{doc.topics.length === 1 && <div className="map-start"><strong>Uma ideia, muitos caminhos.</strong><p>Adicione ramos para transformar esta ideia em um mapa.</p><button className="primary" onClick={onCreate}>Adicionar ramos</button></div>}</div>;
}
