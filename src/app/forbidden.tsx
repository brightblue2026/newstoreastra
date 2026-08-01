import Link from 'next/link';

/**
 * Shown when a signed-in user reaches something their role does not cover —
 * STAFF opening a pricing screen, MANAGER opening the audit log.
 *
 * It names what happened and offers a next action, per §9 voice.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <p className="type-caption text-ink-soft">403</p>
      <h1 className="mt-6 type-display-sm">Your role does not cover this screen</h1>
      <p className="mt-6 type-body-lg text-ink-soft">
        You are signed in, but this area needs a higher level of access. An administrator
        can change your role.
      </p>
      <Link
        href="/admin"
        className="mt-8 self-start rounded-control bg-signal px-6 py-3 type-body font-medium text-white"
      >
        Back to admin
      </Link>
    </main>
  );
}
