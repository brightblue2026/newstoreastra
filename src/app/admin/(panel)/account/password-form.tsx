'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { changePasswordAction, type PasswordFormState } from './actions';

const initialState: PasswordFormState = {};

const inputClass =
  'mt-2 w-full rounded-control border border-line bg-paper px-4 py-3 type-body focus-visible:border-ink';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-8 rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Changing password' : 'Change password'}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="mt-8 max-w-md">
      {state.error && (
        <p
          role="alert"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          {state.error}
        </p>
      )}

      <label htmlFor="currentPassword" className="block type-caption text-ink-soft">
        Current password
      </label>
      <input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        className={inputClass}
      />

      <label htmlFor="newPassword" className="mt-6 block type-caption text-ink-soft">
        New password
      </label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        aria-describedby="newPassword-hint"
        className={inputClass}
      />
      <p id="newPassword-hint" className="mt-2 type-caption text-ink-soft">
        At least 12 characters. A few unrelated words are stronger than a name and a number.
      </p>

      <label htmlFor="confirmPassword" className="mt-6 block type-caption text-ink-soft">
        New password again
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        className={inputClass}
      />

      <SubmitButton />
    </form>
  );
}
