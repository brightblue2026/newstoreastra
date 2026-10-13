import type { NextAuthConfig, Session } from 'next-auth';
import type { JWT } from '@auth/core/jwt';
import { canAccessAdmin, UserRole } from '@/lib/roles';

/**
 * The half of the Auth.js configuration that is safe to run on the edge.
 *
 * Middleware runs in the edge runtime, which has no Node crypto and no
 * Postgres driver. Anything that touches the database or hashes a password
 * lives in `src/auth.ts` instead and never reaches this file.
 */
export const authConfig = {
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },

  // Credentials and OTP both require JWT sessions; there is no session table.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },

  callbacks: {
    /**
     * Copies identity onto the token at sign-in. The role is read from the
     * database exactly once, here — it is never taken from the client.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.isActive = user.isActive;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      return token;
    },

    session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isActive = token.isActive;
        // Tokens issued before this field existed count as version 0.
        session.user.sessionVersion = token.sessionVersion ?? 0;
      }
      return session;
    },

    /**
     * The first of the three layers guarding /admin — this one runs in
     * middleware, before the route is reached.
     *
     * The other two are the admin layout (`requireAdminAccess`) and every
     * server action. Hiding a menu item is not access control, and neither is
     * stopping at the edge.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      if (!pathname.startsWith('/admin')) return true;
      // The login page itself must stay reachable while signed out.
      if (pathname === '/admin/login') return true;

      const user = auth?.user;
      if (!user || user.isActive === false) return false;

      return canAccessAdmin(user.role as UserRole);
    },
  },

  // Filled in by src/auth.ts. Providers need the database.
  providers: [],
} satisfies NextAuthConfig;
