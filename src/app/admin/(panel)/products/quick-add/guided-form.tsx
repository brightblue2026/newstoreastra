'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProductFormState } from '../actions';
import { foodLabelIncomplete } from '../format';
import type { VariantRowValue } from '../variant-rows';
import {
  EMPTY_GUIDED_ROW,
  GST_CHOICES,
  type GuidedVariantRow,
  claimsToFieldValue,
  publishChecklist,
  resolveRowSkus,
  segmentDefaults,
  segmentNote,
  slugify,
  stepsToFieldValue,
} from './guided';

/**
 * The guided "Add a product" screen.
 *
 * It writes through the *same* `createProductAction` as `../product-form.tsx`,
 * with the same field names — so there is one validation path, one audit path
 * and one publish guard. What changes is the questions: a shop owner is asked
 * for a product name, not a URL slug; for "12% — ghee, processed food", not a
 * basis-point rate; for a size, not a globally-unique stock code.
 *
 * Nothing here is authoritative. Every rule it enforces is enforced again on
 * the server, and the server wins.
 */

export interface GuidedBrandOption {
  id: string;
  label: string;
  segment: string;
  /** Whether the brand record already carries the licence its segment needs. */
  hasLicence: boolean;
}

export interface GuidedCategoryOption {
  id: string;
  label: string;
}

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const hintClass = 'mt-2 type-caption normal-case text-ink-soft';
const fieldErrorClass = 'mt-2 type-caption normal-case text-warning';

const STEP_TITLES = [
  'What is it?',
  'How would you describe it?',
  'Tax details',
  'Sizes and prices',
  'Food label',
] as const;

/** Which step a server-side field error belongs to, so we can jump back to it. */
const STEP_OF_FIELD: Record<string, number> = {
  name: 1,
  slug: 1,
  brandId: 1,
  categoryId: 1,
  shortDesc: 2,
  description: 2,
  gstRatePercent: 3,
  foodLabel: 5,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Saving' : 'Save and add photos'}
    </button>
  );
}

/** A list where each entry is one line of text — used for claims and usage steps. */
function LineListField({
  legend,
  hint,
  placeholder,
  addLabel,
  values,
  onChange,
}: {
  legend: string;
  hint: string;
  placeholder: string;
  addLabel: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="mt-8">
      <legend className={labelClass}>{legend}</legend>
      <p className={hintClass}>{hint}</p>
      <div className="mt-3 flex flex-col gap-3">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-3">
            <input
              value={value}
              placeholder={placeholder}
              aria-label={`${legend} ${index + 1}`}
              onChange={(event) =>
                onChange(values.map((item, i) => (i === index ? event.target.value : item)))
              }
              className="w-full rounded-control border border-line bg-white px-4 py-3 type-body"
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className="type-caption text-warning underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="mt-3 type-caption text-signal underline"
      >
        {addLabel}
      </button>
    </fieldset>
  );
}

