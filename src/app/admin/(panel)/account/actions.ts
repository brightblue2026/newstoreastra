'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { isLockedOut, recordFailedLogin } from '@/lib/login-lockout';
import { hashPassword, verifyPassword } from '@/lib/password';
import { requireAdminAccess } from '@/lib/session';

export interface PasswordFormState {
  error?: string;
}

/** The same floor `pnpm user:create` enforces. */
const MIN_PASSWORD_LENGTH = 12;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Enter your current password.' }),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        message: `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
      .max(200, { message: 'The new password is too long. Keep it under 200 characters.' }),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'The two new passwords do not match. Type the same one in both boxes.',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'The new password is the same as the current one. Choose a different one.',
  });

/**
 * Change your own password.
 *
 * The current password is asked for again even though the person is signed
 * in: a session left open on a shared office computer must not be enough to
 * take the account over. Wrong answers count towards the same sign-in pause
 * as the login form, so this is not a second place to guess from.
 *
 * Saving raises `sessionVersion`, which ends every session for the account —
 * this one included — so the person signs in again with the new password.
 */
export async function changePasswordAction(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const user = await requireAdminAccess();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the passwords and try again.' };
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, lockedUntil: true },
  });
  if (!row?.passwordHash) {
    return { error: 'This account signs in with GitHub and has no password to change.' };
  }
  if (isLockedOut(row.lockedUntil)) {
    return { error: 'Too many wrong passwords. Wait 15 minutes, then try again.' };
  }
  if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    await recordFailedLogin(user.id);
    return { error: 'The current password is not right. Check it and try again.' };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      failedLoginCount: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });

  // The hash never goes into the audit trail — only that a change happened.
  await recordAudit({
    userId: user.id,
    action: 'update',
    entityType: 'User',
    entityId: user.id,
    before: null,
    after: { email: user.email, passwordChanged: true },
  });

  redirect('/admin/login?changed=1');
}
