/** Moves the item with this id to a new index, clamped to the list. Returns the same array when nothing changes. */
export function moveById<T extends {id: string}>(items: T[], id: string, toIndex: number): T[] {
  const from = items.findIndex(item => item.id === id);
  if (from < 0) return items;
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
