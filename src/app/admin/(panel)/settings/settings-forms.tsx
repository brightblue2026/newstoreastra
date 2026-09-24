'use client';

import { useFormActionKeepingInput } from '@/lib/use-form-action';
import { useFormStatus } from 'react-dom';
import {
  saveCodSettingsAction,
  saveSellerEntityAction,
  saveShippingSettingsAction,
  saveShiprocketSettingsAction,
  type SettingsFormState,
} from './actions';

/*
  The three settings forms.

  Client components only because `useActionState` needs to render the result of a
  save. Every value still arrives at the server as untyped `FormData` and is
  re-validated there; nothing here is a check, it is a keyboard.

  Amounts are typed in rupees and parsed to paise server-side by
  `parseRupeesToPaise`, which parses the string rather than multiplying a float —
  ₹39.50 must not arrive as 3949 paise.
*/

const inputClass =
  'w-full rounded-control border border-line bg-paper px-4 py-3 type-body focus-visible:border-ink';

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

function Result({ state }: { state: SettingsFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="type-caption text-warning">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="type-caption text-success">
        {state.saved}
      </p>
    );
  }
  return null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block type-caption text-ink-soft">{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint && <span className="mt-1 block type-caption text-ink-soft">{hint}</span>}
    </label>
  );
}

export function SellerEntityForm({
  entities,
  currentEntityId,
  currentGstin,
}: {
  entities: { id: string; legalName: string; role: string; city: string | null }[];
  currentEntityId: string | null;
  currentGstin: string | null;
}) {
  const [state, action, , formRef] = useFormActionKeepingInput<SettingsFormState>(
    saveSellerEntityAction, {});

  return (
    <form ref={formRef} action={action} className="max-w-xl space-y-6">
      <Field
        label="Seller of record"
        hint="The entity that appears on every invoice. Exactly one — choosing here clears it everywhere else."
      >
        <select name="entityId" defaultValue={currentEntityId ?? ''} required className={inputClass}>
          <option value="">Choose an entity</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.legalName} — {entity.role}
              {entity.city ? `, ${entity.city}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="GSTIN" hint="15 characters, as issued. This is what prints on the invoice.">
        <input
          name="gstin"
          defaultValue={currentGstin ?? ''}
          required
          maxLength={15}
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputClass} type-mono uppercase`}
        />
      </Field>

      <Result state={state} />
      <SubmitButton label="Save seller of record" />
    </form>
  );
}

export function CodSettingsForm({
  enabled,
  feeRupees,
  minOrderRupees,
  maxOrderRupees,
  pincodeAllowlist,
}: {
  enabled: boolean;
  feeRupees: string;
  minOrderRupees: string;
  maxOrderRupees: string;
  pincodeAllowlist: string[];
}) {
  const [state, action, , formRef] = useFormActionKeepingInput<SettingsFormState>(
    saveCodSettingsAction, {});

  return (
    <form ref={formRef} action={action} className="max-w-xl space-y-6">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-1" />
        <span>
          <span className="block type-body">Offer cash on delivery</span>
          <span className="block type-caption text-ink-soft">
            Off means the option does not appear at checkout at all.
          </span>
        </span>
      </label>

      <Field label="Handling fee (₹)" hint="Charged on top, and never discounted.">
        <input name="feeRupees" defaultValue={feeRupees} inputMode="decimal" className={inputClass} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Minimum order (₹)">
          <input
            name="minOrderRupees"
            defaultValue={minOrderRupees}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Maximum order (₹)" hint="Leave 0 for no ceiling.">
          <input
            name="maxOrderRupees"
            defaultValue={maxOrderRupees}
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Pincode allowlist"
        hint="One per line, or comma separated. A prefix works: 67 covers every 67xxxx pincode. Empty means everywhere COD is offered."
      >
        <textarea
          name="pincodeAllowlist"
          defaultValue={pincodeAllowlist.join('\n')}
          rows={4}
          className={`${inputClass} type-mono`}
        />
      </Field>

      <Result state={state} />
      <SubmitButton label="Save COD settings" />
    </form>
  );
}

const SLAB_ROWS = 6;

