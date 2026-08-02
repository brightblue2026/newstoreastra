/** Reverses the `parseTiers` in `actions.ts`, for pre-filling the edit form. */
export function formatTiers(tiers: unknown): string {
  if (!Array.isArray(tiers)) return '';
  return tiers
    .map((tier) => {
      if (tier && typeof tier === 'object' && 'minQty' in tier && 'valueBps' in tier) {
        const { minQty, valueBps } = tier as { minQty: number; valueBps: number };
        return `${minQty}:${valueBps / 100}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
