import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from '@/auth.config';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

/**
 * Staff sign-in. Customers do not have a password — they sign in by phone OTP,
 * which arrives in Phase 5.
 */
const staffCredentialsSchema = z.object({
  email: z.email({ message: 'Enter a valid email address.' }).trim().toLowerCase(),
  password: z.string().min(1, { message: 'Enter your password.' }),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            passwordHash: true,
          },
        });

        // Verify against a dummy hash when the user is missing, so a request
        // for an unknown address takes the same time as a wrong password and
        // the response cannot be used to enumerate staff accounts.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const passwordMatches = await verifyPassword(password, hash);

        if (!user || !user.passwordHash || !passwordMatches) return null;
        if (!user.isActive) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        };
      },
    }),
  ],
});

/**
 * A valid scrypt hash of a value nobody knows. Used only to keep the timing of
 * a failed lookup indistinguishable from a failed password.
 */
const DUMMY_HASH =
  'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'YnJpZ2h0Ymx1ZS1kdW1teS1oYXNoLW5vdC1hLXJlYWwtcGFzc3dvcmQtcGxhY2Vob2xkZXItdmFsdWU=';
