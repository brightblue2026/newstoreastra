import { requireAdminAccess } from '@/lib/session';
import { PasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

/* Your own password — open to every role that can sign in. */
export default async function AccountPage() {
  const user = await requireAdminAccess();

  return (
    <div>
      <h1 className="type-display-sm">Password</h1>
      <p className="mt-4 max-w-prose type-body text-ink-soft">
        Signed in as {user.email}. Changing the password signs this account out everywhere,
        including here, and you sign in again with the new one.
      </p>
      <PasswordForm />
    </div>
  );
}