export function GuidedProductForm({
  action,
  brandOptions,
  categoryOptions,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  brandOptions: GuidedBrandOption[];
  categoryOptions: GuidedCategoryOption[];
}) {
  const [state, formAction] = useActionState(action, {} as ProductFormState);

  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState('');

  const [name, setName] = useState('');
  const [slugOverride, setSlugOverride] = useState('');
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [shortDesc, setShortDesc] = useState('');
  const [description, setDescription] = useState('');
  const [claims, setClaims] = useState<string[]>(['']);
  const [ingredients, setIngredients] = useState('');
  const [usageSteps, setUsageSteps] = useState<string[]>(['']);

  const [hsnCode, setHsnCode] = useState('');
  const [gstRatePercent, setGstRatePercent] = useState('');

  const [rows, setRows] = useState<GuidedVariantRow[]>([{ ...EMPTY_GUIDED_ROW }]);

  const [isFoodProduct, setIsFoodProduct] = useState(false);
  const [isCosmetic, setIsCosmetic] = useState(false);
  // Once the user answers either box themselves, changing brand stops overriding them.
  const regulatoryTouched = useRef(false);

  const [netQty, setNetQty] = useState('');
  const [batch, setBatch] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [bestBefore, setBestBefore] = useState('');
  const [vegMark, setVegMark] = useState('');
  const [nutrition, setNutrition] = useState('');
  const [allergens, setAllergens] = useState('');

  const brand = brandOptions.find((option) => option.id === brandId) ?? null;
  const brandSegment = brand?.segment ?? null;
  const slug = slugOverride.trim() ? slugify(slugOverride) : slugify(name);

  // The brand answers the two regulatory questions for most segments. See
  // `segmentDefaults` for why FRAGRANCE deliberately answers neither.
  useEffect(() => {
    if (regulatoryTouched.current) return;
    const defaults = segmentDefaults(brandSegment);
    setIsFoodProduct(defaults.isFoodProduct);
    setIsCosmetic(defaults.isCosmetic);
  }, [brandSegment]);

  // A rejected submit otherwise leaves the user on the last step looking at an
  // error about a field three steps back. Jump to the earliest step that has one.
  useEffect(() => {
    const errorSteps = Object.keys(state.fieldErrors ?? {})
      .map((field) => STEP_OF_FIELD[field])
      .filter((value): value is number => typeof value === 'number');
    if (errorSteps.length > 0) setStep(Math.min(...errorSteps));
  }, [state]);

  const skus = useMemo(
    () => resolveRowSkus(rows, brand?.label ?? '', name),
    [rows, brand, name],
  );
  const filledRows = rows.filter((row) => row.size.trim() !== '');

  const foodLabelComplete = !foodLabelIncomplete({
    netQty,
    batch,
    mfgDate,
    bestBefore,
    vegMark,
    nutrition,
    allergens,
  });

  const checklist = publishChecklist({
    hasName: name.trim() !== '',
    hasBrand: brandId !== '',
    hasCategory: categoryId !== '',
    hasSummary: shortDesc.trim() !== '',
    hasDescription: description.trim() !== '',
    hasHsn: hsnCode.trim() !== '',
    variantCount: filledRows.length,
    isFoodProduct,
    foodLabelComplete,
  });

  const steps = isFoodProduct ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
  const isLastStep = step === steps[steps.length - 1];

  function updateRow(index: number, patch: Partial<GuidedVariantRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Client-side gating only — friendlier than a round trip, never a substitute for one. */
  function problemWithStep(current: number): string {
    if (current === 1) {
      if (name.trim() === '') return 'Give the product a name.';
      if (slug === '') return 'That name has no letters or numbers in it — add some.';
      if (brandId === '') return 'Choose which brand this belongs to.';
      if (categoryId === '') return 'Choose a category.';
    }
    if (current === 2) {
      if (shortDesc.trim() === '') return 'Write the one-line summary.';
      if (description.trim() === '') return 'Write the full description.';
    }
    if (current === 5 && isFoodProduct && !foodLabelComplete) {
      return 'Every food label field is required by law before this product can go live.';
    }
    return '';
  }

  function goToStep(target: number) {
    // Going back never needs validating; going forward checks the step being left.
    if (target > step) {
      const problem = problemWithStep(step);
      if (problem) {
        setStepError(problem);
        return;
      }
    }
    setStepError('');
    setStep(target);
  }

  // Widened back to the full row shape the server parses. Rows without a size are
  // dropped rather than sent — `parseVariantRowsJson` would reject them, and an
  // empty row the user never filled in is not an error worth showing them.
  const variantPayload: VariantRowValue[] = rows
    .map((row, index) => ({ row, sku: skus[index] ?? '' }))
    .filter(({ row }) => row.size.trim() !== '')
    .map(({ row, sku }) => ({
      sku,
      variantName: row.variantName.trim(),
      variantHex: '',
      size: row.size.trim(),
      format: '',
      mrpRupees: row.mrpRupees.trim(),
      priceRupees: row.priceRupees.trim(),
      wholesaleRupees: '',
      weightGrams: row.weightGrams.trim(),
      barcode: '',
    }));

  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form action={formAction} noValidate>
        {state.error && (
          <p
            role="alert"
            className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
          >
            {state.error}
          </p>
        )}

        <ol className="flex flex-wrap gap-2">
          {steps.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => goToStep(value)}
                aria-current={value === step ? 'step' : undefined}
                className={`rounded-control border px-4 py-2 type-caption ${
                  value === step ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
                }`}
              >
                {value}. {STEP_TITLES[value - 1]}
              </button>
            </li>
          ))}
        </ol>

        {stepError && (
          <p role="alert" className="mt-6 type-body text-warning">
            {stepError}
          </p>
        )}

        {step === 1 && (
          <section className="mt-8">
            <label htmlFor="guided-name" className={labelClass}>
              Product name
            </label>
            <input
              id="guided-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dish Wash Liquid"
              className={inputClass}
            />
            <p className={hintClass}>
              The name as it should appear in the shop. Leave the size out — sizes come later.
            </p>
            {state.fieldErrors?.name && <p className={fieldErrorClass}>{state.fieldErrors.name}</p>}

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="guided-brand" className={labelClass}>
                  Brand
                </label>
                <select
                  id="guided-brand"
                  value={brandId}
                  onChange={(event) => setBrandId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a brand</option>
                  {brandOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.brandId && (
                  <p className={fieldErrorClass}>{state.fieldErrors.brandId}</p>
                )}
              </div>
              <div>
                <label htmlFor="guided-category" className={labelClass}>
                  Category
                </label>
                <select
                  id="guided-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a category</option>
                  {categoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.categoryId && (
                  <p className={fieldErrorClass}>{state.fieldErrors.categoryId}</p>
                )}
              </div>
            </div>

            {brand && segmentNote(brand.segment) && (
              <p className="mt-4 rounded-control border border-line px-4 py-3 type-body text-ink-soft">
                {segmentNote(brand.segment)}
                {!brand.hasLicence && ' That licence is not on the brand record yet.'}
              </p>
            )}

            {slug && (
              <p className={`mt-6 ${hintClass}`}>
                Its web address will be <span className="text-ink">/products/{slug}</span>
              </p>
            )}

            <details className="mt-4">
              <summary className="type-caption text-signal">Use a different web address</summary>
              <label htmlFor="guided-slug" className={`mt-4 ${labelClass}`}>
                Web address
              </label>
              <input
                id="guided-slug"
                value={slugOverride}
                onChange={(event) => setSlugOverride(event.target.value)}
                placeholder={slugify(name)}
                className={inputClass}
              />
              <p className={hintClass}>
                Letters, numbers and hyphens. Leave blank to use the product name.
              </p>
              {state.fieldErrors?.slug && <p className={fieldErrorClass}>{state.fieldErrors.slug}</p>}
            </details>
          </section>
        )}

        {step === 2 && (
          <section className="mt-8">
            <label htmlFor="guided-short" className={labelClass}>
              One-line summary
            </label>
            <input
              id="guided-short"
              value={shortDesc}
              maxLength={300}
              onChange={(event) => setShortDesc(event.target.value)}
              placeholder="Cuts grease fast, gentle on hands."
              className={inputClass}
            />
            <p className={hintClass}>Shown under the product name in listings.</p>
            {state.fieldErrors?.shortDesc && (
              <p className={fieldErrorClass}>{state.fieldErrors.shortDesc}</p>
            )}

            <label htmlFor="guided-description" className={`mt-6 ${labelClass}`}>
              Full description
            </label>
            <textarea
              id="guided-description"
              rows={6}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
            />
            {state.fieldErrors?.description && (
              <p className={fieldErrorClass}>{state.fieldErrors.description}</p>
            )}

            <LineListField
              legend="Key points"
              hint="Short selling points, one per line. Optional."
              placeholder="100% biodegradable"
              addLabel="+ Add another point"
              values={claims}
              onChange={setClaims}
            />

            <LineListField
              legend="How to use it"
              hint="One step per line, in order. Optional."
              placeholder="Add a few drops to warm water"
              addLabel="+ Add another step"
              values={usageSteps}
              onChange={setUsageSteps}
            />

            <label htmlFor="guided-ingredients" className={`mt-8 ${labelClass}`}>
              Ingredients
            </label>
            <textarea
              id="guided-ingredients"
              rows={3}
              value={ingredients}
              onChange={(event) => setIngredients(event.target.value)}
              className={inputClass}
            />
            <p className={hintClass}>Optional, but required on the pack for food and cosmetics.</p>
          </section>
        )}

        {step === 3 && (
          <section className="mt-8">
            <label htmlFor="guided-hsn" className={labelClass}>
              HSN code
            </label>
            <input
              id="guided-hsn"
              value={hsnCode}
              onChange={(event) => setHsnCode(event.target.value)}
              className={inputClass}
            />
            <p className={hintClass}>
              The tax code for this kind of product. Ask your accountant if you are not sure — it
              can be added later, but the product cannot go live without it.
            </p>

            <fieldset className="mt-8">
              <legend className={labelClass}>GST rate</legend>
              <p className={hintClass}>
                Pick the line that describes this product. Every product carries its own rate.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                {GST_CHOICES.map((choice) => (
                  <label
                    key={choice.value}
                    className="flex items-center gap-3 rounded-control border border-line px-4 py-3 type-body"
                  >
                    <input
                      type="radio"
                      name="guided-gst"
                      value={choice.value}
                      checked={gstRatePercent === choice.value}
                      onChange={(event) => setGstRatePercent(event.target.value)}
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
              {state.fieldErrors?.gstRatePercent && (
                <p className={fieldErrorClass}>{state.fieldErrors.gstRatePercent}</p>
              )}
            </fieldset>
          </section>
        )}

        {step === 4 && (
          <section className="mt-8">
            <p className="type-body text-ink-soft">
              One row per size or fragrance. Leave a price blank and the shop shows &quot;Price on
              request&quot; — never ₹0.00.
            </p>

            <div className="mt-6 flex flex-col gap-8">
              {rows.map((row, index) => (
                <fieldset key={index} className="rounded-card border border-line p-6">
                  <div className="flex items-center justify-between">
                    <legend className="type-caption text-ink-soft">Size {index + 1}</legend>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                        className="type-caption text-warning underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-6 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`guided-size-${index}`} className={labelClass}>
                        Size
                      </label>
                      <input
                        id={`guided-size-${index}`}
                        value={row.size}
                        placeholder="500 ml"
                        onChange={(event) => updateRow(index, { size: event.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`guided-variant-${index}`} className={labelClass}>
                        Fragrance or variety
                      </label>
                      <input
                        id={`guided-variant-${index}`}
                        value={row.variantName}
                        placeholder="Lemon"
                        onChange={(event) => updateRow(index, { variantName: event.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-6 sm:grid-cols-3">
                    <div>
                      <label htmlFor={`guided-mrp-${index}`} className={labelClass}>
                        MRP (₹)
                      </label>
                      <input
                        id={`guided-mrp-${index}`}
                        inputMode="decimal"
                        placeholder="199.00"
                        value={row.mrpRupees}
                        onChange={(event) => updateRow(index, { mrpRupees: event.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`guided-price-${index}`} className={labelClass}>
                        Selling price (₹)
                      </label>
                      <input
                        id={`guided-price-${index}`}
                        inputMode="decimal"
                        placeholder="Leave blank if unknown"
                        value={row.priceRupees}
                        onChange={(event) => updateRow(index, { priceRupees: event.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`guided-weight-${index}`} className={labelClass}>
                        Weight (grams)
                      </label>
                      <input
                        id={`guided-weight-${index}`}
                        inputMode="numeric"
                        placeholder="550"
                        value={row.weightGrams}
                        onChange={(event) => updateRow(index, { weightGrams: event.target.value })}
                        className={inputClass}
                      />
                      <p className={hintClass}>Packed weight — used to work out courier charges.</p>
                    </div>
                  </div>

                  <details className="mt-4">
                    <summary className="type-caption text-signal">Use my own stock code</summary>
                    <label htmlFor={`guided-sku-${index}`} className={`mt-4 ${labelClass}`}>
                      Stock code
                    </label>
                    <input
                      id={`guided-sku-${index}`}
                      value={row.skuOverride}
                      placeholder={skus[index] ?? ''}
                      onChange={(event) => updateRow(index, { skuOverride: event.target.value })}
                      className={inputClass}
                    />
                    <p className={hintClass}>
                      Leave blank and we use <span className="text-ink">{skus[index] || '—'}</span>.
                    </p>
                  </details>
                </fieldset>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRows([...rows, { ...EMPTY_GUIDED_ROW }])}
              className="mt-6 rounded-control border border-line px-6 py-3 type-body font-medium"
            >
              + Add another size
            </button>
          </section>
        )}

        {step === 5 && isFoodProduct && (
          <section className="mt-8">
            <p className="type-body text-ink-soft">
              Every field here is required by law on a food product before it can go live.
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="guided-netQty" className={labelClass}>
                  Net quantity
                </label>
                <input
                  id="guided-netQty"
                  value={netQty}
                  placeholder="500 g"
                  onChange={(event) => setNetQty(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="guided-batch" className={labelClass}>
                  Batch number
                </label>
                <input
                  id="guided-batch"
                  value={batch}
                  onChange={(event) => setBatch(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="guided-mfgDate" className={labelClass}>
                  Packed on
                </label>
                <input
                  id="guided-mfgDate"
                  value={mfgDate}
                  placeholder="March 2026"
                  onChange={(event) => setMfgDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="guided-bestBefore" className={labelClass}>
                  Best before
                </label>
                <input
                  id="guided-bestBefore"
                  value={bestBefore}
                  placeholder="12 months from packing"
                  onChange={(event) => setBestBefore(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="guided-vegMark" className={labelClass}>
                  Veg mark
                </label>
                <select
                  id="guided-vegMark"
                  value={vegMark}
                  onChange={(event) => setVegMark(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose</option>
                  <option value="veg">Vegetarian — green mark</option>
                  <option value="non-veg">Non-vegetarian — brown mark</option>
                </select>
              </div>
              <div>
                <label htmlFor="guided-allergens" className={labelClass}>
                  Allergens
                </label>
                <input
                  id="guided-allergens"
                  value={allergens}
                  placeholder="None, or list them"
                  onChange={(event) => setAllergens(event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <label htmlFor="guided-nutrition" className={`mt-6 ${labelClass}`}>
              Nutrition information
            </label>
            <textarea
              id="guided-nutrition"
              rows={4}
              value={nutrition}
              placeholder="Per 100 g: Energy 380 kcal, Protein 2 g…"
              onChange={(event) => setNutrition(event.target.value)}
              className={inputClass}
            />
            {state.fieldErrors?.foodLabel && (
              <p className={fieldErrorClass}>{state.fieldErrors.foodLabel}</p>
            )}
          </section>
        )}

        <div className="mt-10 flex items-center gap-4 border-t border-line pt-8">
          {step > steps[0] && (
            <button
              type="button"
              onClick={() => goToStep(steps[steps.indexOf(step) - 1])}
              className="rounded-control border border-line px-6 py-3 type-body font-medium"
            >
              Back
            </button>
          )}
          {isLastStep ? (
            <SubmitButton />
          ) : (
            <button
              type="button"
              onClick={() => goToStep(steps[steps.indexOf(step) + 1])}
              className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
            >
              Next
            </button>
          )}
        </div>

        {/*
          The server contract. The visible inputs above are unnamed and controlled;
          everything the action reads is submitted from here, under exactly the
          field names `../product-form.tsx` uses.
        */}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="categoryId" value={categoryId} />
        <input type="hidden" name="shortDesc" value={shortDesc} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="hsnCode" value={hsnCode} />
        <input type="hidden" name="gstRatePercent" value={gstRatePercent} />
        <input type="hidden" name="claims" value={claimsToFieldValue(claims)} />
        <input type="hidden" name="ingredients" value={ingredients} />
        <input type="hidden" name="usageSteps" value={stepsToFieldValue(usageSteps)} />
        {/* The action compares these to the string 'on', so an unticked box sends nothing. */}
        {isFoodProduct && <input type="hidden" name="isFoodProduct" value="on" />}
        {isCosmetic && <input type="hidden" name="isCosmetic" value="on" />}
        <input type="hidden" name="netQty" value={isFoodProduct ? netQty : ''} />
        <input type="hidden" name="batch" value={isFoodProduct ? batch : ''} />
        <input type="hidden" name="mfgDate" value={isFoodProduct ? mfgDate : ''} />
        <input type="hidden" name="bestBefore" value={isFoodProduct ? bestBefore : ''} />
        <input type="hidden" name="vegMark" value={isFoodProduct ? vegMark : ''} />
        <input type="hidden" name="nutrition" value={isFoodProduct ? nutrition : ''} />
        <input type="hidden" name="allergens" value={isFoodProduct ? allergens : ''} />
        <input type="hidden" name="sortOrder" value="0" />
        {/*
          Sent as empty strings, not left out. `formData.get()` returns null for a
          field that was never rendered, and the schema's `.optional()` accepts
          undefined but not null — omitting these two failed the whole submit with
          no field to point at. The action turns '' into null, and the storefront
          falls back to the product name and summary, so SEO overrides stay a job
          for the full form.
        */}
        <input type="hidden" name="metaTitle" value="" />
        <input type="hidden" name="metaDesc" value="" />
        <input type="hidden" name="variantsJson" value={JSON.stringify(variantPayload)} />
        <input type="hidden" name="afterCreate" value="images" />
      </form>

      <aside className="lg:sticky lg:top-12 lg:self-start">
        <div className="rounded-card border border-line p-6">
          <p className="type-caption text-ink-soft">Before it can go live</p>
          <ul className="mt-4 flex flex-col gap-4">
            {checklist.map((item) => (
              <li key={item.label} className="type-body">
                <span className={item.done ? 'text-ink' : 'text-ink-soft'}>
                  {item.done ? '✓' : '○'} {item.label}
                </span>
                {!item.done && (
                  <span className="mt-1 block type-caption normal-case text-ink-soft">
                    {item.hint}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-line pt-4 type-caption normal-case text-ink-soft">
            Saving creates the product as a draft. Nothing appears in the shop until you publish
            it, and publishing is refused until this list is complete.
          </p>
        </div>

        <label className="mt-6 flex items-start gap-3 type-body">
          <input
            type="checkbox"
            checked={isFoodProduct}
            onChange={(event) => {
              regulatoryTouched.current = true;
              setIsFoodProduct(event.target.checked);
            }}
            className="mt-1"
          />
          <span>
            This is food or drink
            <span className="block type-caption normal-case text-ink-soft">
              Adds the FSSAI label step.
            </span>
          </span>
        </label>

        <label className="mt-4 flex items-start gap-3 type-body">
          <input
            type="checkbox"
            checked={isCosmetic}
            onChange={(event) => {
              regulatoryTouched.current = true;
              setIsCosmetic(event.target.checked);
            }}
            className="mt-1"
          />
          <span>
            This is a cosmetic
            <span className="block type-caption normal-case text-ink-soft">
              Soap, shampoo, lotion, perfume.
            </span>
          </span>
        </label>
      </aside>
    </div>
  );
}
