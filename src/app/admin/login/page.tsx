import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGitHubSignInConfigured } from '@/lib/github-staff';
import { currentUser } from '@/lib/session';
import { canAccessAdmin } from '@/lib/roles';
import { signInWithGitHubAction } from './actions';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Staff sign-in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Auth.js redirects here with `?error=` when a sign-in is refused. Every
 * refusal gets the same sentence, for the same reason the password form does.
 */
const GITHUB_REFUSED =
  'That GitHub account is not linked to an active staff member. It needs a verified email matching a staff account.';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; changed?: string | string[] }>;
}) {
  const user = await currentUser();
  if (user && canAccessAdmin(user.role)) redirect('/admin');

  const { error, changed } = await searchParams;
  const githubEnabled = isGitHubSignInConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="type-display-sm">Staff sign-in</h1>
        <p className="mt-4 type-body text-ink-soft">
          For Bright Blue staff. Customers do not need an account to order.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-8 rounded-control border border-warning px-4 py-3 type-body text-warning"
          >
            {GITHUB_REFUSED}
          </p>
        )}
        {changed && !error && (
          <p
            role="status"
            className="mt-8 rounded-control border border-line px-4 py-3 type-body text-ink"
          >
            Password changed. Sign in with the new one.
          </p>
        )}
        <SignInForm />
        {githubEnabled && (
          <form action={signInWithGitHubAction} className="mt-4">
            <button
              type="submit"
              className="w-full rounded-control border border-line bg-white px-6 py-3 type-body font-medium text-ink"
            >
              Sign in with GitHub
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
