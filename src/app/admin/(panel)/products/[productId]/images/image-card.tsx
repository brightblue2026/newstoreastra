'use client';

import Image from 'next/image';
import { useId, useRef, useState, useTransition } from 'react';
import {
  deleteProductImageAction,
  makeImageFirstAction,
  moveProductImageAction,
  setImageVariantsAction,
  updateImageAltAction,
} from './actions';
import {
  deleteQuestion,
  deleteWarning,
  picturesLeftAfter,
  rowsOfSamePicture,
  type PhotoRow,
} from './delete-consequence';
import { checkPhotoFile, replacePhoto } from './send-photo';

/*
  One saved photo and everything that can be done to it, in place: look at it
  full size, fix its description, put it first, move it, swap the picture for
  a better one, choose which variants show it, and delete it.

  Nothing here uses the browser's own confirm box. A delete opens a question
  inside the card that says what will happen — including when it would leave a
  product that is on the store with no photo — because a delete cannot be
  undone.
*/

export interface PhotoCardData {
  id: string;
  url: string;
  alt: string;
  publicId: string;
  /** Every place this picture is shown in the product. */
  usedFor: { general: boolean; variantIds: string[] };
}

export interface VariantOption {
  id: string;
  label: string;
  /** The variant's name ("Lemon"), which groups the sizes of one fragrance. */
  group: string | null;
}

type Panel = 'describe' | 'usedFor' | 'delete' | null;

const BUTTON =
  'rounded-control px-2 py-1 type-caption normal-case text-ink hover:bg-sky disabled:opacity-30 disabled:hover:bg-transparent';

