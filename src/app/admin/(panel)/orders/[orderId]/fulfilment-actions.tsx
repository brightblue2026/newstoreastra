'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  bookPickup,
  cancelInShiprocket,
  fetchLabel,
  pushToShiprocket,
  recordManualAwb,
  shipWithShiprocket,
} from '@/server/actions/fulfilment';

/**
 * Shiprocket on the order page: one Ship button that runs every remaining
 * step (create shipment → AWB → pickup and manifest → label) and resumes from
 * whichever one failed, the single-step retries, a cancel for test orders, and
 * the manual-AWB fallback. Each action takes a single object rather than
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
  manifestUrl,
  pickupRequested,
  shiprocketError,
  delivered,
}: {
  orderId: string;
  shiprocketShipmentId: string | null;
  awbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
  pickupRequested: boolean;
  shiprocketError: string | null;
  delivered: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [manualAwb, setManualAwb] = useState('');
  const [manualCourier, setManualCourier] = useState('');
  const [labelHref, setLabelHref] = useState(labelUrl);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Everything done: shipped, pickup booked, manifest and label in hand.
  const complete = Boolean(awbNumber && pickupRequested && manifestUrl && labelHref);

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

  async function handleShip() {
    setPending('ship');
    setMessage(null);
    try {
      const result = await shipWithShiprocket({ orderId });
      if (result.ok) {
        if (result.labelUrl) setLabelHref(result.labelUrl);
        setMessage({ text: result.message, error: false });
      } else {
        setMessage({ text: result.error, error: true });
      }
      // Earlier steps may have succeeded even when a later one failed.
      router.refresh();
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

      {shiprocketError && !shiprocketShipmentId && (
        <p role="alert" className="mt-3 type-caption text-warning">
          Not yet in Shiprocket. {shiprocketError}
        </p>
      )}

      <dl className="mt-3 grid gap-2 type-caption text-ink-soft">
        <div>Shipment: {shiprocketShipmentId ?? 'Not in Shiprocket yet'}</div>
        <div>
          AWB: {awbNumber ?? 'Not assigned'}
          {courierName ? ` · ${courierName}` : ''}
        </div>
        {awbNumber && shiprocketShipmentId && (
          <div>Pickup: {pickupRequested ? 'Booked' : 'Not booked'}</div>
        )}
        {trackingUrl && (
          <div>
            <a href={trackingUrl} target="_blank" rel="noreferrer" className="underline">
              Track this shipment
            </a>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {/* A hand-entered AWB (no shipment) has nothing left for Shiprocket to do. */}
        {!complete && !delivered && (!awbNumber || shiprocketShipmentId) && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={handleShip}
            className={primaryButtonClass}
          >
            {pending === 'ship' ? 'Shipping…' : awbNumber ? 'Finish shipping' : 'Ship'}
          </button>
        )}

        {!shiprocketShipmentId && !awbNumber && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('push', () => pushToShiprocket({ orderId }))}
            className={buttonClass}
          >
            {pending === 'push' ? 'Sending…' : 'Only create in Shiprocket'}
          </button>
        )}

        {shiprocketShipmentId && awbNumber && !pickupRequested && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => run('pickup', () => bookPickup({ orderId }))}
            className={buttonClass}
          >
            {pending === 'pickup' ? 'Booking…' : 'Book pickup'}
          </button>
        )}

        {shiprocketShipmentId && awbNumber && !labelHref && (
          <button type="button" disabled={pending !== null} onClick={handlePrintLabel} className={buttonClass}>
            {pending === 'label' ? 'Fetching…' : 'Get label'}
          </button>
        )}

        {labelHref && (
          <a href={labelHref} target="_blank" rel="noreferrer" className={buttonClass}>
            Print label
          </a>
        )}

        {manifestUrl && (
          <a href={manifestUrl} target="_blank" rel="noreferrer" className={buttonClass}>
            Print manifest
          </a>
        )}
      </div>

      {!awbNumber && (
        <p className="mt-3 type-caption text-ink-soft">
          Ship assigns a courier, which charges the Shiprocket wallet, and sends the customer
          their tracking number.
        </p>
      )}

      {shiprocketShipmentId && !delivered && (
        <div className="mt-4">
          {confirmCancel ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-caption">
                Cancel shipment {shiprocketShipmentId} in Shiprocket? The courier will not collect
                it. The order itself stays as it is.
              </span>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => {
                  setConfirmCancel(false);
                  void run('cancel', () => cancelInShiprocket({ orderId }));
                }}
                className={buttonClass}
              >
                {pending === 'cancel' ? 'Cancelling…' : 'Yes, cancel in Shiprocket'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="type-caption underline"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => setConfirmCancel(true)}
              className="type-caption text-ink-soft underline"
            >
              Cancel in Shiprocket
            </button>
          )}
        </div>
      )}

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
