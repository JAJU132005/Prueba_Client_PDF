/** Devuelve una nueva lista con el elemento movido. No muta. (R8) */
export function moveItem<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const next = [...items];
  if (
    fromIndex < 0 ||
    fromIndex >= next.length ||
    toIndex < 0 ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Devuelve una nueva lista sin el elemento en index. No muta. (R9) */
export function removeItem<T>(items: readonly T[], index: number): T[] {
  const next = [...items];
  if (index < 0 || index >= next.length) {
    return next;
  }
  next.splice(index, 1);
  return next;
}
