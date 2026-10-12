import { describe, expect, it } from 'vitest';
import {
  LOGIN_BACKOFF_MS,
  credentialFingerprint,
  isLoginBlocked,
  isLoginRefusal,
} from './shiprocket-login';

/*
  The rule that stops a wrong password locking the Shiprocket account. Before
  it, every quote and every order push retried the login, and Shiprocket
  blocked the API user outright.
*/

describe('credentialFingerprint', () => {
  it('is stable for the same credentials', () => {
    expect(credentialFingerprint('a@b.in', 'secret')).toBe(credentialFingerprint('a@b.in', 'secret'));
  });

  it('changes when the password is corrected', () => {
    expect(credentialFingerprint('a@b.in', 'secret')).not.toBe(
      credentialFingerprint('a@b.in', 'secret2'),
    );
  });

  it('does not contain the password', () => {
    expect(credentialFingerprint('a@b.in', 'hunter2-long-password')).not.toContain('hunter2');
  });
});

describe('isLoginRefusal', () => {
  it('treats a rejected or blocked login as a refusal', () => {
    expect(isLoginRefusal(400)).toBe(true);
    expect(isLoginRefusal(403)).toBe(true);
  });

  it('does not treat an outage as a refusal', () => {
    expect(isLoginRefusal(500)).toBe(false);
    expect(isLoginRefusal(503)).toBe(false);
  });
});

describe('isLoginBlocked', () => {
  const fingerprint = credentialFingerprint('a@b.in', 'wrong');
  const now = 1_000_000;
  const block = { fingerprint, until: now + LOGIN_BACKOFF_MS };

  it('blocks the same credentials inside the pause', () => {
    expect(isLoginBlocked(block, fingerprint, now)).toBe(true);
    expect(isLoginBlocked(block, fingerprint, now + LOGIN_BACKOFF_MS - 1)).toBe(true);
  });

  it('allows one more attempt once the pause has passed', () => {
    expect(isLoginBlocked(block, fingerprint, now + LOGIN_BACKOFF_MS)).toBe(false);
  });

  it('allows corrected credentials straight away', () => {
    expect(isLoginBlocked(block, credentialFingerprint('a@b.in', 'right'), now)).toBe(false);
  });

  it('ignores a missing or malformed record', () => {
    expect(isLoginBlocked(null, fingerprint, now)).toBe(false);
    expect(isLoginBlocked(undefined, fingerprint, now)).toBe(false);
    expect(isLoginBlocked({ fingerprint, until: 'soon' }, fingerprint, now)).toBe(false);
  });
});
