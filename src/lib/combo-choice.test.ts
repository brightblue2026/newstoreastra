import { describe, expect, it } from 'vitest';
import {
  resolveComboUnits,
  type ChoiceComboItem,
  type ChoiceVariant,
} from './combo-choice';

/*
  The combo choice slot, from the server's side.

  These are the tests that make "a tampered cart cannot change what is sold"
  true rather than merely intended. The price of a combo is its package price
  either way, so a forged choice buys nothing cheaper — but it could put a
  fragrance BBTC never offered for that slot onto a picking list, which is the
  same class of problem.
*/

function variant(overrides: Partial<ChoiceVariant> & { id: string }): ChoiceVariant {
  return {
    productId: 'product-mx3',
    variantName: 'Lemon',
    isActive: true,
    pricePaise: 14_900,
    ...overrides,
    product: {
      name: 'MX-3 Dishwash Liquid',
      slug: 'mx-3-dishwash-liquid',
      isActive: true,
      brandId: 'brand-mx3',
      categoryId: 'category-dish',
      hsnCode: '3402',
      gstRate: 1800,
      ...overrides.product,
    },
  };
}

const lemon = variant({ id: 'v-lemon', variantName: 'Lemon' });
const rose = variant({ id: 'v-rose', variantName: 'Rose' });
const jasmin = variant({ id: 'v-jasmin', variantName: 'Jasmin' });
const ghee = variant({
  id: 'v-ghee',
  variantName: null,
  productId: 'product-ghee',
  pricePaise: 62_000,
  product: {
    name: 'Kenzaniya Ghee',
    slug: 'kenzaniya-ghee',
    isActive: true,
    brandId: 'brand-kenzaniya',
    categoryId: 'category-food',
    hsnCode: '0405',
    gstRate: 1200,
  },
});

const variants = new Map<string, ChoiceVariant>(
  [lemon, rose, jasmin, ghee].map((v) => [v.id, v]),
);

function slot(overrides: Partial<ChoiceComboItem> = {}): ChoiceComboItem {
  return {
    id: 'item-1',
    quantity: 1,
    isChoice: true,
    choiceOf: [],
    variant: lemon,
    ...overrides,
  };
}

