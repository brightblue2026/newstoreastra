'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignAwbAndShip,
  fetchLabel,
  pushToShiprocket,
  recordManualAwb,
} from '@/server/actions/fulfilment';

/**
 * The three Shiprocket buttons plus the manual-AWB fallback — none of this
 * existed as a UI before now; the server actions were built in Phase 6 but
 * never wired to anything (`PROGRESS.md`, "no admin UI for the fulfilment
 * actions"). Each action already takes a single object rather than
 * `(prevState, formData)`, matching how `discount-form.tsx`'s preview action
 * is called directly rather than through `useActionState` — so this follows
 * the same pattern: manual `useState` for the pending/result of each button,
 * calling the server action straight from the click handler.
 */

const buttonClass =
  'rounded-control border border-line px-4 py-2 type-body disabled:opacity-60';
const primaryButtonClass =
  'rounded-control bg-signal px-4 py-2 type-body font-medium text-white disabled:opacity-60';
const inputClass = 'rounded-control border border-line bg-white px-3 py-2 type-body';

export default function FulfilmentActions({
  orderId,
  shiprocketShipmentId,
  awbNumber,
  courierName,
  trackingUrl,
  labelUrl,
}: {
  orderId: string;
  shiprocketShipmentId: string | null;
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [manualAwb, setManualAwb] = useState('');
  const [manualCourier, setManualCourier] = useState('');
  const [labelHref, setLabelHref] = useState(labelUrl);

  async function run(name: string, action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(name);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ text: result.ok ? (result.message ?? 'Done.') : (result.error ?? 'Something went wrong.'), error: !result.ok });
      if (result.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handlePrintLabel() {
    setPending('label');
    setMessage(null);
    try {
      const result = await fetchLabel({ orderId });
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
      } else if (result.url) {
        setLabelHref(result.url);
        setMessage({ text: 'Label ready.', error: false });
      } else {
        setMessage({ text: 'Could not fetch the label.', error: true });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-6 rounded-card border border-line p-6">
      <h3 className="type-subhead">Shiprocket</h3>

      <dl className="mt-3 grid gap-2 type-caption text-ink-soft">
        <div>Shipment: {shiprocketShipmentId ?? 'Not pushed yet'}</div>
        <div>
          AWB: {awbNumber ?? 'Not assigned'}
          {courierName ? ` · ${courierName}` : ''}
        </div>
        {trackingUrl && (
          <div>
            <a href={trackingUrl} target="_blank" rel="noreferrer" className="underline">
              Track this shipment
            </a>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {!shiprocketShipmentId && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('push', () => pushToShiprocket({ orderId }))}
            className={primaryButtonClass}
          >
            {pending === 'push' ? 'Pushing…' : 'Push to Shiprocket'}
          </button>
        )}

        {shiprocketShipmentId && !awbNumber && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('awb', () => assignAwbAndShip({ orderId }))}
            className={primaryButtonClass}
          >
            {pending === 'awb' ? 'Assigning…' : 'Assign AWB & ship'}
          </button>
        )}

        {shiprocketShipmentId && awbNumber && !labelHref && (
          <button type="button" disabled={pending !== null} onClick={handlePrintLabel} className={buttonClass}>
            {pending === 'label' ? 'Fetching…' : 'Get label'}
          </button>
        )}

        {labelHref && (
          <a href={labelHref} target="_blank" rel="noreferrer" className={buttonClass}>
            Open label
          </a>
        )}
      </div>

      {!awbNumber && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="type-caption text-ink-soft">
            Or enter an AWB by hand — BBTC already ships some orders with DTDC directly, without
            going through Shiprocket.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="manualCourier" className="block type-caption text-ink-soft">
                Courier
              </label>
              <input
                id="manualCourier"
                value={manualCourier}
                onChange={(event) => setManualCourier(event.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="manualAwb" className="block type-caption text-ink-soft">
                AWB / tracking number
              </label>
              <input
                id="manualAwb"
                value={manualAwb}
                onChange={(event) => setManualAwb(event.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <button
              type="button"
              disabled={pending !== null || !manualAwb.trim() || !manualCourier.trim()}
              onClick={() =>
                run('manual', () =>
                  recordManualAwb({ orderId, awbNumber: manualAwb.trim(), courierName: manualCourier.trim() }),
                )
              }
              className={buttonClass}
            >
              {pending === 'manual' ? 'Recording…' : 'Record AWB'}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`mt-4 type-caption ${message.error ? 'text-warning' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
