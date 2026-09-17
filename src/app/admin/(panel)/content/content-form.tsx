'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  TRUST_BADGE_SLOTS,
  type ContentData,
  type PolicyData,
} from '@/lib/content-schema';
import type { ContentFormState } from './actions';

export type EditorValues =
  | { kind: 'announcement_bar'; data: ContentData<'announcement_bar'> }
  | { kind: 'home_hero'; data: ContentData<'home_hero'> }
  | { kind: 'world_record'; data: ContentData<'world_record'> }
  | { kind: 'trust_badges'; data: ContentData<'trust_badges'> }
  | { kind: 'home_story'; data: ContentData<'home_story'> }
  | { kind: 'policy'; data: PolicyData };

const inputClass = 'mt-2 w-full rounded-control border border-line bg-white px-4 py-3 type-body';
const labelClass = 'block type-caption text-ink-soft';
const hintClass = 'mt-2 type-caption normal-case text-ink-soft';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-signal px-6 py-3 type-body font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Saving' : label}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  rows,
  type,
  className = 'mt-6',
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  rows?: number;
  type?: 'number';
  className?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {rows ? (
        <textarea
          id={name}
          name={name}
          rows={rows}
          defaultValue={defaultValue}
          aria-describedby={hintId}
          className={inputClass}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          min={type === 'number' ? 1 : undefined}
          defaultValue={defaultValue}
          aria-describedby={hintId}
          className={inputClass}
        />
      )}
      {hint && (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function ContentForm({
  action,
  editor,
  submitLabel,
}: {
  action: (state: ContentFormState, formData: FormData) => Promise<ContentFormState>;
  editor: EditorValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {} as ContentFormState);

  /** What the editor typed if the last save failed; otherwise what is saved. */
  const value = (name: string, saved: string) => state.fields?.[name] ?? saved;

  return (
    <form action={formAction} className="mt-8 max-w-2xl" noValidate>
      {state.error && (
        <div
          role="alert"
          className="mb-6 rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          <p>{state.error}</p>
          {state.issues && state.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editor.kind === 'announcement_bar' && (
        <Field
          name="items"
          label="Announcements"
          rows={6}
          className=""
          defaultValue={value('items', editor.data.items.join('\n'))}
          hint="One announcement per line, up to eight. They scroll in this order."
        />
      )}

      {editor.kind === 'home_hero' && (
        <>
          <Field
            name="eyebrow"
            label="Eyebrow"
            className=""
            defaultValue={value('eyebrow', editor.data.eyebrow)}
            hint="The small line above the headline."
          />
          <fieldset className="mt-6 rounded-card border border-line p-6">
            <legend className="px-2 type-caption text-ink-soft">Headline</legend>
            <p className={hintClass + ' mt-0'}>
              The headline reads start, emphasised words, end. The emphasised words are set in
              italic. Start and end may be left empty.
            </p>
            <Field name="before" label="Start" defaultValue={value('before', editor.data.before)} />
            <Field
              name="emphasis"
              label="Emphasised words"
              defaultValue={value('emphasis', editor.data.emphasis)}
            />
            <Field name="after" label="End" defaultValue={value('after', editor.data.after)} />
          </fieldset>
          <Field
            name="body"
            label="Introduction"
            rows={4}
            defaultValue={value('body', editor.data.body)}
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              name="ctaLabel"
              label="Button label"
              defaultValue={value('ctaLabel', editor.data.ctaLabel)}
            />
            <Field
              name="ctaHref"
              label="Button link"
              defaultValue={value('ctaHref', editor.data.ctaHref)}
              hint="A page on this site, such as /shop, or a full https:// address."
            />
          </div>
        </>
      )}

      {editor.kind === 'world_record' && (
        <>
          <Field
            name="count"
            label="Count"
            type="number"
            className=""
            defaultValue={value('count', String(editor.data.count))}
            hint="Shown large, followed by the headline."
          />
          <Field
            name="headline"
            label="Headline"
            defaultValue={value('headline', editor.data.headline)}
          />
          <Field
            name="body"
            label="Description"
            rows={4}
            defaultValue={value('body', editor.data.body)}
          />
        </>
      )}

      {editor.kind === 'trust_badges' && (
        <>
          <p className={hintClass + ' mt-0'}>
            Up to six. Fill rows from the top; empty rows at the end are ignored.
          </p>
          {Array.from({ length: TRUST_BADGE_SLOTS }, (_, slot) => {
            const badge = editor.data.badges[slot];
            return (
              <fieldset key={slot} className="mt-6 rounded-card border border-line p-6">
                <legend className="px-2 type-caption text-ink-soft">Badge {slot + 1}</legend>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field
                    name={`badgeLabel-${slot}`}
                    label="Label"
                    className=""
                    defaultValue={value(`badgeLabel-${slot}`, badge?.label ?? '')}
                  />
                  <Field
                    name={`badgeDetail-${slot}`}
                    label="Detail"
                    className=""
                    defaultValue={value(`badgeDetail-${slot}`, badge?.detail ?? '')}
                  />
                </div>
              </fieldset>
            );
          })}
        </>
      )}

      {editor.kind === 'home_story' && (
        <>
          <Field
            name="heading"
            label="Heading"
            className=""
            defaultValue={value('heading', editor.data.heading)}
          />
          <Field
            name="paragraphs"
            label="Story"
            rows={12}
            defaultValue={value('paragraphs', editor.data.paragraphs.join('\n\n'))}
            hint="Leave a blank line between paragraphs."
          />
        </>
      )}

      {editor.kind === 'policy' && (
        <>
          <Field
            name="title"
            label="Page title"
            className=""
            defaultValue={value('title', editor.data.title)}
          />
          <Field
            name="body"
            label="Policy text"
            rows={24}
            defaultValue={value('body', editor.data.body)}
            hint="Leave a blank line between paragraphs. Start a line with # to make it a heading."
          />
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <SubmitButton label={submitLabel} />
        {state.saved && (
          <p role="status" className="type-caption normal-case text-success">
            {state.saved}
          </p>
        )}
      </div>
    </form>
  );
}
