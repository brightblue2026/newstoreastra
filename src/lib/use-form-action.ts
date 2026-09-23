'use client';

import { useActionState, useLayoutEffect, useRef } from 'react';

/**
 * `useActionState` for an admin form that must not lose what was typed.
 *
 * React 19 resets a `<form action={...}>` after every submission. On success
 * that is harmless (the page moves on or re-renders with saved values), but
 * on a refused save it wiped the whole form — the owner filled in a discount,
 * missed one field, and had to type everything again.
 *
 * This remembers the submitted `FormData` and, when the result carries an
 * `error`, writes it back into the form's fields after React's reset. Fields
 * that React controls (hidden inputs) and file inputs are left alone.
 *
 * Attach the returned ref to the `<form>`.
 */
export function useFormActionKeepingInput<S extends { error?: string }>(
  action: (state: S, formData: FormData) => Promise<S>,
  initialState: S,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  const [state, formAction, pending] = useActionState<S, FormData>(
    async (previous, formData) => {
      submitted.current = formData;
      return action(previous as S, formData);
    },
    initialState as Awaited<S>,
  );

  useLayoutEffect(() => {
    const form = formRef.current;
    const data = submitted.current;
    if (!form || !data || !state.error) return;
    restoreFormValues(form, data);
  }, [state]);

  return [state, formAction, pending, formRef] as const;
}

/** Writes submitted values back into a form, matching repeated names by position. */
export function restoreFormValues(form: HTMLFormElement, data: FormData): void {
  const seen = new Map<string, number>();

  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      continue;
    }
    const name = element.name;
    if (!name) continue;

    const values = data.getAll(name).map((value) => (typeof value === 'string' ? value : ''));

    if (element instanceof HTMLInputElement) {
      if (element.type === 'hidden' || element.type === 'file') continue;
      if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = values.includes(element.value);
        continue;
      }
    }

    if (element instanceof HTMLSelectElement && element.multiple) {
      for (const option of Array.from(element.options)) option.selected = values.includes(option.value);
      continue;
    }

    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    if (index < values.length) element.value = values[index];
  }
}
