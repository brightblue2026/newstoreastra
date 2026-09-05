'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { BrandFormState } from './actions';

const SEGMENTS = [
  'HOME_CARE',
  'DISH_CARE',
  'FABRIC_CARE',
  'CAR_CARE',
  'PERSONAL_CARE',
  'FOOD',
  'BEVERAGE',
  'FRAGRANCE',
] as const;

function segmentLabel(segment: string): string {
  return segment
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export interface BrandFormValues {
  name: string;
  slug: string;
  tagline: string;
  story: string;
  accentHex: string;
  segment: string;
  fssaiLicence: string;
  cosmeticLicence: string;
  sortOrder: number;
}

const EMPTY_VALUES: BrandFormValues = {
  name: '',
  slug: '',
  tagline: '',
  story: '',
  accentHex: '#0F9CD6',
  segment: '',
  fssaiLicence: '',
  cosmeticLicence: '',
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

const inputClass =
  'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const fieldErrorClass = 'mt-2 type-caption normal-case text-warning';

export function BrandForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: BrandFormState, formData: FormData) => Promise<BrandFormState>;
  initialValues?: BrandFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as BrandFormState);
  const values = initialValues ?? EMPTY_VALUES;

  return (
    <form action={formAction} className="mt-8 max-w-2xl" noValidate>
      {state.error && (
        <p role="alert" className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
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

      <label htmlFor="segment" className={`mt-6 ${labelClass}`}>
        Segment
      </label>
      <select
        id="segment"
        name="segment"
        required
        defaultValue={values.segment}
        className={inputClass}
      >
        <option value="" disabled>
          Choose a segment
        </option>
        {SEGMENTS.map((segment) => (
          <option key={segment} value={segment}>
            {segmentLabel(segment)}
          </option>
        ))}
      </select>
      {state.fieldErrors?.segment && (
        <p className={fieldErrorClass}>{state.fieldErrors.segment}</p>
      )}

      <label htmlFor="accentHex" className={`mt-6 ${labelClass}`}>
        Accent colour
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          aria-label="Accent colour picker"
          defaultValue={values.accentHex}
          onChange={(event) => {
            const text = document.getElementById('accentHex') as HTMLInputElement | null;
            if (text) text.value = event.target.value;
          }}
          className="h-11 w-11 shrink-0 rounded-control border border-line"
        />
        <input
          id="accentHex"
          name="accentHex"
          required
          pattern="#[0-9a-fA-F]{6}"
          defaultValue={values.accentHex}
          className={inputClass + ' mt-0'}
        />
      </div>
      {state.fieldErrors?.accentHex && (
        <p className={fieldErrorClass}>{state.fieldErrors.accentHex}</p>
      )}

      <label htmlFor="tagline" className={`mt-6 ${labelClass}`}>
        Tagline
      </label>
      <input id="tagline" name="tagline" defaultValue={values.tagline} className={inputClass} />

      <label htmlFor="story" className={`mt-6 ${labelClass}`}>
        Story
      </label>
      <textarea
        id="story"
        name="story"
        rows={4}
        defaultValue={values.story}
        className={inputClass}
      />

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="fssaiLicence" className={labelClass}>
            FSSAI licence
          </label>
          <input
            id="fssaiLicence"
            name="fssaiLicence"
            defaultValue={values.fssaiLicence}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cosmeticLicence" className={labelClass}>
            Cosmetics licence
          </label>
          <input
            id="cosmeticLicence"
            name="cosmeticLicence"
            defaultValue={values.cosmeticLicence}
            className={inputClass}
          />
        </div>
      </div>

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
