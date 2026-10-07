import type { PoolConfig } from 'pg';

/**
 * The one place a Postgres connection is configured — the app (`db.ts`), the
 * seeds and the scripts all build their pool from this, so they cannot
 * disagree about TLS.
 *
 * Why this exists: Supabase's connection strings, pasted as the dashboard
 * gives them, connect *unencrypted* — `pg` only does TLS when asked. Asking
 * with `sslmode=require` is no better: pg-connection-string 2.x treats it as
 * verify-full against Node's public CA list, and Supabase signs its pooler
 * with its own root, so every connection fails with
 * SELF_SIGNED_CERT_IN_CHAIN (found against the live pooler, 28 September
 * 2026). The fix is to trust exactly Supabase's root and verify the host —
 * encrypted and authenticated, with nothing switched off.
 *
 * Local Postgres (Docker) is left alone: no TLS, as before.
 */

/**
 * Supabase Root 2021 CA — a public certificate, not a secret.
 * From https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
 * (the "Download certificate" link under Project Settings > Database).
 * SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA,
 * valid until 26 April 2031.
 */
export const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

/** True for a Supabase-hosted database, pooled or direct. */
export function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co');
}

/**
 * How many connections one server instance may hold. On Vercel every function
 * instance has its own pool; `pg`'s default of 10 each would let a burst of
 * instances exhaust the Supabase pooler's client limit. Five covers the
 * parallel queries a single page makes.
 */
export const POOL_MAX = 5;

export function pgPoolConfig(connectionString: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Not a URL we can reason about; hand it to pg unchanged and let it fail loudly.
    return { connectionString, max: POOL_MAX };
  }

  if (!isSupabaseHost(url.hostname)) {
    return { connectionString, max: POOL_MAX };
  }

  // pg lets SSL parameters in the URL override the `ssl` object below, so any
  // sslmode/sslrootcert in the pasted string is removed rather than obeyed.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
    max: POOL_MAX,
  };
}
