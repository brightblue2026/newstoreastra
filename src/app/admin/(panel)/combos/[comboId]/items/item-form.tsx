'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ComboItemFormState } from './actions';

export interface VariantOption {
  id: string;
  productId: string;
  label: string;
}

export interface ComboItemFormValues {
  variantId: string;
  quantity: number;
  isChoice: boolean;
  choiceOf: string[];
}

const EMPTY_VALUES: ComboItemFormValues = {
  variantId: '',
  quantity: 1,
  isChoice: false,
  choiceOf: [],
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

export function ComboItemForm({
  action,
  initialValues,
  variantOptions,
  submitLabel,
}: {
  action: (state: ComboItemFormState, formData: FormData) => Promise<ComboItemFormState>;
  initialValues?: ComboItemFormValues;
  variantOptions: VariantOption[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as ComboItemFormState);
  const values = initialValues ?? EMPTY_VALUES;
  const [variantId, setVariantId] = useState(values.variantId);
  const [isChoice, setIsChoice] = useState(values.isChoice);

  const selected = variantOptions.find((option) => option.id === variantId);
  const siblingOptions = selected
    ? variantOptions.filter((option) => option.productId === selected.productId)
    : [];

  return (
    <form action={formAction} className="mt-8 max-w-2xl" noValidate>
      {state.error && (
        <p
          role="alert"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          {state.error}
        </p>
      )}

      <label htmlFor="variantId" className={labelClass}>
        Variant
      </label>
      <select
        id="variantId"
        name="variantId"
        required
        defaultValue={values.variantId}
        onChange={(event) => setVariantId(event.target.value)}
        className={inputClass}
      >
        <option value="" disabled>
          Choose a variant
        </option>
        {variantOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {state.fieldErrors?.variantId && (
        <p className={fieldErrorClass}>{state.fieldErrors.variantId}</p>
      )}

      <label htmlFor="quantity" className={`mt-6 ${labelClass}`}>
        Quantity
      </label>
      <input
        id="quantity"
        name="quantity"
        type="number"
        min={1}
        max={999}
        required
        defaultValue={values.quantity}
        className={inputClass}
      />
      {state.fieldErrors?.quantity && (
        <p className={fieldErrorClass}>{state.fieldErrors.quantity}</p>
      )}

      <label className="mt-6 flex items-center gap-3 type-body">
        <input
          type="checkbox"
          name="isChoice"
          defaultChecked={values.isChoice}
          onChange={(event) => setIsChoice(event.target.checked)}
        />
        Customer picks the fragrance for this slot
      </label>

      {isChoice && (
        <div className="mt-6">
          <label htmlFor="choiceOf" className={labelClass}>
            Restrict to — blank means any variant of the same product
          </label>
          <select
            id="choiceOf"
            name="choiceOf"
            multiple
            defaultValue={values.choiceOf}
            className={inputClass + ' h-32'}
          >
            {siblingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.choiceOf && (
            <p className={fieldErrorClass}>{state.fieldErrors.choiceOf}</p>
          )}
        </div>
      )}

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
