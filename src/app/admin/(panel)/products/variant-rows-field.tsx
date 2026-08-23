'use client';

import { useState } from 'react';
import { EMPTY_VARIANT_ROW, type VariantRowValue } from './variant-rows';

/**
 * Repeatable variant entry for the product **create** screen — see `variant-rows.ts` for
 * why this exists alongside the single-variant form. Every field mirrors
 * `[productId]/variants/variant-form.tsx`; the difference is there can be many of them,
 * and they ride along in the product form's own submit as one hidden JSON field rather
 * than a separate page per variant.
 */

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';

function isBlankRow(row: VariantRowValue): boolean {
  return Object.values(row).every((value) => value === '');
}

export function VariantRowsField() {
  const [rows, setRows] = useState<VariantRowValue[]>([{ ...EMPTY_VARIANT_ROW }]);

  function updateRow(index: number, patch: Partial<VariantRowValue>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { ...EMPTY_VARIANT_ROW }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  const payload = JSON.stringify(rows.filter((row) => !isBlankRow(row)));

  return (
    <div className={'mt-10 border-t border-line pt-8'}>
      <p className="type-caption text-ink-soft">
        Variants — every size, format or fragrance this product ships with. Add as many rows as
        you need; a blank price is fine and shows as &quot;Price on request&quot;.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        {rows.map((row, index) => (
          <fieldset key={index} className="rounded-card border border-line p-6">
            <div className="flex items-center justify-between">
              <legend className="type-caption text-ink-soft">Variant {index + 1}</legend>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="type-caption text-warning underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor={`sku-${index}`} className={labelClass}>
                  SKU
                </label>
                <input
                  id={`sku-${index}`}
                  value={row.sku}
                  onChange={(event) => updateRow(index, { sku: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`barcode-${index}`} className={labelClass}>
                  Barcode
                </label>
                <input
                  id={`barcode-${index}`}
                  value={row.barcode}
                  onChange={(event) => updateRow(index, { barcode: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor={`variantName-${index}`} className={labelClass}>
                  Variant name
                </label>
                <input
                  id={`variantName-${index}`}
                  placeholder="Lemon, Jasmin, Cardamom…"
                  value={row.variantName}
                  onChange={(event) => updateRow(index, { variantName: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`variantHex-${index}`} className={labelClass}>
                  Variant accent colour
                </label>
                <input
                  id={`variantHex-${index}`}
                  placeholder="#0F9CD6"
                  value={row.variantHex}
                  onChange={(event) => updateRow(index, { variantHex: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor={`size-${index}`} className={labelClass}>
                  Size
                </label>
                <input
                  id={`size-${index}`}
                  placeholder="900 ml, 250 g, 5 L…"
                  value={row.size}
                  onChange={(event) => updateRow(index, { size: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`format-${index}`} className={labelClass}>
                  Format
                </label>
                <input
                  id={`format-${index}`}
                  placeholder="Liquid, Semi-Gel…"
                  value={row.format}
                  onChange={(event) => updateRow(index, { format: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <div>
                <label htmlFor={`mrpRupees-${index}`} className={labelClass}>
                  MRP (₹)
                </label>
                <input
                  id={`mrpRupees-${index}`}
                  inputMode="decimal"
                  placeholder="199.00"
                  value={row.mrpRupees}
                  onChange={(event) => updateRow(index, { mrpRupees: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`priceRupees-${index}`} className={labelClass}>
                  Price (₹) — blank = &quot;Price on request&quot;
                </label>
                <input
                  id={`priceRupees-${index}`}
                  inputMode="decimal"
                  placeholder="149.00"
                  value={row.priceRupees}
                  onChange={(event) => updateRow(index, { priceRupees: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`wholesaleRupees-${index}`} className={labelClass}>
                  Wholesale (₹)
                </label>
                <input
                  id={`wholesaleRupees-${index}`}
                  inputMode="decimal"
                  value={row.wholesaleRupees}
                  onChange={(event) => updateRow(index, { wholesaleRupees: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <label htmlFor={`weightGrams-${index}`} className={`mt-4 ${labelClass}`}>
              Weight (grams)
            </label>
            <input
              id={`weightGrams-${index}`}
              inputMode="numeric"
              value={row.weightGrams}
              onChange={(event) => updateRow(index, { weightGrams: event.target.value })}
              className={inputClass}
            />
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-6 rounded-control border border-line px-6 py-3 type-body font-medium"
      >
        + Add variant row
      </button>

      <input type="hidden" name="variantsJson" value={payload} />
    </div>
  );
}
