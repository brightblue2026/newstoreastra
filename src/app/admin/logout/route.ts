import { NextResponse } from 'next/server';
import { signOut } from '@/auth';

/*
  POST /admin/logout — ends the staff session.

  A route handler, not a server action, and deliberately outside the
  middleware's matcher (see src/middleware.ts). The middleware re-issues the
  session cookie on every request it handles, to keep a session rolling. A
  server action posted from an admin page goes through it, so the cookie the
  action had just cleared was set again on the same response: "Sign out" went
  to the login page and left the person signed in. Found by `pnpm e2e:admin`.

  Being a plain form POST also means it works before the page has hydrated.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Not a server action, so it does not get Next's own origin check. Without
  // one, any other site could sign staff out with a hidden form.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await signOut({ redirect: false });
  // 303 so the browser follows with a GET.
  return NextResponse.redirect(new URL('/admin/login', request.url), 303);
}
