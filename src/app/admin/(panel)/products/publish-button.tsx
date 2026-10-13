'use client';

import { useFormStatus } from 'react-dom';

/**
 * The submit button of a publish / unpublish form. A client component only for
 * the pending state: the round trip takes a second or two, and a button that
 * looks unchanged for that long gets pressed again.
 */
export function PublishButton({ isActive, all = false }: { isActive: boolean; all?: boolean }) {
  const { pending } = useFormStatus();
  // `all` is the same button acting on every variant of a product at once.
  const suffix = all ? ' all' : '';

  if (isActive) {
    return (
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-line px-4 py-2 type-body text-ink hover:bg-sky disabled:opacity-60"
      >
        {pending ? 'Unpublishing…' : `Unpublish${suffix}`}
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-signal px-4 py-2 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Publishing…' : `Publish${suffix}`}
    </button>
  );
}
