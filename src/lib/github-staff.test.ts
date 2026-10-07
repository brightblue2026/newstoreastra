import { describe, expect, it } from 'vitest';
import { verifiedEmails } from './github-staff';

describe('verifiedEmails', () => {
  it('keeps only addresses GitHub has verified', () => {
    expect(
      verifiedEmails([
        { email: 'owner@example.com', primary: true, verified: false },
        { email: 'staff@example.com', primary: false, verified: true },
      ]),
    ).toEqual(['staff@example.com']);
  });

  it('refuses an unverified primary — the takeover case', () => {
    expect(verifiedEmails([{ email: 'owner@example.com', primary: true, verified: false }])).toEqual(
      [],
    );
  });

  it('lowercases and trims, to match how staff emails are stored', () => {
    expect(verifiedEmails([{ email: ' Staff@Example.COM ', primary: true, verified: true }])).toEqual(
      ['staff@example.com'],
    );
  });

  it('treats anything that is not the documented shape as no emails', () => {
    expect(verifiedEmails(null)).toEqual([]);
    expect(verifiedEmails({ message: 'Bad credentials' })).toEqual([]);
    expect(verifiedEmails([{ email: 'x@example.com', verified: 'true' }])).toEqual([]);
    expect(verifiedEmails([null, 42])).toEqual([]);
  });
});
