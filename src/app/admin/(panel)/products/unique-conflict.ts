/**
 * Reading a Prisma P2002 (unique constraint) error well enough to tell the user
 * which field actually clashed.
 *
 * Prisma reports this in more than one shape. The classic query engine sets
 * `meta.target` — either an array of column names or the constraint name as a
 * string. A driver adapter (what this project runs) leaves `meta.target`
 * undefined and nests the real cause under
 * `meta.driverAdapterError.cause.constraint.fields`, with `meta.modelName`
 * alongside it.
 *
 * That difference had a user-visible cost: `createProductAction` checked only
 * `meta.target`, so the check never matched, and every duplicate stock code in a
 * bulk variant submit was reported as "That slug is already in use" — the wrong
 * field, on a value the user had not typed and could not see.
 *
 * Pure and framework-free so each shape can be tested without provoking a real
 * database error, matching `variant-rows.ts` and `quick-add/guided.ts`.
 */

interface UniqueConflictLike {
  meta?: unknown;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * Every hint the error carries about the clashing field, lowercased: column
 * names, constraint names and the message's own "fields: (`sku`)" tail.
 */
export function uniqueConflictHints(error: UniqueConflictLike): string[] {
  const hints: string[] = [];
  const meta = isRecord(error.meta) ? error.meta : null;

  if (meta) {
    hints.push(...stringsIn(meta.target));

    const adapterError = isRecord(meta.driverAdapterError) ? meta.driverAdapterError : null;
    const cause = adapterError && isRecord(adapterError.cause) ? adapterError.cause : null;
    if (cause) {
      const constraint = isRecord(cause.constraint) ? cause.constraint : null;
      if (constraint) {
        hints.push(...stringsIn(constraint.fields));
        hints.push(...stringsIn(constraint.index));
      }
      hints.push(...stringsIn(cause.originalMessage));
    }
  }

  const match = typeof error.message === 'string' ? error.message.match(/fields: \(([^)]*)\)/) : null;
  if (match) hints.push(match[1]);

  return hints.map((hint) => hint.toLowerCase());
}

/** The Prisma model the conflict happened on, when the error names one. */
export function uniqueConflictModel(error: UniqueConflictLike): string {
  const meta = isRecord(error.meta) ? error.meta : null;
  return meta && typeof meta.modelName === 'string' ? meta.modelName : '';
}

/**
 * Whether a P2002 was about a product variant's `sku`.
 *
 * `sku` is the only unique column on `ProductVariant`, so the model name alone
 * settles it when the field hints are missing or in a shape not seen before.
 */
export function isVariantSkuConflict(error: UniqueConflictLike): boolean {
  if (uniqueConflictModel(error) === 'ProductVariant') return true;
  return uniqueConflictHints(error).some((hint) => hint.includes('sku'));
}
