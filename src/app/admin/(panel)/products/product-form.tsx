'use client';

import { useState } from 'react';
import { useFormActionKeepingInput } from '@/lib/use-form-action';
import { useFormStatus } from 'react-dom';
import type { ProductFormState } from './actions';
import { VariantRowsField } from './variant-rows-field';

export interface SelectOption {
  id: string;
  label: string;
}

export interface ProductFormValues {
  name: string;
  slug: string;
  brandId: string;
  categoryId: string;
  shortDesc: string;
  description: string;
  hsnCode: string;
  gstRatePercent: string;
  claims: string;
  ingredients: string;
  usageSteps: string;
  isFoodProduct: boolean;
  isCosmetic: boolean;
  netQty: string;
  batch: string;
  mfgDate: string;
  bestBefore: string;
  vegMark: string;
  nutrition: string;
  allergens: string;
  countryOfOrigin: string;
  manufacturerName: string;
  manufacturerAddress: string;
  shelfLife: string;
  safetyWarnings: string;
  isFeatured: boolean;
  sortOrder: number;
  metaTitle: string;
  metaDesc: string;
}

const EMPTY_VALUES: ProductFormValues = {
  name: '',
  slug: '',
  brandId: '',
  categoryId: '',
  shortDesc: '',
  description: '',
  hsnCode: '',
  gstRatePercent: '',
  claims: '',
  ingredients: '',
  usageSteps: '',
  countryOfOrigin: '',
  manufacturerName: '',
  manufacturerAddress: '',
  shelfLife: '',
  safetyWarnings: '',
  isFoodProduct: false,
  isCosmetic: false,
  netQty: '',
  batch: '',
  mfgDate: '',
  bestBefore: '',
  vegMark: '',
  nutrition: '',
  allergens: '',
  isFeatured: false,
  sortOrder: 0,
  metaTitle: '',
  metaDesc: '',
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Saving' : label}
    </button>
  );
}

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const fieldErrorClass = 'mt-2 type-caption normal-case text-warning';
const sectionClass = 'mt-10 border-t border-line pt-8';

