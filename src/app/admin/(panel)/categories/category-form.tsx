'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { CategoryFormState } from './actions';

export interface ParentOption {
  id: string;
  label: string;
}

export interface CategoryFormValues {
  name: string;
  slug: string;
  parentId: string;
  description: string;
  sortOrder: number;
}

const EMPTY_VALUES: CategoryFormValues = {
  name: '',
  slug: '',
  parentId: '',
  description: '',
  sortOrder: 0,
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

export function CategoryForm({
  action,
  initialValues,
  parentOptions,
  submitLabel,
}: {
  action: (state: CategoryFormState, formData: FormData) => Promise<CategoryFormState>;
  initialValues?: CategoryFormValues;
  parentOptions: ParentOption[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as CategoryFormState);
  const values = initialValues ?? EMPTY_VALUES;

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

      <label htmlFor="parentId" className={`mt-6 ${labelClass}`}>
        Parent category
      </label>
      <select id="parentId" name="parentId" defaultValue={values.parentId} className={inputClass}>
        <option value="">None — top level</option>
        {parentOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {state.fieldErrors?.parentId && (
        <p className={fieldErrorClass}>{state.fieldErrors.parentId}</p>
      )}

      <label htmlFor="description" className={`mt-6 ${labelClass}`}>
        Description
      </label>
      <textarea
        id="description"
        name="description"
        rows={3}
        defaultValue={values.description}
        className={inputClass}
      />

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

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
