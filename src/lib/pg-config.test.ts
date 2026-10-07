import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { POOL_MAX, SUPABASE_ROOT_CA, isSupabaseHost, pgPoolConfig } from './pg-config';

/*
  The connection string is pasted from a dashboard by someone non-technical,
  and a wrong answer here is silent: an unencrypted connection works exactly
  like an encrypted one until someone reads the traffic.
*/

const POOLED =
  'postgresql://postgres.abc:p%40ss@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

describe('pgPoolConfig', () => {
  it('verifies Supabase against its own root, never unencrypted', () => {
    const config = pgPoolConfig(POOLED);
    expect(config.ssl).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true });
  });

  it('strips sslmode from the URL, since pg would let it override the ssl object', () => {
    const config = pgPoolConfig(`${POOLED}&sslmode=require&sslrootcert=/tmp/x.crt`);
    const url = new URL(config.connectionString!);
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('sslrootcert')).toBe(false);
    expect(url.searchParams.get('pgbouncer')).toBe('true');
  });

  it('keeps an encoded password intact', () => {
    const url = new URL(pgPoolConfig(POOLED).connectionString!);
    expect(decodeURIComponent(url.password)).toBe('p@ss');
  });

  it('covers the direct host too', () => {
    const config = pgPoolConfig('postgresql://postgres:x@db.abc.supabase.co:5432/postgres');
    expect(config.ssl).toBeTruthy();
  });

  it('leaves local Postgres without TLS', () => {
    const local = 'postgresql://bbtc:bbtc@localhost:5432/bbtc_store';
    expect(pgPoolConfig(local)).toEqual({ connectionString: local, max: POOL_MAX });
  });

  it('caps the pool for serverless instances', () => {
    expect(pgPoolConfig(POOLED).max).toBe(POOL_MAX);
    expect(POOL_MAX).toBeLessThanOrEqual(5);
  });
});

describe('isSupabaseHost', () => {
  it('does not trust a lookalike domain', () => {
    expect(isSupabaseHost('pooler.supabase.com.evil.test')).toBe(false);
    expect(isSupabaseHost('notsupabase.com')).toBe(false);
  });
});

describe('SUPABASE_ROOT_CA', () => {
  it('is the Supabase Root 2021 CA and still valid', () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA);
    expect(cert.subject).toContain('CN=Supabase Root 2021 CA');
    expect(cert.fingerprint256).toBe(
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    );
    expect(new Date(cert.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});
