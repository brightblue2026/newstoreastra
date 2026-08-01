import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Layer one of three guarding /admin — see `authConfig.callbacks.authorized`.
 *
 * Only the edge-safe config is used here. Importing `@/auth` would pull the
 * Prisma client and Node crypto into the edge runtime and fail the build.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    /*
      Everything except Next internals, the auth routes themselves, and static
      files. The admin check inside `authorized` narrows it further; the
      storefront simply passes through.
    */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2)$).*)',
  ],
};
