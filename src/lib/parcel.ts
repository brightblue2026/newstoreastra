/**
 * The box an order ships in — pure, so it can be tested directly.
 *
 * Shiprocket requires a length, breadth and height on every order and charges
 * on the larger of the real weight and the volumetric weight
 * (L × B × H ÷ 5000, in kg). A made-up box therefore costs real money in one
 * direction or the other, so the box is built from what the admin has
 * measured, and only falls back to the default carton for what they have not.
 *
 * The estimate stacks: the longest length and widest breadth across the lines
 * form the footprint, and the height is whatever it takes to hold the total
 * volume on that footprint. It over-estimates slightly for odd mixes, which is
 * the safe side — a courier re-weighing a parcel that was declared too small
 * bills the difference back to the wallet.
 */

export interface BoxCm {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

/** The carton declared for anything with no measured box. */
export const DEFAULT_BOX: BoxCm = Object.freeze({ lengthCm: 20, breadthCm: 15, heightCm: 15 });

/** Shiprocket rejects a dimension under half a centimetre; a whole one is the floor. */
const MIN_CM = 1;

/** A box as the database holds it: any side may be missing. */
export type MaybeBox = { [Side in keyof BoxCm]?: number | null };

export interface ParcelLine {
  quantity: number;
  box: MaybeBox | null;
}

/** A box only counts when all three sides are known and positive. */
export function completeBox(box: MaybeBox | null | undefined): BoxCm | null {
  if (!box) return null;
  const { lengthCm, breadthCm, heightCm } = box;
  if (
    typeof lengthCm !== 'number' ||
    typeof breadthCm !== 'number' ||
    typeof heightCm !== 'number' ||
    lengthCm <= 0 ||
    breadthCm <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }
  return { lengthCm, breadthCm, heightCm };
}

/**
 * One box for a whole order. Lines with no complete box count as the default
 * carton each, so an unmeasured catalogue behaves exactly as before.
 */
export function parcelDimensions(lines: ParcelLine[]): BoxCm {
  const units = lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({ quantity: line.quantity, box: completeBox(line.box) ?? DEFAULT_BOX }));

  if (units.length === 0) return { ...DEFAULT_BOX };

  const lengthCm = Math.max(...units.map((u) => u.box.lengthCm));
  const breadthCm = Math.max(...units.map((u) => u.box.breadthCm));
  const tallest = Math.max(...units.map((u) => u.box.heightCm));

  const volume = units.reduce(
    (sum, u) => sum + u.box.lengthCm * u.box.breadthCm * u.box.heightCm * u.quantity,
    0,
  );

  const heightCm = Math.max(tallest, Math.ceil(volume / (lengthCm * breadthCm)));

  return {
    lengthCm: Math.max(MIN_CM, Math.ceil(lengthCm)),
    breadthCm: Math.max(MIN_CM, Math.ceil(breadthCm)),
    heightCm: Math.max(MIN_CM, heightCm),
  };
}

/** Volumetric weight in grams, the way couriers compute it (divisor 5000). */
export function volumetricGrams(box: BoxCm): number {
  return Math.ceil((box.lengthCm * box.breadthCm * box.heightCm) / 5);
}