export function ImageCard({
  productId,
  productIsActive,
  photo,
  position,
  isFirst,
  isLast,
  hereVariantId,
  allRows,
  variants,
  selecting,
  selected,
  onToggleSelect,
  announce,
}: {
  productId: string;
  productIsActive: boolean;
  photo: PhotoCardData;
  /** "Cover image" or "Shown first", on the first card only. */
  position: string | null;
  isFirst: boolean;
  isLast: boolean;
  /** The variant whose page this is; null on the product's own Photos page. */
  hereVariantId: string | null;
  /** Every photo row of the product, to work out what a delete leaves. */
  allRows: PhotoRow[];
  variants: VariantOption[];
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  /** Says a finished change out loud, above the grid. */
  announce: (text: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const busy = isPending || replacing !== null;

  const labelOf = new Map(variants.map((variant) => [variant.id, variant.label]));
  const elsewhere = [
    ...(photo.usedFor.general && hereVariantId !== null ? ['the product as a whole'] : []),
    ...photo.usedFor.variantIds
      .filter((variantId) => variantId !== hereVariantId)
      .map((variantId) => labelOf.get(variantId) ?? 'a removed variant'),
  ];

  function run(work: () => Promise<{ ok: boolean; error?: string } | void>, done: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (result && !result.ok) {
          setError(result.error ?? 'That did not work. Try again.');
          return;
        }
        setPanel(null);
        announce(done);
      } catch {
        setError('No answer from the server. Check the connection and try again.');
      }
    });
  }

  async function replace(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const refusal = checkPhotoFile(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setReplacing('Uploading…');
    const result = await replacePhoto({
      productId,
      imageId: photo.id,
      file,
      onProgress: (percent) => setReplacing(percent < 100 ? `Uploading… ${percent}%` : 'Saving…'),
    });
    setReplacing(null);
    if (result.ok) announce('Photo replaced. It kept its place, description and variants.');
    else setError(result.message);
  }

  return (
    <div
      className={`rounded-card border p-3 ${selected ? 'border-signal' : 'border-line'}`}
      aria-busy={busy}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-control bg-paper">
        {selecting ? (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={selected}
            aria-label={selected ? `Deselect ${photo.alt}` : `Select ${photo.alt}`}
            className="absolute inset-0"
          >
            <Image src={photo.url} alt={photo.alt} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
          </button>
        ) : (
          <a href={photo.url} target="_blank" rel="noreferrer" title="View full size" className="absolute inset-0">
            <Image src={photo.url} alt={photo.alt} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
          </a>
        )}
        {position && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-control bg-ink px-2 py-1 type-caption text-paper">
            {position}
          </span>
        )}
        {selecting && (
          <span
            aria-hidden
            className={`pointer-events-none absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-control border-2 ${
              selected ? 'border-signal bg-signal text-white' : 'border-ink bg-paper'
            }`}
          >
            {selected ? '✓' : ''}
          </span>
        )}
      </div>

      <p className="mt-2 type-caption normal-case text-ink">{photo.alt}</p>
      {elsewhere.length > 0 && (
        <p className="mt-1 type-caption normal-case text-ink-soft">
          Also used for{' '}
          {elsewhere.length <= 3
            ? elsewhere.join(', ')
            : `${elsewhere.slice(0, 2).join(', ')} and ${elsewhere.length - 2} more`}
        </p>
      )}

      {!selecting && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
            {!isFirst && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => makeImageFirstAction(productId, photo.id),
                    hereVariantId ? 'Now shown first for this variant.' : 'Now the cover image.',
                  )
                }
                className={BUTTON}
              >
                {hereVariantId ? 'Show first' : 'Make cover'}
              </button>
            )}
            <button
              type="button"
              onClick={() => run(() => moveProductImageAction(productId, photo.id, 'up'), 'Moved earlier.')}
              disabled={isFirst || busy}
              aria-label="Move earlier"
              title="Move earlier"
              className={BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => run(() => moveProductImageAction(productId, photo.id, 'down'), 'Moved later.')}
              disabled={isLast || busy}
              aria-label="Move later"
              title="Move later"
              className={BUTTON}
            >
              ↓
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPanel(panel === 'describe' ? null : 'describe')}
              aria-expanded={panel === 'describe'}
              className={BUTTON}
            >
              Edit description
            </button>
            <label
              htmlFor={fileId}
              className={`${BUTTON} ${busy ? 'opacity-30' : 'cursor-pointer'} focus-within:outline-2 focus-within:outline-signal`}
            >
              {replacing ?? 'Replace photo'}
              <input
                id={fileId}
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                disabled={busy}
                onChange={(event) => void replace(event.target.files?.[0])}
                className="sr-only"
              />
            </label>
            {variants.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPanel(panel === 'usedFor' ? null : 'usedFor')}
                aria-expanded={panel === 'usedFor'}
                className={BUTTON}
              >
                Used for…
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setPanel(panel === 'delete' ? null : 'delete')}
              aria-expanded={panel === 'delete'}
              className={`${BUTTON} text-warning`}
            >
              Delete
            </button>
          </div>

          {panel === 'describe' && (
            <DescribePanel
              initial={photo.alt}
              shared={elsewhere.length > 0}
              busy={busy}
              onCancel={() => setPanel(null)}
              onSave={(alt) => run(() => updateImageAltAction(productId, photo.id, alt), 'Description updated.')}
            />
          )}
          {panel === 'usedFor' && (
            <UsedForPanel
              usedFor={photo.usedFor}
              variants={variants}
              busy={busy}
              onCancel={() => setPanel(null)}
              onSave={(usage) =>
                run(() => setImageVariantsAction(productId, photo.id, usage), 'Saved where this photo is used.')
              }
            />
          )}
          {panel === 'delete' && (
            <DeletePanel
              rowId={photo.id}
              allRows={allRows}
              productIsActive={productIsActive}
              busy={busy}
              onCancel={() => setPanel(null)}
              onDelete={(scope) =>
                run(
                  () => deleteProductImageAction(productId, photo.id, scope),
                  scope === 'everywhere' ? 'Photo deleted everywhere it was used.' : 'Photo deleted.',
                )
              }
            />
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 type-caption normal-case text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

function DescribePanel({
  initial,
  shared,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  shared: boolean;
  busy: boolean;
  onSave: (alt: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const id = useId();
  return (
    <form
      className="mt-2 rounded-control border border-line p-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <label htmlFor={id} className="type-caption normal-case text-ink">
        Description
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={200}
        autoFocus
        className="mt-1 w-full rounded-control border border-line px-2 py-1 type-body"
      />
      <p className="mt-1 type-caption normal-case text-ink-soft">
        Says what the photo shows, for search engines and screen readers.
        {shared && ' Changes it everywhere this photo is used.'}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={busy || value.trim() === '' || value.trim() === initial}
          className="rounded-control bg-signal px-3 py-1 type-caption normal-case text-white disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function UsedForPanel({
  usedFor,
  variants,
  busy,
  onSave,
  onCancel,
}: {
  usedFor: { general: boolean; variantIds: string[] };
  variants: VariantOption[];
  busy: boolean;
  onSave: (usage: { general: boolean; variantIds: string[] }) => void;
  onCancel: () => void;
}) {
  const [general, setGeneral] = useState(usedFor.general);
  const [chosen, setChosen] = useState(() => new Set(usedFor.variantIds));

  const groups = new Map<string, VariantOption[]>();
  for (const variant of variants) {
    const key = variant.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }

  const toggle = (ids: string[], on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const nothing = !general && chosen.size === 0;

  return (
    <fieldset className="mt-2 max-h-80 overflow-y-auto rounded-control border border-line p-2">
      <legend className="px-1 type-caption normal-case text-ink">Show this photo for</legend>
      <label className="flex items-center gap-2 py-1 type-caption normal-case">
        <input type="checkbox" checked={general} onChange={(event) => setGeneral(event.target.checked)} />
        The product as a whole
      </label>
      {[...groups.entries()].map(([group, members]) => {
        const ids = members.map((member) => member.id);
        const all = ids.every((id) => chosen.has(id));
        return (
          <div key={group || 'ungrouped'} className="mt-1 border-t border-line pt-1">
            {group && members.length > 1 && (
              <label className="flex items-center gap-2 py-1 type-caption normal-case font-medium">
                <input type="checkbox" checked={all} onChange={(event) => toggle(ids, event.target.checked)} />
                All {group}
              </label>
            )}
            {members.map((member) => (
              <label
                key={member.id}
                className={`flex items-center gap-2 py-1 type-caption normal-case ${group && members.length > 1 ? 'pl-5' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(member.id)}
                  onChange={(event) => toggle([member.id], event.target.checked)}
                />
                {member.label}
              </label>
            ))}
          </div>
        );
      })}
      {nothing && (
        <p className="mt-1 type-caption normal-case text-warning">
          Tick at least one. To take the photo off everything, delete it instead.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || nothing}
          onClick={() => onSave({ general, variantIds: [...chosen] })}
          className="rounded-control bg-signal px-3 py-1 type-caption normal-case text-white disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}

function DeletePanel({
  rowId,
  allRows,
  productIsActive,
  busy,
  onDelete,
  onCancel,
}: {
  rowId: string;
  allRows: PhotoRow[];
  productIsActive: boolean;
  busy: boolean;
  onDelete: (scope: 'this' | 'everywhere') => void;
  onCancel: () => void;
}) {
  const sameRows = rowsOfSamePicture(allRows, rowId);
  const usedByOthers = Math.max(0, sameRows.length - 1);
  // The warning for the furthest-reaching choice offered.
  const warning = deleteWarning({
    productIsActive,
    picturesLeft: picturesLeftAfter(allRows, usedByOthers > 0 ? sameRows : [rowId]),
  });

  return (
    <div role="alertdialog" aria-label="Delete photo" className="mt-2 rounded-control border border-warning p-2">
      <p className="type-caption normal-case text-ink">
        {deleteQuestion({ count: 1, scope: usedByOthers > 0 ? 'this' : 'everywhere', usedByOthers })}
      </p>
      {warning && (
        <p className="mt-1 type-caption normal-case text-warning">
          {usedByOthers > 0 ? `Deleting everywhere: ${warning}` : warning}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete('this')}
          className="rounded-control bg-warning px-3 py-1 type-caption normal-case text-white disabled:opacity-40"
        >
          {usedByOthers > 0 ? 'Take off here only' : 'Delete'}
        </button>
        {usedByOthers > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete('everywhere')}
            className="rounded-control border border-warning px-3 py-1 type-caption normal-case text-warning disabled:opacity-40"
          >
            Delete everywhere ({sameRows.length})
          </button>
        )}
        <button type="button" onClick={onCancel} className={BUTTON}>
          Keep it
        </button>
      </div>
    </div>
  );
}
