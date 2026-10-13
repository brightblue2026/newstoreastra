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
  // Authentication belongs on admin routes. Running Auth.js on public pages
  // creates session/CSRF cookies, adds crypto work and impairs shared caching.
  // Logout checks its own origin and must not have its cookie re-issued here.
  matcher: ['/admin', '/admin/((?!logout(?:/|$)).*)'],
};
