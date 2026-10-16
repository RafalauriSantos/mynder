import {useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {GripVertical, Trash2} from 'lucide-react';
import type {Document} from './document';

type MapListProps = {
  docs: Document[];
  activeId: string;
  onChoose: (id: string) => void;
  onDelete: (doc: Document) => void;
  onReorder: (id: string, toIndex: number) => void;
};

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Map list with free reordering. Drag the grip (mouse or touch) and the row follows the pointer while the
 * others slide aside; on release it settles into place. Focus the grip and press the arrow keys to move it too.
 */
export function MapList({docs, activeId, onChoose, onDelete, onReorder}: MapListProps) {
  const list = useRef<HTMLElement>(null);
  const reorder = useRef(onReorder);
  reorder.current = onReorder;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const grabOffset = useRef(0);
  const desiredTop = useRef(0);
  const tops = useRef(new Map<string, number>());

  const rowOf = (id: string) => list.current?.querySelector<HTMLElement>(`.map-entry[data-id="${CSS.escape(id)}"]`) ?? null;
  // The dragged row is moved with a transform so it keeps following the pointer while its slot changes.
  const follow = (id: string) => {
    const row = rowOf(id);
    if (row) row.style.transform = `translateY(${desiredTop.current - row.offsetTop}px) scale(1.02)`;
  };

  // FLIP: rows that changed place slide from where they were to where they are now.
  useLayoutEffect(() => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('.map-entry') ?? [])];
    const next = new Map<string, number>();
    for (const row of rows) {
      const id = row.dataset.id ?? '';
      const top = row.offsetTop;
      next.set(id, top);
      const before = tops.current.get(id);
      if (id === draggingId || before === undefined || before === top || reducedMotion()) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${before - top}px)`;
      void row.offsetHeight; // commit the starting position before animating
      row.style.transition = `transform 200ms ${EASE}`;
      row.style.transform = '';
    }
    tops.current = next;
    if (draggingId) follow(draggingId);
  });

  useEffect(() => {
    if (!draggingId) return;
    const id = draggingId;
    const move = (event: PointerEvent) => {
      const nav = list.current;
      const row = rowOf(id);
      if (!nav || !row) return;
      desiredTop.current = event.clientY - nav.getBoundingClientRect().top + nav.scrollTop - grabOffset.current;
      // Where the dragged row's center sits among the other rows decides its slot.
      const rows = [...nav.querySelectorAll<HTMLElement>('.map-entry')];
      const center = desiredTop.current + row.offsetHeight / 2;
      const found = rows.findIndex(item => center < item.offsetTop + item.offsetHeight / 2);
      const target = found === -1 ? rows.length - 1 : found;
      if (rows[target] !== row) reorder.current(id, target);
      follow(id);
    };
    const end = () => {
      const row = rowOf(id);
      if (row) {
        if (reducedMotion()) {
          row.style.transform = '';
          row.style.transition = '';
        } else {
          row.style.zIndex = '3';
          row.style.transition = `transform 220ms ${EASE}`;
          row.style.transform = '';
          const done = () => { row.style.transition = ''; row.style.zIndex = ''; };
          row.addEventListener('transitionend', done, {once: true});
          window.setTimeout(done, 320);
        }
      }
      setDraggingId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [draggingId]);

  const startDrag = (event: React.PointerEvent, doc: Document) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const row = rowOf(doc.id);
    if (!row) return;
    grabOffset.current = event.clientY - row.getBoundingClientRect().top;
    desiredTop.current = row.offsetTop;
    row.style.transition = 'none';
    setDraggingId(doc.id);
  };

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
    {docs.map((doc, index) => <div className={`map-entry${draggingId === doc.id ? ' dragging' : ''}`} data-id={doc.id} key={doc.id}>
      <button type="button" className="map-grip" data-grip={doc.id} aria-label={`Mover o mapa ${doc.title}`} title="Arraste para reordenar, ou use as setas para cima e para baixo"
        onPointerDown={event => startDrag(event, doc)} onKeyDown={event => onGripKey(event, doc, index)}><GripVertical size={14}/></button>
      <button type="button" className={`map-title${activeId === doc.id ? ' active' : ''}`} aria-current={activeId === doc.id ? 'true' : undefined} onClick={() => onChoose(doc.id)}>{doc.title}</button>
      <button type="button" className="delete-map" aria-label={`Apagar mapa ${doc.title}`} title="Apagar mapa" onClick={() => onDelete(doc)}><Trash2 size={15}/></button>
    </div>)}
    <span className="sr-only" role="status">{announcement}</span>
  </nav>;
}
