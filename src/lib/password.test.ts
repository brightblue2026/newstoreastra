import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('Correct horse battery staple', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('salts, so the same password never produces the same hash twice', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    await expect(verifyPassword('same password', a)).resolves.toBe(true);
    await expect(verifyPassword('same password', b)).resolves.toBe(true);
  });

  it('stores its parameters with the hash so they can be raised later', async () => {
    const hash = await hashPassword('anything');
    const [scheme, N, r, p] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(N)).toBe(2 ** 17);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('handles unicode and long passwords', async () => {
    const password = 'ബ്രൈറ്റ് ബ്ലൂ 🔒 '.repeat(20);
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});

describe('verifyPassword', () => {
  it('returns false rather than throwing on a malformed hash', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$only$three$parts',
      'bcrypt$131072$8$1$c2FsdA==$aGFzaA==',
      'scrypt$abc$8$1$c2FsdA==$aGFzaA==',
      'scrypt$131072$8$1$$',
    ]) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false);
    }
  });

  it('refuses a tampered hash asking for an unbounded amount of memory', async () => {
    const hostile = `scrypt$${2 ** 30}$32$16$c2FsdA==$aGFzaA==`;
    await expect(verifyPassword('anything', hostile)).resolves.toBe(false);
  });

  it('returns false for non-string input', async () => {
    // Guards the login route against a malformed request body.
    await expect(
      verifyPassword(undefined as unknown as string, 'scrypt$1$1$1$a$b'),
    ).resolves.toBe(false);
    await expect(verifyPassword('x', null as unknown as string)).resolves.toBe(false);
  });
});
