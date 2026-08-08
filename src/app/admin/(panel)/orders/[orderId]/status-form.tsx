'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/order-status';
import { transitionOrderAction, type OrderActionState } from '../actions';

/**
 * The fulfilment buttons.
 *
 * Only the transitions the state machine allows a member of staff to make are
 * rendered — and the server checks the same rule again, so a hand-crafted POST
 * gains nothing. Notably absent for an unpaid order: any way to confirm it. That
 * belongs to the Razorpay webhook (§10), and an order sitting in "awaiting
 * payment" can only be cancelled from here.
 */
export default function StatusForm({
  orderId,
  transitions,
}: {
  orderId: string;
  transitions: OrderStatus[];
}) {
  const [state, action] = useActionState<OrderActionState, FormData>(transitionOrderAction, {});

  if (transitions.length === 0) {
    return (
      <p className="type-caption text-ink-soft">
        This order has reached the end of its lifecycle. Nothing further to do.
      </p>
    );
  }

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="orderId" value={orderId} />
        {transitions.map((to) => (
          <TransitionButton key={to} to={to} />
        ))}
      </form>

      {state.error && (
        <p role="alert" className="mt-3 type-caption text-warning">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="mt-3 type-caption text-success">
          {state.saved}
        </p>
      )}
    </div>
  );
}

/** Destructive-sounding moves are outlined; the forward step is the filled one. */
function TransitionButton({ to }: { to: OrderStatus }) {
  const { pending } = useFormStatus();
  const cautious = to === 'CANCELLED' || to === 'RETURNED' || to === 'REFUNDED';

  return (
    <button
      type="submit"
      name="to"
      value={to}
      disabled={pending}
      className={
        cautious
          ? 'rounded-control border border-line px-4 py-2 type-body text-ink-soft disabled:opacity-60'
          : 'rounded-control bg-signal px-4 py-2 type-body font-medium text-white disabled:opacity-60'
      }
    >
      {pending ? 'Saving' : `Mark ${ORDER_STATUS_LABELS[to].toLowerCase()}`}
    </button>
  );
}
