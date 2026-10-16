import { describe, expect, it } from 'vitest';
import { configurationChecks } from './readiness';
describe('launch configuration diagnostics', () => {
  it('does not mark an empty deployment ready', () => {
    expect(configurationChecks({}).every((item) => !item.ready)).toBe(true);
  });
  it.each(['http://shop.test', 'https://shop.test/path', 'https://shop.test/?x=1', 'https://user:secret@shop.test'])('rejects invalid public origin %s', (origin) => {
    expect(configurationChecks({ NEXT_PUBLIC_SITE_URL: origin })[0].ready).toBe(false);
  });
  it.each([['SHIPROCKET_API_EMAIL', 'SHIPROCKET_API_PASSWORD'], ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD']])('recognizes shipping credentials %s / %s', (email, password) => {
    const env = { [email]: 'test@example.invalid', [password]: 'secret-test', SHIPROCKET_WEBHOOK_TOKEN: 'webhook-test' };
    expect(configurationChecks(env).find((c) => c.id === 'shipping')?.ready).toBe(true);
    expect(configurationChecks({ ...env, SHIPROCKET_WEBHOOK_TOKEN: '' }).find((c) => c.id === 'shipping')?.ready).toBe(false);
    expect(JSON.stringify(configurationChecks(env))).not.toContain('secret-test');
  });
  it('never includes secret values in diagnostics', () => {
    const checks = configurationChecks({ AUTH_SECRET: 'sensitive-test-value'.repeat(3) });
    expect(checks.find((c) => c.id === 'auth')?.ready).toBe(true);
    expect(JSON.stringify(checks)).not.toContain('sensitive-test-value');
  });
});