describe('resolveComboUnits', () => {
  it('falls back to the slot variant when no choice was made', () => {
    // A combo without choice slots, or a cart saved before pickers existed.
    const resolved = resolveComboUnits([slot({ isChoice: false, quantity: 2 })], {}, variants);

    expect(resolved).not.toBeNull();
    expect(resolved!.units).toEqual([{ variant: lemon, units: 2 }]);
    expect(resolved!.chosenLabels).toEqual([]);
  });

  it('rejects a fixed slot whose own variant was deactivated since the combo was built', () => {
    const deactivated = variant({ id: 'v-lemon-off', isActive: false });
    const map = new Map([[deactivated.id, deactivated]]);
    const resolved = resolveComboUnits(
      [slot({ isChoice: false, variant: deactivated })],
      {},
      map,
    );

    expect(resolved).toBeNull();
  });

  it('rejects a fixed slot whose own product was deactivated since the combo was built', () => {
    const deactivated = variant({
      id: 'v-lemon-off-product',
      product: { ...lemon.product, isActive: false },
    });
    const map = new Map([[deactivated.id, deactivated]]);
    const resolved = resolveComboUnits(
      [slot({ isChoice: false, variant: deactivated })],
      {},
      map,
    );

    expect(resolved).toBeNull();
  });

  it('honours a valid choice and ships that variant instead of the slot default', () => {
    const resolved = resolveComboUnits(
      [slot({ choiceOf: [lemon.id, rose.id, jasmin.id] })],
      { choices: [{ itemId: 'item-1', variantIds: [rose.id] }] },
      variants,
    );

    expect(resolved!.units).toEqual([{ variant: rose, units: 1 }]);
    expect(resolved!.chosenLabels).toEqual([
      { slotLabel: 'MX-3 Dishwash Liquid', picks: ['Rose'] },
    ]);
  });

  it('groups repeated picks — "any 3", all Lemon', () => {
    const resolved = resolveComboUnits(
      [slot({ quantity: 3 })],
      { choices: [{ itemId: 'item-1', variantIds: [lemon.id, lemon.id, lemon.id] }] },
      variants,
    );

    expect(resolved!.units).toEqual([{ variant: lemon, units: 3 }]);
    expect(resolved!.chosenLabels[0].picks).toEqual(['Lemon', 'Lemon', 'Lemon']);
  });

  it('keeps mixed picks apart so each carries its own HSN and rate', () => {
    const resolved = resolveComboUnits(
      [slot({ quantity: 3 })],
      { choices: [{ itemId: 'item-1', variantIds: [lemon.id, rose.id, lemon.id] }] },
      variants,
    );

    expect(resolved!.units).toEqual([
      { variant: lemon, units: 2 },
      { variant: rose, units: 1 },
    ]);
  });

  it('resolves a fixed slot and a choice slot side by side', () => {
    const resolved = resolveComboUnits(
      [
        slot({ id: 'item-fixed', isChoice: false, variant: ghee, quantity: 1 }),
        slot({ id: 'item-choice', quantity: 2 }),
      ],
      { choices: [{ itemId: 'item-choice', variantIds: [rose.id, jasmin.id] }] },
      variants,
    );

    expect(resolved!.units).toEqual([
      { variant: ghee, units: 1 },
      { variant: rose, units: 1 },
      { variant: jasmin, units: 1 },
    ]);
    expect(resolved!.chosenLabels).toEqual([
      { slotLabel: 'MX-3 Dishwash Liquid', picks: ['Rose', 'Jasmin'] },
    ]);
  });

  it('labels a nameless variant rather than printing "null"', () => {
    const resolved = resolveComboUnits(
      [slot({ variant: ghee })],
      { choices: [{ itemId: 'item-1', variantIds: [ghee.id] }] },
      variants,
    );

    expect(resolved!.chosenLabels).toEqual([{ slotLabel: 'Kenzaniya Ghee', picks: ['Variant'] }]);
  });

  // ------------------------------------------------------------- rejections

  it('rejects a pick outside an explicit choiceOf restriction', () => {
    expect(
      resolveComboUnits(
        [slot({ choiceOf: [lemon.id, rose.id] })],
        { choices: [{ itemId: 'item-1', variantIds: [jasmin.id] }] },
        variants,
      ),
    ).toBeNull();
  });

  it('rejects a pick from another product when choiceOf is empty', () => {
    // "Empty = any in product" is a restriction, not an open door.
    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: [ghee.id] }] },
        variants,
      ),
    ).toBeNull();
  });

  it('accepts any same-priced variant of the slot product when choiceOf is empty', () => {
    const resolved = resolveComboUnits(
      [slot()],
      { choices: [{ itemId: 'item-1', variantIds: [jasmin.id] }] },
      variants,
    );

    expect(resolved!.units).toEqual([{ variant: jasmin, units: 1 }]);
  });

  it('rejects a pricier variant of the same product when choiceOf is empty', () => {
    // Same product, different size — MX-3's real catalogue has exactly this
    // shape (24 fragrances x 3 sizes, one product id). Picking the 900ml for
    // the 225ml slot's package price must not be possible.
    const large = variant({ id: 'v-lemon-900', variantName: 'Lemon', pricePaise: 62_000 });
    const withLarge = new Map(variants).set(large.id, large);

    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: [large.id] }] },
        withLarge,
      ),
    ).toBeNull();
  });

  it('rejects a pricier variant even when the admin explicitly listed it in choiceOf', () => {
    // Defense in depth: an admin restriction list naming the wrong size's id
    // by mistake must not reopen the same hole.
    const large = variant({ id: 'v-lemon-900', variantName: 'Lemon', pricePaise: 62_000 });
    const withLarge = new Map(variants).set(large.id, large);

    expect(
      resolveComboUnits(
        [slot({ choiceOf: [large.id] })],
        { choices: [{ itemId: 'item-1', variantIds: [large.id] }] },
        withLarge,
      ),
    ).toBeNull();
  });

  it('rejects a pick when either side has no price to compare', () => {
    const priceless = variant({ id: 'v-lemon-poa', variantName: 'Lemon', pricePaise: null });
    const withPriceless = new Map(variants).set(priceless.id, priceless);

    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: [priceless.id] }] },
        withPriceless,
      ),
    ).toBeNull();
  });

  it('rejects a pick that does not exist', () => {
    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: ['v-nonexistent'] }] },
        variants,
      ),
    ).toBeNull();
  });

  it('rejects a deactivated variant, and a variant of a deactivated product', () => {
    const retired = variant({ id: 'v-retired', isActive: false });
    const unpublished = variant({
      id: 'v-unpublished',
      product: {
        name: 'MX-3 Dishwash Liquid',
        slug: 'mx-3-dishwash-liquid',
        isActive: false,
        brandId: 'brand-mx3',
        categoryId: 'category-dish',
        hsnCode: '3402',
        gstRate: 1800,
      },
    });
    const withRetired = new Map(variants).set(retired.id, retired).set(unpublished.id, unpublished);

    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: [retired.id] }] },
        withRetired,
      ),
    ).toBeNull();

    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-1', variantIds: [unpublished.id] }] },
        withRetired,
      ),
    ).toBeNull();
  });

  it('rejects too many picks — "any 3" cannot be redeemed for four', () => {
    expect(
      resolveComboUnits(
        [slot({ quantity: 3 })],
        {
          choices: [
            { itemId: 'item-1', variantIds: [lemon.id, rose.id, jasmin.id, lemon.id] },
          ],
        },
        variants,
      ),
    ).toBeNull();
  });

  it('rejects too few picks', () => {
    expect(
      resolveComboUnits(
        [slot({ quantity: 3 })],
        { choices: [{ itemId: 'item-1', variantIds: [lemon.id] }] },
        variants,
      ),
    ).toBeNull();
  });

  it('rejects a choice sent for a fixed slot', () => {
    expect(
      resolveComboUnits(
        [slot({ isChoice: false })],
        { choices: [{ itemId: 'item-1', variantIds: [rose.id] }] },
        variants,
      ),
    ).toBeNull();
  });

  it('rejects a choice naming a slot this combo does not have', () => {
    expect(
      resolveComboUnits(
        [slot()],
        { choices: [{ itemId: 'item-from-another-combo', variantIds: [lemon.id] }] },
        variants,
      ),
    ).toBeNull();
  });
});
