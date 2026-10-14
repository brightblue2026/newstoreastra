'use client';

import { useState, useTransition } from 'react';
import { deleteProductImagesAction } from './actions';
import { deleteQuestion, deleteWarning, picturesLeftAfter, type PhotoRow } from './delete-consequence';
import { ImageCard, type PhotoCardData, type VariantOption } from './image-card';

/*
  The saved photos of one product, or of one variant, with a "Select" mode
  for deleting several at once. Every finished change is said in one place
  above the grid, so the result stays readable even after a card disappears.
*/
export function PhotoGrid({
  productId,
  productIsActive,
  photos,
  hereVariantId,
  allRows,
  variants,
}: {
  productId: string;
  productIsActive: boolean;
  /** In display order: the first is the cover, or the variant's lead photo. */
  photos: PhotoCardData[];
  hereVariantId: string | null;
  allRows: PhotoRow[];
  variants: VariantOption[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Selections of photos deleted meanwhile drop out by themselves.
  const live = new Set(photos.map((photo) => photo.id));
  const chosen = [...selected].filter((id) => live.has(id));

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setConfirming(false);
    setBulkError(null);
  }

  function toggle(id: string) {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteChosen() {
    setBulkError(null);
    startTransition(async () => {
      try {
        const result = await deleteProductImagesAction(productId, chosen);
        if (!result.ok) {
          setBulkError(result.error ?? 'Those photos could not be deleted. Try again.');
          return;
        }
        setMessage(chosen.length === 1 ? 'Photo deleted.' : `${chosen.length} photos deleted.`);
        stopSelecting();
      } catch {
        setBulkError('No answer from the server. Check the connection and try again.');
      }
    });
  }

  const warning = deleteWarning({ productIsActive, picturesLeft: picturesLeftAfter(allRows, chosen) });
  const position = hereVariantId ? 'Shown first' : 'Cover image';

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="type-body text-success">
          {message}
        </p>
        {photos.length > 1 &&
          (selecting ? (
            <button type="button" onClick={stopSelecting} className="type-body text-signal underline">
              Done selecting
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setSelecting(true);
              }}
              className="type-body text-signal underline"
            >
              Select several
            </button>
          ))}
      </div>

      {selecting && (
        <div className="sticky top-0 z-10 mt-3 rounded-card border border-line bg-paper p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="type-body">
              {chosen.length === 0
                ? 'Tap photos to select them.'
                : `${chosen.length} selected`}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(photos.map((photo) => photo.id)))}
              className="type-caption normal-case text-signal underline"
            >
              Select all
            </button>
            {chosen.length > 0 && !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-control bg-warning px-3 py-1 type-caption normal-case text-white"
              >
                Delete selected
              </button>
            )}
            <button type="button" onClick={stopSelecting} className="type-caption normal-case text-ink-soft underline">
              Cancel
            </button>
          </div>
          {confirming && chosen.length > 0 && (
            <div role="alertdialog" aria-label="Delete selected photos" className="mt-3 border-t border-line pt-3">
              <p className="type-body">{deleteQuestion({ count: chosen.length, scope: 'this', usedByOthers: 0 })}</p>
              {hereVariantId && (
                <p className="mt-1 type-caption normal-case text-ink-soft">
                  They come off this variant only. Other variants using the same photos keep them.
                </p>
              )}
              {warning && <p className="mt-1 type-caption normal-case text-warning">{warning}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={deleteChosen}
                  className="rounded-control bg-warning px-3 py-1 type-caption normal-case text-white disabled:opacity-40"
                >
                  {isPending ? 'Deleting…' : `Yes, delete ${chosen.length}`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-control px-3 py-1 type-caption normal-case text-ink hover:bg-sky"
                >
                  Keep them
                </button>
              </div>
            </div>
          )}
          {bulkError && (
            <p role="alert" className="mt-2 type-caption normal-case text-warning">
              {bulkError}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-6 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <ImageCard
            key={photo.id}
            productId={productId}
            productIsActive={productIsActive}
            photo={photo}
            position={index === 0 ? position : null}
            isFirst={index === 0}
            isLast={index === photos.length - 1}
            hereVariantId={hereVariantId}
            allRows={allRows}
            variants={variants}
            selecting={selecting}
            selected={chosen.includes(photo.id)}
            onToggleSelect={() => toggle(photo.id)}
            announce={setMessage}
          />
        ))}
      </div>
    </div>
  );
}
