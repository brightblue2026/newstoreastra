'use client';

import { useFormActionKeepingInput } from '@/lib/use-form-action';

import { useFormStatus } from 'react-dom';
import type { VariantFormState } from './actions';

export interface VariantFormValues {
  sku: string;
  variantName: string;
  variantHex: string;
  size: string;
  format: string;
  mrpRupees: string;
  priceRupees: string;
  wholesaleRupees: string;
  weightGrams: string;
  barcode: string;
}

const EMPTY_VALUES: VariantFormValues = {
  sku: '',
  variantName: '',
  variantHex: '',
  size: '',
  format: '',
  mrpRupees: '',
  priceRupees: '',
  wholesaleRupees: '',
  weightGrams: '',
  barcode: '',
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

export function VariantForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: VariantFormState, formData: FormData) => Promise<VariantFormState>;
  initialValues?: VariantFormValues;
  submitLabel: string;
}) {
  const [state, formAction, , formRef] = useFormActionKeepingInput(action, {} as VariantFormState);
  const values = initialValues ?? EMPTY_VALUES;

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

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="sku" className={labelClass}>
            SKU
          </label>
          <input id="sku" name="sku" required defaultValue={values.sku} className={inputClass} />
          {state.fieldErrors?.sku && <p className={fieldErrorClass}>{state.fieldErrors.sku}</p>}
        </div>
        <div>
          <label htmlFor="barcode" className={labelClass}>
            Barcode
          </label>
          <input id="barcode" name="barcode" defaultValue={values.barcode} className={inputClass} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="variantName" className={labelClass}>
            Variant name
          </label>
          <input
            id="variantName"
            name="variantName"
            placeholder="Lemon, Jasmin, Cardamom…"
            defaultValue={values.variantName}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="variantHex" className={labelClass}>
            Variant accent colour
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              aria-label="Variant colour picker"
              defaultValue={values.variantHex || '#0F9CD6'}
              onChange={(event) => {
                const text = document.getElementById('variantHex') as HTMLInputElement | null;
                if (text) text.value = event.target.value;
              }}
              className="h-11 w-11 shrink-0 rounded-control border border-line"
            />
            <input
              id="variantHex"
              name="variantHex"
              pattern="#[0-9a-fA-F]{6}"
              defaultValue={values.variantHex}
              className={inputClass + ' mt-0'}
            />
          </div>
          {state.fieldErrors?.variantHex && (
            <p className={fieldErrorClass}>{state.fieldErrors.variantHex}</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="size" className={labelClass}>
            Size
          </label>
          <input
            id="size"
            name="size"
            required
            placeholder="900 ml, 250 g, 5 L…"
            defaultValue={values.size}
            className={inputClass}
          />
          {state.fieldErrors?.size && <p className={fieldErrorClass}>{state.fieldErrors.size}</p>}
        </div>
        <div>
          <label htmlFor="format" className={labelClass}>
            Format
          </label>
          <input
            id="format"
            name="format"
            placeholder="Liquid, Semi-Gel…"
            defaultValue={values.format}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <div>
          <label htmlFor="mrpRupees" className={labelClass}>
            MRP (₹)
          </label>
          <input
            id="mrpRupees"
            name="mrpRupees"
            inputMode="decimal"
            placeholder="199.00"
            defaultValue={values.mrpRupees}
            className={inputClass}
          />
          {state.fieldErrors?.mrpRupees && (
            <p className={fieldErrorClass}>{state.fieldErrors.mrpRupees}</p>
          )}
        </div>
        <div>
          <label htmlFor="priceRupees" className={labelClass}>
            Price (₹) — blank = &quot;Price on request&quot;
          </label>
          <input
            id="priceRupees"
            name="priceRupees"
            inputMode="decimal"
            placeholder="149.00"
            defaultValue={values.priceRupees}
            className={inputClass}
          />
          {state.fieldErrors?.priceRupees && (
            <p className={fieldErrorClass}>{state.fieldErrors.priceRupees}</p>
          )}
        </div>
        <div>
          <label htmlFor="wholesaleRupees" className={labelClass}>
            Wholesale (₹)
          </label>
          <input
            id="wholesaleRupees"
            name="wholesaleRupees"
            inputMode="decimal"
            defaultValue={values.wholesaleRupees}
            className={inputClass}
          />
          {state.fieldErrors?.wholesaleRupees && (
            <p className={fieldErrorClass}>{state.fieldErrors.wholesaleRupees}</p>
          )}
        </div>
      </div>

      <label htmlFor="weightGrams" className={`mt-6 ${labelClass}`}>
        Weight (grams)
      </label>
      <input
        id="weightGrams"
        name="weightGrams"
        inputMode="numeric"
        defaultValue={values.weightGrams}
        className={inputClass}
      />
      {state.fieldErrors?.weightGrams && (
        <p className={fieldErrorClass}>{state.fieldErrors.weightGrams}</p>
      )}

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
