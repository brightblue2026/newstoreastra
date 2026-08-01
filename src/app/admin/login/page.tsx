import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { canAccessAdmin } from '@/lib/roles';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Staff sign-in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const user = await currentUser();
  if (user && canAccessAdmin(user.role)) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="type-display-sm">Staff sign-in</h1>
        <p className="mt-4 type-body text-ink-soft">
          For Bright Blue staff. Customers do not need an account to order.
        </p>
        <SignInForm />
      </div>
    </main>
  );
}
