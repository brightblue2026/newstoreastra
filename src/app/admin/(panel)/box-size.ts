import { z } from 'zod';

/*
  Packed box size — shared by the variant and combo forms. Shiprocket needs a
  box on every shipment and charges on volumetric weight when it is larger
  than the real weight, so these three numbers change what BBTC pays.

  All three or none: a box with one side missing cannot be used, and saving it
  would look filled-in while the default carton was declared instead.
*/

export interface BoxSize {
  lengthCm: number | null;
  breadthCm: number | null;
  heightCm: number | null;
}

const side = z
  .string()
  .trim()
  .regex(/^\d{1,3}$/, 'Whole centimetres, like 12.')
  .transform(Number)
  .refine((value) => value >= 1 && value <= 300, 'Between 1 and 300 cm.');

export function parseBoxSize(
  formData: FormData,
): { ok: true; box: BoxSize } | { ok: false; error: string } {
  const raw = (['lengthCm', 'breadthCm', 'heightCm'] as const).map((name) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  });

  if (raw.every((value) => value === '')) {
    return { ok: true, box: { lengthCm: null, breadthCm: null, heightCm: null } };
  }
  if (raw.some((value) => value === '')) {
    return { ok: false, error: 'Enter all three box sides, or leave all three empty.' };
  }

  const parsed = raw.map((value) => side.safeParse(value));
  const failed = parsed.find((result) => !result.success);
  if (failed && !failed.success) {
    return { ok: false, error: failed.error.issues[0]?.message ?? 'Check the box size.' };
  }

  const [lengthCm, breadthCm, heightCm] = parsed.map((result) =>
    result.success ? result.data : null,
  );
  return { ok: true, box: { lengthCm, breadthCm, heightCm } };
}

export function boxSizeInput(box: BoxSize): { lengthCm: string; breadthCm: string; heightCm: string } {
  const text = (value: number | null) => (value === null ? '' : String(value));
  return {
    lengthCm: text(box.lengthCm),
    breadthCm: text(box.breadthCm),
    heightCm: text(box.heightCm),
  };
}
