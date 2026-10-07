'use client';

import { useFormActionKeepingInput } from '@/lib/use-form-action';

import { useFormStatus } from 'react-dom';
import type { ComboFormState } from './actions';
import BoxSizeFields from '../box-size-fields';

export interface ComboFormValues {
  name: string;
  slug: string;
  shortDesc: string;
  description: string;
  imageUrl: string;
  priceRupees: string;
  isFeatured: boolean;
  weightGrams: string;
  lengthCm: string;
  breadthCm: string;
  heightCm: string;
}

const EMPTY_VALUES: ComboFormValues = {
  name: '',
  slug: '',
  shortDesc: '',
  description: '',
  imageUrl: '',
  priceRupees: '',
  isFeatured: false,
  weightGrams: '',
  lengthCm: '',
  breadthCm: '',
  heightCm: '',
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

export function ComboForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: ComboFormState, formData: FormData) => Promise<ComboFormState>;
  initialValues?: ComboFormValues;
  submitLabel: string;
}) {
  const [state, formAction, , formRef] = useFormActionKeepingInput(action, {} as ComboFormState);
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
        rows={4}
        defaultValue={values.description}
        className={inputClass}
      />

      <label htmlFor="imageUrl" className={`mt-6 ${labelClass}`}>
        Image URL — upload arrives separately
      </label>
      <input id="imageUrl" name="imageUrl" defaultValue={values.imageUrl} className={inputClass} />

      <label htmlFor="priceRupees" className={`mt-6 ${labelClass}`}>
        Package price (₹)
      </label>
      <input
        id="priceRupees"
        name="priceRupees"
        required
        inputMode="decimal"
        defaultValue={values.priceRupees}
        className={inputClass}
      />
      {state.fieldErrors?.pricePaise && (
        <p className={fieldErrorClass}>{state.fieldErrors.pricePaise}</p>
      )}

      <label className="mt-6 flex items-center gap-3 type-body">
        <input type="checkbox" name="isFeatured" defaultChecked={values.isFeatured} />
        Featured
      </label>

      <h3 className="mt-10 type-subhead">Shipping</h3>
      <p className="mt-1 type-caption text-ink-soft">
        Only if this combo ships in its own carton. Left empty, the weights and boxes of the
        products inside it are used.
      </p>

      <label htmlFor="weightGrams" className="mt-6 block type-caption text-ink-soft">
        Packed weight (grams)
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

      <BoxSizeFields
        values={values}
        error={state.fieldErrors?.box}
        hint="Couriers charge by size as well as weight."
        labelClass={labelClass}
        inputClass={inputClass}
        errorClass={fieldErrorClass}
      />

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
