'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction, type SignInState } from './actions';

const initialState: SignInState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Signing in' : 'Sign in'}
    </button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="mt-8" noValidate>
      {state.error && (
        <p
          role="alert"
          id="sign-in-error"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          {state.error}
        </p>
      )}

      <label htmlFor="email" className="block type-caption text-ink-soft">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        aria-describedby={state.error ? 'sign-in-error' : undefined}
        className="mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body"
      />

      <label htmlFor="password" className="mt-6 block type-caption text-ink-soft">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        aria-describedby={state.error ? 'sign-in-error' : undefined}
        className="mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body"
      />

      <SubmitButton />
    </form>
  );
}
