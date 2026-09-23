'use client';

import { useState } from 'react';
import { useFormActionKeepingInput } from '@/lib/use-form-action';
import { useFormStatus } from 'react-dom';
import type { DiscountFormState, DiscountPreviewResult } from './actions';
import { formatINR } from '@/lib/money';

export interface SelectOption {
  id: string;
  label: string;
}

export interface VariantOption {
  id: string;
  label: string;
}

export interface DiscountFormValues {
  name: string;
  publicLabel: string;
  code: string;
  type: string;
  scope: string;
  valuePercent: string;
  valueRupees: string;
  buyQty: string;
  getQty: string;
  tiers: string;
  minOrderRupees: string;
  maxDiscountRupees: string;
  usageLimit: string;
  perCustomerLimit: string;
  stackable: boolean;
  priority: number;
  startsAt: string;
  endsAt: string;
  targetIds: string[];
}

const EMPTY_VALUES: DiscountFormValues = {
  name: '',
  publicLabel: '',
  code: '',
  type: '',
  scope: '',
  valuePercent: '',
  valueRupees: '',
  buyQty: '',
  getQty: '',
  tiers: '',
  minOrderRupees: '',
  maxDiscountRupees: '',
  usageLimit: '',
  perCustomerLimit: '',
  stackable: false,
  priority: 0,
  startsAt: '',
  endsAt: '',
  targetIds: [],
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

export function DiscountForm({
  action,
  previewAction,
  initialValues,
  brandOptions,
  categoryOptions,
  productOptions,
  comboOptions,
  variantOptions,
  submitLabel,
}: {
  action: (state: DiscountFormState, formData: FormData) => Promise<DiscountFormState>;
  previewAction: (
    formData: FormData,
    sampleLines: Array<{ variantId: string; quantity: number }>,
    settings: { shippingState?: string; paymentMethod: 'RAZORPAY' | 'COD' },
  ) => Promise<DiscountPreviewResult>;
  initialValues?: DiscountFormValues;
  brandOptions: SelectOption[];
  categoryOptions: SelectOption[];
  productOptions: SelectOption[];
  comboOptions: SelectOption[];
  variantOptions: VariantOption[];
  submitLabel: string;
}) {
  const [state, formAction, , formRef] = useFormActionKeepingInput(action, {} as DiscountFormState);
  const values = initialValues ?? EMPTY_VALUES;
  const [type, setType] = useState(values.type);
  const [scope, setScope] = useState(values.scope);

  const [sampleLines, setSampleLines] = useState<Array<{ variantId: string; quantity: number }>>(
    [],
  );
  const [pickVariant, setPickVariant] = useState('');
  const [pickQuantity, setPickQuantity] = useState(1);
  const [shippingState, setShippingState] = useState('Kerala');
  const [paymentMethod, setPaymentMethod] = useState<'RAZORPAY' | 'COD'>('RAZORPAY');
  const [previewResult, setPreviewResult] = useState<DiscountPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function addSampleLine() {
    if (!pickVariant) return;
    setSampleLines((lines) => [...lines, { variantId: pickVariant, quantity: pickQuantity }]);
    setPickVariant('');
    setPickQuantity(1);
  }

  function removeSampleLine(index: number) {
    setSampleLines((lines) => lines.filter((_, i) => i !== index));
  }

  async function runPreview() {
    if (!formRef.current) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const formData = new FormData(formRef.current);
      const result = await previewAction(formData, sampleLines, { shippingState, paymentMethod });
      setPreviewResult(result);
    } finally {
      setPreviewLoading(false);
    }
  }

  const targetOptionsByScope: Record<string, SelectOption[]> = {
    BRAND: brandOptions,
    CATEGORY: categoryOptions,
    PRODUCT: productOptions,
    COMBO: comboOptions,
  };
  const targetOptions = targetOptionsByScope[scope] ?? [];

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
        Internal name
      </label>
      <input id="name" name="name" required defaultValue={values.name} className={inputClass} />
      {state.fieldErrors?.name && <p className={fieldErrorClass}>{state.fieldErrors.name}</p>}

      <label htmlFor="publicLabel" className={`mt-6 ${labelClass}`}>
        Public label — shown on the cart line
      </label>
      <input
        id="publicLabel"
        name="publicLabel"
        defaultValue={values.publicLabel}
        className={inputClass}
      />

      <label htmlFor="code" className={`mt-6 ${labelClass}`}>
        Coupon code — blank means automatic, no code needed
      </label>
      <input
        id="code"
        name="code"
        placeholder="MONSOON10"
        defaultValue={values.code}
        className={inputClass}
      />
      {state.fieldErrors?.code && <p className={fieldErrorClass}>{state.fieldErrors.code}</p>}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className={labelClass}>
            Type
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue={values.type}
            onChange={(event) => setType(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a type
            </option>
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FIXED_AMOUNT">Fixed amount off</option>
            <option value="BUY_X_GET_Y">Buy X get Y</option>
            <option value="FREE_SHIPPING">Free shipping</option>
            <option value="TIERED_QUANTITY">Tiered quantity</option>
          </select>
          {state.fieldErrors?.type && <p className={fieldErrorClass}>{state.fieldErrors.type}</p>}
        </div>
        <div>
          <label htmlFor="scope" className={labelClass}>
            Applies to
          </label>
          <select
            id="scope"
            name="scope"
            required
            defaultValue={values.scope}
            onChange={(event) => setScope(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a scope
            </option>
            <option value="ORDER">Whole order</option>
            <option value="BRAND">Specific brands</option>
            <option value="CATEGORY">Specific categories</option>
            <option value="PRODUCT">Specific products</option>
            <option value="COMBO">Specific combos</option>
          </select>
          {state.fieldErrors?.scope && <p className={fieldErrorClass}>{state.fieldErrors.scope}</p>}
        </div>
      </div>

      {scope && scope !== 'ORDER' && (
        <div className="mt-6">
          <label htmlFor="targetIds" className={labelClass}>
            Targets — ctrl/cmd-click to select more than one
          </label>
          <select
            id="targetIds"
            name="targetIds"
            multiple
            required
            defaultValue={values.targetIds}
            className={inputClass + ' h-40'}
          >
            {targetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.targetIds && (
            <p className={fieldErrorClass}>{state.fieldErrors.targetIds}</p>
          )}
        </div>
      )}

      <div className={sectionClass}>
        {type === 'PERCENTAGE' && (
          <div>
            <label htmlFor="valuePercent" className={labelClass}>
              Percentage off
            </label>
            <input
              id="valuePercent"
              name="valuePercent"
              inputMode="decimal"
              placeholder="10"
              defaultValue={values.valuePercent}
              className={inputClass}
            />
          </div>
        )}

        {type === 'FIXED_AMOUNT' && (
          <div>
            <label htmlFor="valueRupees" className={labelClass}>
              Amount off (₹)
            </label>
            <input
              id="valueRupees"
              name="valueRupees"
              inputMode="decimal"
              placeholder="100.00"
              defaultValue={values.valueRupees}
              className={inputClass}
            />
          </div>
        )}

        {type === 'BUY_X_GET_Y' && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="buyQty" className={labelClass}>
                Buy quantity
              </label>
              <input
                id="buyQty"
                name="buyQty"
                inputMode="numeric"
                defaultValue={values.buyQty}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="getQty" className={labelClass}>
                Get quantity free
              </label>
              <input
                id="getQty"
                name="getQty"
                inputMode="numeric"
                defaultValue={values.getQty}
                className={inputClass}
              />
            </div>
          </div>
        )}

        {type === 'TIERED_QUANTITY' && (
          <div>
            <label htmlFor="tiers" className={labelClass}>
              Tiers — one per line, as &quot;minimum quantity:percent off&quot;
            </label>
            <textarea
              id="tiers"
              name="tiers"
              rows={3}
              placeholder="3:10&#10;5:15&#10;10:20"
              defaultValue={values.tiers}
              className={inputClass}
            />
          </div>
        )}

        {type === 'FREE_SHIPPING' && (
          <p className="type-body text-ink-soft">No additional value needed for free shipping.</p>
        )}
      </div>

      <div className={sectionClass}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="minOrderRupees" className={labelClass}>
              Minimum order (₹)
            </label>
            <input
              id="minOrderRupees"
              name="minOrderRupees"
              inputMode="decimal"
              defaultValue={values.minOrderRupees}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="maxDiscountRupees" className={labelClass}>
              Maximum discount cap (₹)
            </label>
            <input
              id="maxDiscountRupees"
              name="maxDiscountRupees"
              inputMode="decimal"
              defaultValue={values.maxDiscountRupees}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="usageLimit" className={labelClass}>
              Total usage limit
            </label>
            <input
              id="usageLimit"
              name="usageLimit"
              inputMode="numeric"
              defaultValue={values.usageLimit}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="perCustomerLimit" className={labelClass}>
              Per-customer limit
            </label>
            <input
              id="perCustomerLimit"
              name="perCustomerLimit"
              inputMode="numeric"
              defaultValue={values.perCustomerLimit}
              className={inputClass}
            />
          </div>
        </div>

        <label className="mt-6 flex items-center gap-3 type-body">
          <input type="checkbox" name="stackable" defaultChecked={values.stackable} />
          Stackable with other discounts
        </label>

        <label htmlFor="priority" className={`mt-6 ${labelClass}`}>
          Priority — higher applies first when discounts compete
        </label>
        <input
          id="priority"
          name="priority"
          type="number"
          min={0}
          max={9999}
          defaultValue={values.priority}
          className={inputClass}
        />
      </div>

      <div className={sectionClass}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className={labelClass}>
              Starts — blank means now
            </label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={values.startsAt}
              className={inputClass}
            />
            {state.fieldErrors?.startsAt && (
              <p className={fieldErrorClass}>{state.fieldErrors.startsAt}</p>
            )}
          </div>
          <div>
            <label htmlFor="endsAt" className={labelClass}>
              Ends — blank means no end date
            </label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              defaultValue={values.endsAt}
              className={inputClass}
            />
            {state.fieldErrors?.endsAt && (
              <p className={fieldErrorClass}>{state.fieldErrors.endsAt}</p>
            )}
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="type-caption text-ink-soft">
          Sample cart preview — checks the fields above against a cart you build here,
          without saving anything
        </p>

        {sampleLines.length > 0 && (
          <ul className="mt-4 space-y-2">
            {sampleLines.map((line, index) => {
              const option = variantOptions.find((v) => v.id === line.variantId);
              return (
                <li
                  key={`${line.variantId}-${index}`}
                  className="flex items-center justify-between gap-4 type-body"
                >
                  <span>
                    {option?.label ?? line.variantId} × {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSampleLine(index)}
                    className="type-caption normal-case text-ink-soft underline"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[16rem]">
            <label htmlFor="pickVariant" className={labelClass}>
              Add a variant
            </label>
            <select
              id="pickVariant"
              value={pickVariant}
              onChange={(event) => setPickVariant(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose a variant</option>
              {variantOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label htmlFor="pickQuantity" className={labelClass}>
              Qty
            </label>
            <input
              id="pickQuantity"
              type="number"
              min={1}
              max={999}
              value={pickQuantity}
              onChange={(event) => setPickQuantity(Number(event.target.value) || 1)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={addSampleLine}
            disabled={!pickVariant}
            className="rounded-control border border-line px-4 py-3 type-body disabled:opacity-50"
          >
            Add
          </button>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="previewShippingState" className={labelClass}>
              Delivery state
            </label>
            <input
              id="previewShippingState"
              value={shippingState}
              onChange={(event) => setShippingState(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="previewPaymentMethod" className={labelClass}>
              Payment method
            </label>
            <select
              id="previewPaymentMethod"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as 'RAZORPAY' | 'COD')}
              className={inputClass}
            >
              <option value="RAZORPAY">Razorpay</option>
              <option value="COD">Cash on delivery</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={runPreview}
          disabled={previewLoading || sampleLines.length === 0}
          className="mt-6 rounded-control border border-signal px-6 py-3 type-body font-medium text-signal disabled:opacity-50"
        >
          {previewLoading ? 'Checking…' : 'Preview against this cart'}
        </button>

        {previewResult && (
          <div className="mt-6 rounded-card border border-line p-6">
            {previewResult.ok ? (
              <>
                <p className="type-body">
                  {previewResult.result.appliedDiscounts.length > 0
                    ? 'This discount would apply.'
                    : 'This discount would not apply to this cart — check the dates, minimum order, and targets above.'}
                </p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="type-caption text-ink-soft">Subtotal</dt>
                    <dd className="mt-1 type-mono" data-price>
                      {formatINR(previewResult.result.subtotalPaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-caption text-ink-soft">Discount</dt>
                    <dd className="mt-1 type-mono" data-price>
                      −{formatINR(previewResult.result.discountPaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-caption text-ink-soft">Shipping</dt>
                    <dd className="mt-1 type-mono" data-price>
                      {formatINR(previewResult.result.shippingPaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-caption text-ink-soft">Total</dt>
                    <dd className="mt-1 type-mono" data-price>
                      {formatINR(previewResult.result.totalPaise)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p role="alert" className="type-body text-warning">
                {previewResult.error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
