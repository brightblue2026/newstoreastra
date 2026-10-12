/** Configuration diagnostics expose names/status only, never secret values. */
export interface ReadinessCheck { id: string; label: string; ready: boolean; detail: string }
export function configurationChecks(env: Record<string, string | undefined>): ReadinessCheck[] {
  const present = (...keys: string[]) => keys.every((key) => Boolean(env[key]?.trim()));
  let validOrigin = false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? '');
    validOrigin = url.protocol === 'https:' && !['localhost', 'example.invalid'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch { /* Missing or malformed origin is a launch blocker. */ }
  return [
    { id: 'origin', label: 'Store domain', ready: validOrigin, detail: 'Set the final HTTPS store origin for links and search metadata.' },
    { id: 'database', label: 'Database connection', ready: present('DATABASE_URL'), detail: 'Configure the application database and verify migrations in staging.' },
    { id: 'auth', label: 'Session security', ready: (env.AUTH_SECRET?.length ?? 0) >= 32, detail: 'Use a unique randomly generated session secret of at least 32 characters.' },
    { id: 'rate-limit', label: 'Abuse protection', ready: present('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'), detail: 'Shared rate limiting is required for checkout and staff sign-in in production.' },
    { id: 'payment', label: 'Online payments', ready: present('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'), detail: 'Configure payment keys and the webhook secret, then complete the test-mode acceptance run.' },
    { id: 'cron', label: 'Unpaid order cleanup', ready: (env.CRON_SECRET?.length ?? 0) >= 32, detail: 'Configure a strong scheduler secret and verify the 15-minute cleanup job.' },
    { id: 'storage', label: 'Product photography', ready: present('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'), detail: 'Configure image storage and verify an upload from the product editor.' },
  ];
}