export function ShippingSettingsForm({
  slabs,
  overflowPriceRupees,
  defaultUnitGrams,
  serviceablePincodePrefixes,
}: {
  slabs: { uptoGrams: number; priceRupees: string }[];
  overflowPriceRupees: string;
  defaultUnitGrams: number;
  serviceablePincodePrefixes: string[];
}) {
  const [state, action, , formRef] = useFormActionKeepingInput<SettingsFormState>(
    saveShippingSettingsAction,
    {},
  );

  // A fixed number of rows rather than an add-a-row button: a weight slab table
  // is four or five lines and stays that way, and rows that need no JavaScript
  // cannot half-work.
  const rows = Array.from({ length: SLAB_ROWS }, (_, index) => slabs[index]);

  return (
    <form ref={formRef} action={action} className="max-w-xl space-y-6">
      <fieldset>
        <legend className="type-caption text-ink-soft">
          Weight slabs — the narrowest slab that holds the order wins
        </legend>
        <table className="mt-3 w-full">
          <thead>
            <tr className="text-left type-caption text-ink-soft">
              <th scope="col" className="pb-2 font-normal">
                Up to (grams)
              </th>
              <th scope="col" className="pb-2 font-normal">
                Charge (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="py-1 pr-3">
                  <input
                    name="slabUptoGrams"
                    defaultValue={row?.uptoGrams ?? ''}
                    inputMode="numeric"
                    placeholder="—"
                    className={inputClass}
                  />
                </td>
                <td className="py-1">
                  <input
                    name="slabPriceRupees"
                    defaultValue={row?.priceRupees ?? ''}
                    inputMode="decimal"
                    placeholder="—"
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 type-caption text-ink-soft">
          Leave a row blank to drop it. With no slabs at all, delivery is free on every order.
        </p>
      </fieldset>

      <Field label="Charge above the heaviest slab (₹)">
        <input
          name="overflowPriceRupees"
          defaultValue={overflowPriceRupees}
          inputMode="decimal"
          className={inputClass}
        />
      </Field>

      <Field
        label="Assumed weight per unit (grams)"
        hint="Used for a variant with no weight recorded. 0 assumes nothing, which puts it in the lightest slab."
      >
        <input
          name="defaultUnitGrams"
          defaultValue={defaultUnitGrams}
          inputMode="numeric"
          className={inputClass}
        />
      </Field>

      <Field
        label="Pincodes we deliver to"
        hint="Prefixes allowed. Empty means everywhere. With live rates on, Shiprocket decides instead and this list is the fallback."
      >
        <textarea
          name="serviceablePincodePrefixes"
          defaultValue={serviceablePincodePrefixes.join('\n')}
          rows={4}
          className={`${inputClass} type-mono`}
        />
      </Field>

      <Result state={state} />
      <SubmitButton label="Save delivery rates" />
    </form>
  );
}

export interface PickupOption {
  name: string;
  pincode: string;
  city: string;
  verified: boolean;
}

/**
 * `locations` is null when Shiprocket could not be asked — then the pickup
 * name is typed, exactly as it appears in the Shiprocket dashboard. When it
 * could, the admin picks from the account's real pickup points instead.
 */
export function ShiprocketSettingsForm({
  locations,
  pickupLocation,
  originPincode,
  preferLiveRates,
  autoPushOrders,
}: {
  locations: PickupOption[] | null;
  pickupLocation: string;
  originPincode: string;
  preferLiveRates: boolean;
  autoPushOrders: boolean;
}) {
  const [state, action, , formRef] = useFormActionKeepingInput<SettingsFormState>(
    saveShiprocketSettingsAction,
    {},
  );

  return (
    <form ref={formRef} action={action} className="max-w-xl space-y-6">
      {locations ? (
        <Field
          label="Pickup location"
          hint="Where the courier collects parcels. Its pincode is filled in from Shiprocket when you save."
        >
          <select
            name="shiprocketPickupLocation"
            defaultValue={pickupLocation}
            className={inputClass}
          >
            <option value="">Not chosen</option>
            {locations.map((location) => (
              <option key={location.name} value={location.name}>
                {`${location.name} — ${location.city} ${location.pincode}`}
                {location.verified ? '' : ' (phone not verified in Shiprocket)'}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field
          label="Pickup location name"
          hint="Exactly as it appears under Settings → Pickup addresses in the Shiprocket dashboard."
        >
          <input
            name="shiprocketPickupLocation"
            defaultValue={pickupLocation}
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Pickup pincode" hint="Six digits. Used to ask for live delivery rates.">
        <input
          name="originPincode"
          defaultValue={originPincode}
          inputMode="numeric"
          maxLength={6}
          className={`${inputClass} type-mono`}
        />
      </Field>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="preferLiveRates"
          defaultChecked={preferLiveRates}
          className="mt-1"
        />
        <span>
          <span className="block type-body">Charge live Shiprocket rates at checkout</span>
          <span className="mt-1 block type-caption text-ink-soft">
            Off: customers pay the slab table above. On: they pay the cheapest courier&rsquo;s
            rate, and the slab table is used whenever Shiprocket does not answer. Compare the
            two on a few real orders before switching this on.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="autoPushOrders"
          defaultChecked={autoPushOrders}
          className="mt-1"
        />
        <span>
          <span className="block type-body">Send confirmed orders to Shiprocket automatically</span>
          <span className="mt-1 block type-caption text-ink-soft">
            Each order appears in Shiprocket as soon as it is paid, or placed as cash on delivery.
            Nothing is charged until you press Ship on the order. Shiprocket has no test mode, so
            cancel any test order in Shiprocket straight away.
          </span>
        </span>
      </label>

      <Result state={state} />
      <SubmitButton label="Save Shiprocket settings" />
    </form>
  );
}
