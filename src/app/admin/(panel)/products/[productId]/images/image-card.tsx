'use client';

import Image from 'next/image';
import { useTransition } from 'react';
import { deleteProductImageAction, moveProductImageAction } from './actions';

/*
  One image's controls, split into a client component because reordering and
  deleting both need pending state — a no-JS `<form action={...}>` works, but
  gives no feedback while the advisory-locked swap round-trips, and a delete
  with no confirmation step is one misclick away from an irreversible
  the stored object being removed (`safeRemove` in actions.ts).
*/
export function ImageCard({
  productId,
  image,
  isCover,
  isFirst,
  isLast,
  variantPhoto,
}: {
  productId: string;
  image: { id: string; url: string; alt: string };
  isCover: boolean;
  isFirst: boolean;
  isLast: boolean;
  /**
   * Set on a variant's own page. Such a photo has no order to change, and
   * deleting it takes it off this variant only. `alsoShownFor` names the other
   * variants sharing the same picture, if any.
   */
  variantPhoto?: { alsoShownFor: string | null };
}) {
  const [isPending, startTransition] = useTransition();

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveProductImageAction(productId, image.id, direction);
    });
  }

  function remove() {
    // `window.confirm` blocks the JS thread for as long as the native dialog
    // is open, and starting the transition immediately after it returns —
    // still inside the same click handler — drops the refresh: the delete
    // commits (confirmed against the database), but React never repaints the
    // grid without a manual reload. A `setTimeout` of 0 lets the browser
    // finish unwinding the dialog's own event handling first, so the
    // transition starts in a clean task instead of the one `confirm` just
    // suspended.
    const question = variantPhoto
      ? variantPhoto.alsoShownFor
        ? 'Remove this photo from this variant? The other variants keep it.'
        : 'Delete this photo from this variant? This cannot be undone.'
      : 'Delete this image? This cannot be undone.';
    if (!window.confirm(question)) return;
    setTimeout(() => {
      startTransition(async () => {
        await deleteProductImageAction(productId, image.id);
      });
    }, 0);
  }

  return (
    <div className="rounded-card border border-line p-3" aria-busy={isPending}>
      <div className="relative aspect-square w-full overflow-hidden rounded-control bg-paper">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          className="object-cover"
        />
        {isCover && (
          <span className="absolute left-2 top-2 rounded-control bg-ink px-2 py-1 type-caption text-paper">
            Cover image
          </span>
        )}
      </div>

      <p className="mt-2 type-caption text-ink-soft">{image.alt}</p>
      {variantPhoto?.alsoShownFor && (
        <p className="mt-1 type-caption normal-case text-ink-soft">
          Also used for {variantPhoto.alsoShownFor}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <div className={variantPhoto ? 'hidden' : 'flex gap-1'}>
          <button
            type="button"
            onClick={() => move('up')}
            disabled={isFirst || isPending}
            aria-label="Move earlier"
            title="Move earlier"
            className="rounded-control px-2 py-1 type-body text-ink-soft hover:bg-sky disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move('down')}
            disabled={isLast || isPending}
            aria-label="Move later"
            title="Move later"
            className="rounded-control px-2 py-1 type-body text-ink-soft hover:bg-sky disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="type-caption text-warning underline disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
