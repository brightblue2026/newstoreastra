import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import {
  CONTENT_DEFAULTS,
  CONTENT_META,
  POLICY_META,
  editorKeySchema,
  policySchema,
  policySlugOf,
  schemaForEditorKey,
  type EditableContentKey,
} from '@/lib/content-schema';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { revertContentAction, saveContentAction } from '../actions';
import { ContentForm, type EditorValues } from '../content-form';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await requireCatalogueAccess();

  const parsedKey = editorKeySchema.safeParse((await params).key);
  if (!parsedKey.success) notFound();
  const key = parsedKey.data;

  const row = await db.contentBlock.findUnique({ where: { key } });
  const slug = policySlugOf(key);

  let editor: EditorValues;
  let label: string;
  let where: string;
  let status: string;
  let unreadable = false;
  let viewHref: string | null;
  let revert: { label: string; hint: string } | null = null;

  if (slug) {
    const stored = row ? policySchema.safeParse(row.data) : null;
    const published = Boolean(row?.isActive && stored?.success);

    // An unpublished policy keeps its draft in the editor, ready to publish again.
    editor = {
      kind: 'policy',
      data: stored?.success ? stored.data : { title: POLICY_META[slug].label, body: '' },
    };
    label = POLICY_META[slug].label;
    where = POLICY_META[slug].where;
    status = !row
      ? 'Not written yet. There is no page and no footer link until this is published.'
      : published
        ? `Published · last changed ${formatDate(row.updatedAt)}`
        : 'Unpublished. The page and its footer link are hidden; the text below is kept.';
    viewHref = published ? `/policies/${slug}` : null;
    if (published) {
      revert = {
        label: 'Unpublish',
        hint: 'Removes the page and its footer link. The text stays here to publish again.',
      };
    }
  } else {
    const blockKey = key as EditableContentKey;
    const stored = row?.isActive ? schemaForEditorKey(blockKey).safeParse(row.data) : null;
    unreadable = Boolean(stored && !stored.success);

    // The editor always starts from what the storefront is actually showing.
    editor = {
      kind: blockKey,
      data: stored?.success ? stored.data : CONTENT_DEFAULTS[blockKey],
    } as EditorValues;
    label = CONTENT_META[blockKey].label;
    where = CONTENT_META[blockKey].where;
    status =
      row?.isActive && stored?.success
        ? `Edited · last changed ${formatDate(row.updatedAt)}`
        : 'Showing the original wording.';
    viewHref = blockKey === 'announcement_bar' || blockKey === 'home_hero' || blockKey === 'trust_badges'
      ? '/'
      : '/story';
    if (row?.isActive) {
      revert = {
        label: 'Go back to the original wording',
        hint: 'Replaces your edited version with the wording the site launched with. Your version stays in the audit log.',
      };
    }
  }

  return (
    <div>
      <Link href="/admin/content" className="type-caption text-ink-soft underline">
        All content
      </Link>
      <h1 className="mt-4 type-display-sm">{label}</h1>
      <p className="mt-2 type-body text-ink-soft">{where}</p>
      <p className="mt-4 type-caption normal-case">
        {status}
        {viewHref && (
          <>
            {' '}
            <Link href={viewHref} className="text-signal underline" target="_blank">
              View on the site
            </Link>
          </>
        )}
      </p>

      {unreadable && (
        <p
          role="alert"
          className="mt-6 max-w-2xl rounded-control border border-warning px-4 py-3 type-body text-warning"
        >
          The saved version of this block could not be read, so the site is showing the original
          wording. Saving this form replaces it.
        </p>
      )}

      <ContentForm
        action={saveContentAction.bind(null, key)}
        editor={editor}
        submitLabel={slug ? 'Publish' : 'Save'}
      />

      {revert && (
        <form
          action={revertContentAction.bind(null, key)}
          className="mt-12 max-w-2xl border-t border-line pt-6"
        >
          <p className="type-caption normal-case text-ink-soft">{revert.hint}</p>
          <button type="submit" className="mt-3 type-body text-ink-soft underline">
            {revert.label}
          </button>
        </form>
      )}
    </div>
  );
}
