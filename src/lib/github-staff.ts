/**
 * Staff sign-in with GitHub — the rules, kept apart from `auth.ts` so they can
 * be tested without Auth.js or a database.
 *
 * GitHub is only a way to prove who someone is. It never creates an account
 * and never grants a role: the person must already exist as an active staff
 * `User`, and their role comes from that row, exactly as for a password.
 */

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * The addresses GitHub has actually verified, lowercased.
 *
 * Auth.js's GitHub provider picks the primary (or first) address without
 * looking at `verified`. Matching staff on an unverified address would let
 * anyone add `owner@shop.com` to their own GitHub account and sign in as the
 * owner — so the list is fetched again here and filtered.
 */
export function verifiedEmails(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];
  return emails
    .filter(
      (entry): entry is GitHubEmail =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as GitHubEmail).email === 'string' &&
        (entry as GitHubEmail).verified === true,
    )
    .map((entry) => entry.email.trim().toLowerCase());
}

/** Reads the signed-in GitHub user's email list with their access token. */
export async function fetchVerifiedGitHubEmails(accessToken: string): Promise<string[]> {
  const response = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bbtc-store',
    },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return verifiedEmails(await response.json());
}

/** True when the GitHub OAuth app credentials are present. */
export function isGitHubSignInConfigured(): boolean {
  return Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
}
