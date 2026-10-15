'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkPhotoFile, sendPhoto } from '../images/send-photo';

/*
  "Add photo" on a row of the variants list: choose the file and it is saved to
  that variant, with no second page and no second button. The description is
  filled in from the product and variant names — it can be changed on the
  variant's photo page, where photos are also removed.
*/
export function QuickPhotoButton({
  productId,
  variantId,
  alt,
}: {
  productId: string;
  variantId: string;
  /** "MX Three Dish Wash Liquid, Lemon · 900 ml" */
  alt: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(files: File[]) {
    if (files.length === 0) return;
    setOutcome(null);
    let saved = 0;
    let problem: string | null = null;

    for (const [index, file] of files.entries()) {
      const position = files.length > 1 ? ` ${index + 1} of ${files.length}` : '';
      const refusal = checkPhotoFile(file);
      if (refusal) {
        problem = refusal;
        continue;
      }
      setBusy(`Uploading${position}…`);
      const result = await sendPhoto({
        productId,
        file,
        alt,
        variantIds: [variantId],
        onStage: (stage) => setBusy(`${stage}${position}`),
        onProgress: (percent) =>
          setBusy(percent < 100 ? `Uploading${position}… ${percent}%` : `Saving${position}…`),
      });
      if (result.ok) saved += 1;
      else problem = result.message;
    }

    setBusy(null);
    if (inputRef.current) inputRef.current.value = '';
    if (saved > 0) router.refresh();
    setOutcome(
      problem
        ? { ok: false, text: saved > 0 ? `${saved} saved. One was not: ${problem}` : problem }
        : { ok: true, text: saved === 1 ? 'Photo saved.' : `${saved} photos saved.` },
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <label
        htmlFor={inputId}
        className={`relative rounded-control border border-line px-3 py-2 type-body text-ink focus-within:outline-2 focus-within:outline-signal ${
          busy ? 'opacity-60' : 'cursor-pointer hover:bg-sky'
        }`}
      >
        {busy ?? 'Add photo'}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          multiple
          disabled={busy !== null}
          onChange={(event) => void add(Array.from(event.target.files ?? []))}
          className="sr-only"
        />
      </label>
      <span aria-live="polite" className="max-w-48 type-caption normal-case">
        {outcome && <span className={outcome.ok ? 'text-success' : 'text-warning'}>{outcome.text}</span>}
      </span>
    </div>
  );
}
