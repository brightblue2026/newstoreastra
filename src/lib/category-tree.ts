interface CategoryLike {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/**
 * Flattens the parent/child tree into depth-first order with a `depth` for
 * indentation. Pure data transform — safe to import from server or client
 * components.
 */
export function flattenTree<T extends CategoryLike>(
  categories: T[],
): Array<{ category: T; depth: number }> {
  const byParent = new Map<string | null, T[]>();
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const out: Array<{ category: T; depth: number }> = [];

  function walk(parentId: string | null, depth: number) {
    for (const category of byParent.get(parentId) ?? []) {
      out.push({ category, depth });
      walk(category.id, depth + 1);
    }
  }

  walk(null, 0);
  return out;
}

/** `categoryId` and every id beneath it in the tree. */
export function descendantIds<T extends CategoryLike>(
  categories: T[],
  categoryId: string,
): Set<string> {
  const byParent = new Map<string | null, T[]>();
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }

  const ids = new Set<string>([categoryId]);
  let frontier = [categoryId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of byParent.get(id) ?? []) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          next.push(child.id);
        }
      }
    }
    frontier = next;
  }
  return ids;
}
