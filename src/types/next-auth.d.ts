import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/generated/prisma/enums';

/**
 * Auth.js ships a minimal user shape. Bright Blue needs the role and the
 * active flag on it, in the session and in the JWT, so that role checks are
 * type-checked rather than string comparisons against `any`.
 *
 * The JWT augmentation targets `@auth/core/jwt` rather than `next-auth/jwt` —
 * the latter is only a re-export, and declaration merging does not follow one.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      isActive: boolean;
      sessionVersion: number;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
    isActive: boolean;
    sessionVersion?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    isActive: boolean;
    sessionVersion?: number;
  }
}
