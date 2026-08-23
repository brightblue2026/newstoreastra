import { z } from 'zod';

/**
 * The field-level rules for one product variant — shared between the
 * single-variant form (`[productId]/variants/actions.ts`) and the bulk
 * variant-row batch (`variant-rows.ts`), so the two entry paths cannot
 * silently diverge on what counts as a valid variant.
 */

export const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const variantFieldsSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required.').max(60),
  variantName: z.string().trim().max(120).optional().or(z.literal('')),
  variantHex: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || HEX_COLOUR_PATTERN.test(value), {
      message: 'Enter a 6-digit hex colour, e.g. #0F9CD6.',
    }),
  size: z.string().trim().min(1, 'Size is required.').max(60),
  format: z.string().trim().max(60).optional().or(z.literal('')),
  mrpRupees: z.string().trim().max(20).optional().or(z.literal('')),
  priceRupees: z.string().trim().max(20).optional().or(z.literal('')),
  wholesaleRupees: z.string().trim().max(20).optional().or(z.literal('')),
  weightGrams: z.string().trim().max(10).optional().or(z.literal('')),
  barcode: z.string().trim().max(60).optional().or(z.literal('')),
});
