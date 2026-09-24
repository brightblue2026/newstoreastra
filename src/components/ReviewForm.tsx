'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MAX_RATING, MIN_RATING } from '@/lib/reviews';
import { submitReviewAction, type ReviewFormState } from '@/server/actions/reviews';

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const errorClass = 'mt-2 type-caption normal-case text-warning';

const STARS = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MAX_RATING - i);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-8 rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Sending' : 'Send review'}
    </button>
  );
}

/**
 * Leaving a review. No account needed — requiring one for a bottle of dishwash
 * would mean almost no reviews, and the account area does not exist yet.
 *
 * The stars are real radio inputs rather than clickable glyphs, so the control
 * is keyboard-operable and announced as a group without any ARIA of its own.
 * They are listed 5 to 1 so that the highest rating is the first thing reached,
 * which is also the order they read in on screen.
 */
export function ReviewForm({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(submitReviewAction, {} as ReviewFormState);

  if (state.done) {
    return (
      <div className="rounded-card border border-line p-6">
        <p className="type-body">Thank you — your review has been sent.</p>
        <p className="mt-2 type-body text-ink-soft">
          Someone reads every review before it appears, so it will not show straight away.
        </p>
      </div>
    );
  }

  const fields = state.fields;

  return (
    <form action={formAction} className="rounded-card border border-line p-6" noValidate>
      <input type="hidden" name="productId" value={productId} />

      {state.error && (
        <p role="alert" className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning">
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className={labelClass}>Your rating</legend>
        <div className="mt-3 flex flex-wrap gap-4">
          {STARS.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2 pr-2 type-body">
              <input
                type="radio"
                name="rating"
                value={value}
                defaultChecked={fields?.rating === String(value)}
                required
              />
              <span aria-hidden>{'★'.repeat(value)}</span>
              <span className="sr-only">
                {value} out of {MAX_RATING}
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.rating && <p className={errorClass}>{state.fieldErrors.rating}</p>}
      </fieldset>

      <label htmlFor="review-name" className={`mt-6 ${labelClass}`}>
        Your name
      </label>
      <input
        id="review-name"
        name="authorName"
        defaultValue={fields?.authorName ?? ''}
        className={inputClass}
        required
      />
      {state.fieldErrors?.authorName && <p className={errorClass}>{state.fieldErrors.authorName}</p>}

      <label htmlFor="review-title" className={`mt-6 ${labelClass}`}>
        Headline <span className="normal-case">(optional)</span>
      </label>
      <input
        id="review-title"
        name="title"
        defaultValue={fields?.title ?? ''}
        placeholder="Cuts grease fast"
        className={inputClass}
      />
      {state.fieldErrors?.title && <p className={errorClass}>{state.fieldErrors.title}</p>}

      <label htmlFor="review-body" className={`mt-6 ${labelClass}`}>
        Your review
      </label>
      <textarea
        id="review-body"
        name="body"
        rows={5}
        defaultValue={fields?.body ?? ''}
        placeholder="How did you use it, and how did it go?"
        className={inputClass}
        required
      />
      {state.fieldErrors?.body && <p className={errorClass}>{state.fieldErrors.body}</p>}

      <p className="mt-4 type-caption normal-case text-ink-soft">
        Your name and review appear in the shop once approved. Nothing else is stored.
      </p>

      <SubmitButton />
    </form>
  );
}
