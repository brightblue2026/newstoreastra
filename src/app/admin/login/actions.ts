'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn } from '@/auth';

const signInSchema = z.object({
  email: z.email({ message: 'Enter a valid email address.' }),
  password: z.string().min(1, { message: 'Enter your password.' }),
});

export interface SignInState {
  error?: string;
}

/**
 * Staff sign-in.
 *
 * One message for every failure — wrong address, wrong password, deactivated
 * account. Naming which one was wrong tells an attacker which staff emails
 * exist.
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details and try again.' };
  }

  try {
    await signIn('staff', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/admin',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'That email and password do not match an active staff account.' };
    }
    // signIn throws a redirect on success; it must reach Next.js untouched.
    throw error;
  }

  return {};
}