export function ProductForm({
  action,
  initialValues,
  brandOptions,
  categoryOptions,
  submitLabel,
  showVariantRows,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues?: ProductFormValues;
  brandOptions: SelectOption[];
  categoryOptions: SelectOption[];
  submitLabel: string;
  /** Renders the bulk variant-row section — only on the create screen. See `variant-rows.ts`. */
  showVariantRows?: boolean;
}) {
  const [state, formAction, , formRef] = useFormActionKeepingInput(action, {} as ProductFormState);
  const values = initialValues ?? EMPTY_VALUES;
  const [isFoodProduct, setIsFoodProduct] = useState(values.isFoodProduct);

  return (
    <form ref={formRef} action={formAction} className="mt-8 max-w-2xl" noValidate>
      {state.error && (
        <p
          role="alert"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          {state.error}
        </p>
      )}

      <label htmlFor="name" className={labelClass}>
        Name
      </label>
      <input id="name" name="name" required defaultValue={values.name} className={inputClass} />
      {state.fieldErrors?.name && <p className={fieldErrorClass}>{state.fieldErrors.name}</p>}

      <label htmlFor="slug" className={`mt-6 ${labelClass}`}>
        Slug
      </label>
      <input
        id="slug"
        name="slug"
        required
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        defaultValue={values.slug}
        className={inputClass}
      />
      {state.fieldErrors?.slug && <p className={fieldErrorClass}>{state.fieldErrors.slug}</p>}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="brandId" className={labelClass}>
            Brand
          </label>
          <select
            id="brandId"
            name="brandId"
            required
            defaultValue={values.brandId}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a brand
            </option>
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
          <label htmlFor="categoryId" className={labelClass}>
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={values.categoryId}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a category
            </option>
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

      <label htmlFor="shortDesc" className={`mt-6 ${labelClass}`}>
        Short description
      </label>
      <input
        id="shortDesc"
        name="shortDesc"
        required
        defaultValue={values.shortDesc}
        className={inputClass}
      />
      {state.fieldErrors?.shortDesc && (
        <p className={fieldErrorClass}>{state.fieldErrors.shortDesc}</p>
      )}

      <label htmlFor="description" className={`mt-6 ${labelClass}`}>
        Description
      </label>
      <textarea
        id="description"
        name="description"
        required
        rows={5}
        defaultValue={values.description}
        className={inputClass}
      />
      {state.fieldErrors?.description && (
        <p className={fieldErrorClass}>{state.fieldErrors.description}</p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="hsnCode" className={labelClass}>
            HSN code
          </label>
          <input id="hsnCode" name="hsnCode" defaultValue={values.hsnCode} className={inputClass} />
        </div>
        <div>
          <label htmlFor="gstRatePercent" className={labelClass}>
            GST rate (%)
          </label>
          <input
            id="gstRatePercent"
            name="gstRatePercent"
            inputMode="decimal"
            defaultValue={values.gstRatePercent}
            className={inputClass}
          />
          {state.fieldErrors?.gstRatePercent && (
            <p className={fieldErrorClass}>{state.fieldErrors.gstRatePercent}</p>
          )}
        </div>
      </div>

      <div className={sectionClass}>
        <label htmlFor="claims" className={labelClass}>
          Claims — one per line, as &quot;icon | label&quot;
        </label>
        <textarea
          id="claims"
          name="claims"
          rows={3}
          placeholder="leaf | 100% biodegradable"
          defaultValue={values.claims}
          className={inputClass}
        />

        <label htmlFor="ingredients" className={`mt-6 ${labelClass}`}>
          Ingredients
        </label>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={3}
          defaultValue={values.ingredients}
          className={inputClass}
        />

        <label htmlFor="usageSteps" className={`mt-6 ${labelClass}`}>
          Usage steps — one per line
        </label>
        <textarea
          id="usageSteps"
          name="usageSteps"
          rows={3}
          defaultValue={values.usageSteps}
          className={inputClass}
        />
      </div>

      <div className={sectionClass}>
        <label className="flex items-center gap-3 type-body">
          <input
            type="checkbox"
            name="isFoodProduct"
            defaultChecked={values.isFoodProduct}
            onChange={(event) => setIsFoodProduct(event.target.checked)}
          />
          This is a food product — needs FSSAI label fields
        </label>

        <label className="mt-4 flex items-center gap-3 type-body">
          <input type="checkbox" name="isCosmetic" defaultChecked={values.isCosmetic} />
          This is a cosmetic product
        </label>

        {isFoodProduct && (
          <div className="mt-6 rounded-card border border-line p-6">
            <p className="type-caption text-ink-soft">
              FSSAI label — every field is required before this product can publish
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="netQty" className={labelClass}>
                  Net quantity
                </label>
                <input id="netQty" name="netQty" defaultValue={values.netQty} className={inputClass} />
              </div>
              <div>
                <label htmlFor="batch" className={labelClass}>
                  Batch number
                </label>
                <input id="batch" name="batch" defaultValue={values.batch} className={inputClass} />
              </div>
              <div>
                <label htmlFor="mfgDate" className={labelClass}>
                  Manufacturing date
                </label>
                <input
                  id="mfgDate"
                  name="mfgDate"
                  defaultValue={values.mfgDate}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="bestBefore" className={labelClass}>
                  Best before
                </label>
                <input
                  id="bestBefore"
                  name="bestBefore"
                  defaultValue={values.bestBefore}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="vegMark" className={labelClass}>
                  Veg mark
                </label>
                <select
                  id="vegMark"
                  name="vegMark"
                  defaultValue={values.vegMark}
                  className={inputClass}
                >
                  <option value="">Choose</option>
                  <option value="veg">Vegetarian</option>
                  <option value="non-veg">Non-vegetarian</option>
                </select>
              </div>
              <div>
                <label htmlFor="allergens" className={labelClass}>
                  Allergens
                </label>
                <input
                  id="allergens"
                  name="allergens"
                  defaultValue={values.allergens}
                  className={inputClass}
                />
              </div>
            </div>
            <label htmlFor="nutrition" className={`mt-6 ${labelClass}`}>
              Nutrition information
            </label>
            <textarea
              id="nutrition"
              name="nutrition"
              rows={3}
              defaultValue={values.nutrition}
              className={inputClass}
            />
          </div>
        )}
        {state.fieldErrors?.foodLabel && (
          <p className={fieldErrorClass}>{state.fieldErrors.foodLabel}</p>
        )}
      </div>

      {/* Closed by default: most products take the standing details, and the
          form is long enough already. Open when anything in it is filled, so a
          saved value is never hidden. */}
      <details
        className={sectionClass}
        open={Boolean(
          values.countryOfOrigin ||
            values.manufacturerName ||
            values.manufacturerAddress ||
            values.shelfLife ||
            values.safetyWarnings,
        )}
      >
        <summary className="cursor-pointer type-body font-medium">Compliance and label details</summary>
        <p className="mt-2 type-caption normal-case text-ink-soft">
          Shown under &quot;Product details&quot; on the product page. Leave a box empty to use the
          standing detail named beside it. MRP and net quantity are set on each variant; ingredients
          and how to use are above.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="countryOfOrigin" className={labelClass}>
              Country of origin
            </label>
            <input
              id="countryOfOrigin"
              name="countryOfOrigin"
              placeholder="India"
              defaultValue={values.countryOfOrigin}
              className={inputClass}
            />
            <p className="mt-2 type-caption normal-case text-ink-soft">Empty shows India.</p>
          </div>
          <div>
            <label htmlFor="shelfLife" className={labelClass}>
              Shelf life or best before
            </label>
            <input
              id="shelfLife"
              name="shelfLife"
              placeholder="24 months from manufacture"
              defaultValue={values.shelfLife}
              className={inputClass}
            />
            <p className="mt-2 type-caption normal-case text-ink-soft">
              For food, tea, personal care and perfume. Empty shows nothing.
            </p>
          </div>
          <div>
            <label htmlFor="manufacturerName" className={labelClass}>
              Manufacturer name
            </label>
            <input
              id="manufacturerName"
              name="manufacturerName"
              defaultValue={values.manufacturerName}
              className={inputClass}
            />
            <p className="mt-2 type-caption normal-case text-ink-soft">
              Empty shows the seller as the marketer.
            </p>
          </div>
          <div>
            <label htmlFor="manufacturerAddress" className={labelClass}>
              Manufacturer address
            </label>
            <input
              id="manufacturerAddress"
              name="manufacturerAddress"
              defaultValue={values.manufacturerAddress}
              className={inputClass}
            />
          </div>
        </div>

        <label htmlFor="safetyWarnings" className={`mt-6 ${labelClass}`}>
          Caution and safety warnings
        </label>
        <textarea
          id="safetyWarnings"
          name="safetyWarnings"
          rows={2}
          placeholder="Keep out of reach of children. Avoid contact with eyes."
          defaultValue={values.safetyWarnings}
          className={inputClass}
        />
        <p className="mt-2 type-caption normal-case text-ink-soft">
          Empty shows the standard caution on cleaning and car-care products, and nothing on others.
        </p>
      </details>

      <div className={sectionClass}>
        <label className="flex items-center gap-3 type-body">
          <input type="checkbox" name="isFeatured" defaultChecked={values.isFeatured} />
          Featured
        </label>

        <label htmlFor="sortOrder" className={`mt-6 ${labelClass}`}>
          Sort order
        </label>
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          defaultValue={values.sortOrder}
          className={inputClass}
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="metaTitle" className={labelClass}>
              Meta title
            </label>
            <input
              id="metaTitle"
              name="metaTitle"
              defaultValue={values.metaTitle}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="metaDesc" className={labelClass}>
              Meta description
            </label>
            <input
              id="metaDesc"
              name="metaDesc"
              defaultValue={values.metaDesc}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {showVariantRows && <VariantRowsField />}

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
