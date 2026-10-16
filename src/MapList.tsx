import {useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {GripVertical, Trash2} from 'lucide-react';
import type {Document} from './document';

type MapListProps = {
  docs: Document[];
  activeId: string;
  onChoose: (id: string) => void;
  onDelete: (doc: Document) => void;
  onReorder: (id: string, toIndex: number) => void;
};

/** Map list with free reordering: drag the grip (mouse or touch), or focus it and press the arrow keys. */
export function MapList({docs, activeId, onChoose, onDelete, onReorder}: MapListProps) {
  const list = useRef<HTMLElement>(null);
  const reorder = useRef(onReorder);
  reorder.current = onReorder;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!draggingId) return;
    // The row under the pointer's vertical position decides where the dragged map goes.
    const indexAt = (y: number) => {
      const rows = [...(list.current?.querySelectorAll<HTMLElement>('.map-entry') ?? [])];
      const found = rows.findIndex(row => {
        const rect = row.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      return found === -1 ? rows.length - 1 : found;
    };
    const move = (event: PointerEvent) => reorder.current(draggingId, indexAt(event.clientY));
    const end = () => setDraggingId(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [draggingId]);

  const onGripKey = (event: ReactKeyboardEvent, doc: Document, index: number) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const to = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= docs.length) return;
    onReorder(doc.id, to);
    setAnnouncement(`${doc.title} movido para a posição ${to + 1} de ${docs.length}.`);
    // React moves the row in the DOM, which can drop focus; put it back on the same grip.
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(doc.id)}"]`)?.focus());
  };

  return <nav ref={list} className={draggingId ? 'is-reordering' : undefined} aria-label="Seus mapas">
    {docs.map((doc, index) => <div className={`map-entry${draggingId === doc.id ? ' dragging' : ''}`} key={doc.id}>
      <button type="button" className="map-grip" data-grip={doc.id} aria-label={`Mover o mapa ${doc.title}`} title="Arraste para reordenar, ou use as setas para cima e para baixo"
        onPointerDown={event => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); setDraggingId(doc.id); }}
        onKeyDown={event => onGripKey(event, doc, index)}><GripVertical size={14}/></button>
      <button type="button" className={`map-title${activeId === doc.id ? ' active' : ''}`} aria-current={activeId === doc.id ? 'true' : undefined} onClick={() => onChoose(doc.id)}>{doc.title}</button>
      <button type="button" className="delete-map" aria-label={`Apagar mapa ${doc.title}`} title="Apagar mapa" onClick={() => onDelete(doc)}><Trash2 size={15}/></button>
    </div>)}
    <span className="sr-only" role="status">{announcement}</span>
  </nav>;
}
