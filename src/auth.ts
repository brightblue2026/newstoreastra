import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import { z } from 'zod';
import { authConfig } from '@/auth.config';
import { db } from '@/lib/db';
import { fetchVerifiedGitHubEmails, isGitHubSignInConfigured } from '@/lib/github-staff';
import { clearFailedLogins, isLockedOut, recordFailedLogin } from '@/lib/login-lockout';
import { canAccessAdmin } from '@/lib/roles';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Staff sign-in, by password or by GitHub. Customers do not have a password —
 * they sign in by phone OTP, which arrives in Phase 5.
 */
const staffCredentialsSchema = z.object({
  email: z.email({ message: 'Enter a valid email address.' }).trim().toLowerCase(),
  password: z.string().min(1, { message: 'Enter your password.' }),
});

/**
 * GitHub is offered only when its OAuth app is configured — see
 * `.env.example`. Unset, the button is hidden and the provider does not exist.
 */
const githubProviders: Provider[] = isGitHubSignInConfigured() ? [GitHub] : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    /**
     * GitHub proves an identity; the staff table decides whether it gets in.
     *
     * The verified address must belong to exactly one active `User` who may
     * open the admin panel. That row's id, role and name then replace GitHub's
     * on `user` — which the `jwt` callback copies onto the token. This relies
     * on there being no adapter: without one, Auth.js hands this same `user`
     * object on to `jwt`. The `jwt` check below refuses the token if it ever
     * does not.
     *
     * Returning false sends the person to /admin/login?error=AccessDenied.
     */
    async signIn({ user, account }) {
      if (account?.provider !== 'github') return true;
      if (!account.access_token) return false;

      const emails = await fetchVerifiedGitHubEmails(account.access_token);
      if (emails.length === 0) return false;

      const matches = await db.user.findMany({
        where: { email: { in: emails, mode: 'insensitive' } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          sessionVersion: true,
        },
        take: 2,
      });
      // Two staff rows matching one GitHub account is a data problem, not a
      // choice to make silently on someone's behalf.
      if (matches.length !== 1) return false;

      const staff = matches[0];
      if (!staff.isActive || !canAccessAdmin(staff.role)) return false;

      user.id = staff.id;
      user.name = staff.name;
      user.email = staff.email;
      user.role = staff.role;
      user.isActive = staff.isActive;
      user.sessionVersion = staff.sessionVersion;
      return true;
    },

    jwt(params) {
      if (params.account?.provider === 'github' && !canAccessAdmin(params.user?.role)) {
        // Clears the session cookie: never a GitHub token without a staff role.
        return null;
      }
      return authConfig.callbacks.jwt(params);
    },
  },
  providers: [
    ...githubProviders,
    Credentials({
      id: 'staff',
      name: 'Staff sign-in',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = staffCredentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Per email, not per IP: the account being guessed against is what a
        // brute force actually targets, and this is the shared store the
        // constant-time-dummy-hash comment below always said this needed.
        const limit = await checkRateLimit('staff-login', email, 5, 5 * 60);
        if (!limit.allowed) return null;

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            passwordHash: true,
            failedLoginCount: true,
            lockedUntil: true,
            sessionVersion: true,
          },
        });

        // Verify against a dummy hash when the user is missing, so a request
        // for an unknown address takes the same time as a wrong password and
        // the response cannot be used to enumerate staff accounts.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const passwordMatches = await verifyPassword(password, hash);

        if (!user || !user.passwordHash) return null;
        // A paused account refuses the right password too — otherwise the
        // pause would only slow a guesser down, not stop the guess that lands.
        if (isLockedOut(user.lockedUntil)) return null;
        if (!passwordMatches) {
          await recordFailedLogin(user.id);
          return null;
        }
        if (!user.isActive) return null;

        if (user.failedLoginCount > 0 || user.lockedUntil) await clearFailedLogins(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});

/**
 * A valid scrypt hash of a value nobody knows. Used only to keep the timing of
 * a failed lookup indistinguishable from a failed password. Its parameters
 * must match `SCRYPT_PARAMS` in lib/password.ts, or the two take different
 * times — and the earlier N=2^17 would not fit in a Workers isolate.
 */
const DUMMY_HASH =
  'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'YnJpZ2h0Ymx1ZS1kdW1teS1oYXNoLW5vdC1hLXJlYWwtcGFzc3dvcmQtcGxhY2Vob2xkZXItdmFsdWU=';
