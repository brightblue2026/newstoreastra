'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { KERALA_DISTRICTS, type RetailerField } from '@/lib/retailer';
import type { RetailerFormState } from './actions';

export type RetailerFormValues = Record<RetailerField, string>;

const EMPTY_VALUES: RetailerFormValues = {
  name: '',
  address: '',
  city: '',
  district: '',
  pincode: '',
  phone: '',
};

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const fieldErrorClass = 'mt-2 type-caption normal-case text-warning';

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

export function RetailerForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: RetailerFormState, formData: FormData) => Promise<RetailerFormState>;
  initialValues?: RetailerFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as RetailerFormState);
  const saved = initialValues ?? EMPTY_VALUES;
  const value = (name: RetailerField) => state.fields?.[name] ?? saved[name];

  function errorProps(name: RetailerField) {
    const message = state.fieldErrors?.[name];
    return message
      ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` }
      : {};
  }

  function fieldError(name: RetailerField) {
    const message = state.fieldErrors?.[name];
    return message ? (
      <p id={`${name}-error`} className={fieldErrorClass}>
        {message}
      </p>
    ) : null;
  }

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
        Shop name
      </label>
      <input id="name" name="name" defaultValue={value('name')} className={inputClass} {...errorProps('name')} />
      {fieldError('name')}

      <label htmlFor="address" className={`mt-6 ${labelClass}`}>
        Address
      </label>
      <textarea
        id="address"
        name="address"
        rows={3}
        defaultValue={value('address')}
        className={inputClass}
        {...errorProps('address')}
      />
      {fieldError('address')}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className={labelClass}>
            City or town
          </label>
          <input id="city" name="city" defaultValue={value('city')} className={inputClass} {...errorProps('city')} />
          {fieldError('city')}
        </div>
        <div>
          <label htmlFor="district" className={labelClass}>
            District
          </label>
          <input
            id="district"
            name="district"
            list="kerala-districts"
            defaultValue={value('district')}
            className={inputClass}
            {...errorProps('district')}
          />
          <datalist id="kerala-districts">
            {KERALA_DISTRICTS.map((district) => (
              <option key={district} value={district} />
            ))}
          </datalist>
          {fieldError('district')}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="pincode" className={labelClass}>
            Pincode
          </label>
          <input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            maxLength={7}
            defaultValue={value('pincode')}
            className={inputClass}
            {...errorProps('pincode')}
          />
          {fieldError('pincode')}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={value('phone')}
            className={inputClass}
            {...errorProps('phone')}
          />
          {fieldError('phone')}
        </div>
      </div>

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
