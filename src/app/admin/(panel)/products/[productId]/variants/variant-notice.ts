/**
 * What the last publish action on a variant did, said back in words.
 *
 * The address carries only a kind and a variant id. The wording and the
 * variant's name come from here and from the database, so a crafted link
 * cannot put text on an admin page — the same rule `noticeFor` follows for
 * products.
 */
export const VARIANT_NOTICE_KINDS = [
  'published',
  'unpublished',
  'last',
  'all-published',
  'all-unpublished',
  'all-last',
] as const;

export type VariantNoticeKind = (typeof VARIANT_NOTICE_KINDS)[number];

export interface VariantNotice {
  tone: 'success' | 'warning';
  text: string;
}

export function variantLabel(variant: {
  variantName: string | null;
  format: string | null;
  size: string;
}): string {
  return [variant.variantName, variant.format, variant.size].filter(Boolean).join(' · ');
}

export function variantNotice(
  kind: string | undefined,
  context: { label?: string; productName: string; productIsActive: boolean },
): VariantNotice | null {
  const { label, productName, productIsActive } = context;
  // A draft product keeps everything off the store, whatever its variants say.
  const whenVisible = productIsActive
    ? 'on the store now'
    : `ready, and will be on the store once "${productName}" itself is published`;

  switch (kind) {
    case 'published':
      return label ? { tone: 'success', text: `Published. ${label} is ${whenVisible}.` } : null;
    case 'unpublished':
      return label
        ? {
            tone: 'success',
            text: `Unpublished. Customers can no longer choose ${label}. Nothing was deleted.`,
          }
        : null;
    case 'last':
      return label
        ? {
            tone: 'warning',
            text: `Cannot unpublish ${label}. It is the only published variant of "${productName}", which is on the store. Unpublish the product instead, or publish another variant first.`,
          }
        : null;
    case 'all-published':
      return { tone: 'success', text: `Published. Every variant of "${productName}" is ${whenVisible}.` };
    case 'all-unpublished':
      return {
        tone: 'success',
        text: `Unpublished. No variant of "${productName}" can be chosen now. Nothing was deleted.`,
      };
    case 'all-last':
      return {
        tone: 'warning',
        text: `Cannot unpublish every variant while "${productName}" is on the store. Unpublish the product first.`,
      };
    default:
      return null;
  }
}
