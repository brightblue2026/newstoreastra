'use client';

import Link from '@/components/Link';
import { useActionState, useState } from 'react';
import { MAX_IMPORT_BYTES } from '@/lib/retailer';
import type { ImportState } from '../actions';

export function ImportForm({
  action,
}: {
  action: (state: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ImportState);
  // A courtesy check only — the server re-checks size and everything else.
  const [tooLarge, setTooLarge] = useState(false);

  return (
    <div className="mt-10 max-w-2xl">
      <form action={formAction} className="flex flex-wrap items-end gap-4">
        <div className="max-w-full min-w-0">
          <label htmlFor="file" className="block type-caption text-ink-soft">
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            aria-describedby={tooLarge ? 'file-error' : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setTooLarge(Boolean(file && file.size > MAX_IMPORT_BYTES));
            }}
            className="mt-2 block max-w-full type-body"
          />
        </div>
        <button
          type="submit"
          disabled={pending || tooLarge}
          className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Importing' : 'Import'}
        </button>
      </form>

      {tooLarge && (
        <p id="file-error" className="mt-3 type-caption normal-case text-warning">
          That file is too large. Split it into files of under 500 KB each.
        </p>
      )}

      {state.errors && state.errors.length > 0 && (
        <div
          role="alert"
          className="mt-8 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          <p>Nothing was imported.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {state.summary && (
        <div role="status" className="mt-8 rounded-control border border-line px-4 py-3 type-body">
          <p>
            Import finished: {state.summary.created} added, {state.summary.updated} updated,{' '}
            {state.summary.unchanged} already up to date.
          </p>
          {state.summary.duplicatesMerged > 0 && (
            <p className="mt-2 text-ink-soft">
              {state.summary.duplicatesMerged}{' '}
              {state.summary.duplicatesMerged === 1 ? 'shop was' : 'shops were'} listed more than
              once in the file; the lowest row was used.
            </p>
          )}
          <Link href="/admin/retailers" className="mt-3 inline-block text-signal">
            View retailers
          </Link>
        </div>
      )}
    </div>
  );
}
