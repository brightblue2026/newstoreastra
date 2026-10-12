import { describe, expect, it } from 'vitest';
import { configurationChecks } from './readiness';
describe('launch configuration diagnostics', () => {
  it('does not mark an empty deployment ready', () => {
    expect(configurationChecks({}).every((item) => !item.ready)).toBe(true);
  });
  it.each(['http://shop.test', 'https://shop.test/path', 'https://shop.test/?x=1', 'https://user:secret@shop.test'])('rejects invalid public origin %s', (origin) => {
    expect(configurationChecks({ NEXT_PUBLIC_SITE_URL: origin })[0].ready).toBe(false);
  });
  it('never includes secret values in diagnostics', () => {
    const checks = configurationChecks({ AUTH_SECRET: 'sensitive-test-value'.repeat(3) });
    expect(checks.find((c) => c.id === 'auth')?.ready).toBe(true);
    expect(JSON.stringify(checks)).not.toContain('sensitive-test-value');
  });
});
