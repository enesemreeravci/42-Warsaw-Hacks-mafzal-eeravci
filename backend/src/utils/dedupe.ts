/** Deduplicates a list of API records by their stable `id`, keeping the last-seen copy. Used
 * wherever paginated 42 API results might repeat a record across pages (locations, events). */
export function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const byId = new Map<number, T>();
  for (const item of items) {
    if (typeof item?.id === 'number') byId.set(item.id, item);
  }
  return Array.from(byId.values());
}
