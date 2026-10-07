'use client';

import { useFormActionKeepingInput } from '@/lib/use-form-action';

import { useFormStatus } from 'react-dom';
import type { StockFormState } from './actions';

export interface LocationRow {
  locationId: string;
  locationName: string;
  address: string;
  quantity: string;
  lowStockAt: string;
  /** Owned by the order engine, shown read-only. */
  reserved: number;
  /** Whether an `Inventory` row exists for this location yet. */
  counted: boolean;
}

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body tabular-nums';
const labelClass = 'block type-caption text-ink-soft';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Saving' : 'Save stock'}
    </button>
  );
}

/**
 * Sets counted stock for one variant at every active location.
 *
 * Uncontrolled inputs with `defaultValue`, so a stocktake survives the form
 * being re-rendered by the action's result — the same choice `product-form.tsx`
 * makes, and the reason a rejected submit here never wipes what was typed.
 */
export function StockForm({
  action,
  rows,
}: {
  action: (state: StockFormState, formData: FormData) => Promise<StockFormState>;
  rows: LocationRow[];
}) {
  const [state, formAction, , formRef] = useFormActionKeepingInput(action, {} as StockFormState);

  return (
    <form ref={formRef} action={formAction} className="mt-8" noValidate>
      {state.error && (
        <p
          role="alert"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          {state.error}
        </p>
      )}
      {state.saved && (
        <p
          role="status"
          aria-live="polite"
          className="mb-6 rounded-control border border-line px-4 py-3 type-body"
        >
          {state.saved}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {rows.map((row) => (
          <fieldset key={row.locationId} className="rounded-card border border-line p-6">
            <legend className="type-body">{row.locationName}</legend>
            <p className="type-caption normal-case text-ink-soft">{row.address}</p>

            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <div>
                <label htmlFor={`qty_${row.locationId}`} className={labelClass}>
                  Counted on the shelf
                </label>
                <input
                  id={`qty_${row.locationId}`}
                  name={`qty_${row.locationId}`}
                  inputMode="numeric"
                  defaultValue={row.quantity}
                  aria-describedby={
                    state.fieldErrors?.[row.locationId] ? `err_${row.locationId}` : undefined
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`low_${row.locationId}`} className={labelClass}>
                  Tell me when it drops to
                </label>
                <input
                  id={`low_${row.locationId}`}
                  name={`low_${row.locationId}`}
                  inputMode="numeric"
                  defaultValue={row.lowStockAt}
                  className={inputClass}
                />
              </div>
              <div>
                <span className={labelClass}>Held for customers</span>
                <p className="mt-2 px-4 py-3 type-body tabular-nums text-ink-soft">
                  {row.reserved}
                </p>
                <p className="type-caption normal-case text-ink-soft">
                  Set by the shop during checkout — not editable here.
                </p>
              </div>
            </div>

            {!row.counted && (
              <p className="mt-4 type-caption normal-case text-ink-soft">
                Never counted here. Saving creates the record.
              </p>
            )}
            {state.fieldErrors?.[row.locationId] && (
              <p id={`err_${row.locationId}`} className="mt-4 type-caption normal-case text-warning">
                {state.fieldErrors[row.locationId]}
              </p>
            )}
          </fieldset>
        ))}
      </div>

      <div className="mt-8">
        <SubmitButton />
      </div>
    </form>
  );
}
