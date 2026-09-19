/*
  Create and configure the Storage bucket product photos live in.

    pnpm storage:setup [--check]

  The admin panel cannot make its own bucket — `signProductImageUploadAction`
  assumes it already exists and fails clearly when it does not. This is that
  one-time provisioning step, and it is the storage half of what
  `prisma migrate deploy` is for the database.

  Safe to re-run. It reads the bucket back first, creates it only when absent,
  and corrects the settings only when they have drifted. A run that finds
  everything already right writes nothing and says so.

  `--check` reports what it *would* do and changes nothing — for confirming a
  deployment's bucket without touching it.

  The limits are not restated here. They come from `storage-shared.ts`, which
  is also what the uploader and `saveProductImageAction` enforce, so the
  bucket and the app cannot disagree about what a valid photo is.
*/

import path from 'node:path';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_BUCKET,
  IMAGE_FOLDER,
  MAX_UPLOAD_BYTES,
} from '../src/lib/storage-shared';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const checkOnly = process.argv.includes('--check');

/**
 * Checked inside `main`, not at module load. A top-level `throw` escapes the
 * catch below and prints a stack trace — and the person who sees this message
 * is the one setting the site up, for whom a stack trace is noise hiding the
 * one sentence that tells them what to do.
 */
function assertCredentials(): void {
  if (url && serviceKey) return;

  const missing = [!url && 'SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    Boolean,
  ) as string[];

  throw new Error(
    `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set in .env.\n\n` +
      'Supabase dashboard > Project Settings > API:\n' +
      '  SUPABASE_URL               the Project URL, https://<ref>.supabase.co\n' +
      '  SUPABASE_SERVICE_ROLE_KEY  the `service_role` key, NOT `anon`\n\n' +
      'The service_role key is a server secret — it bypasses row-level\n' +
      'security, so it must never be prefixed NEXT_PUBLIC_ or reach the browser.',
  );
}

/** The service-role key goes in both headers; Storage checks `Authorization`. */
function headers(): HeadersInit {
  return {
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey!}`,
    'Content-Type': 'application/json',
  };
}

/**
 * What the bucket should be.
 *
 * `public: true` because product photos are served straight to shoppers by
 * `next/image`, which fetches them as an anonymous client — a private bucket
 * would mean minting a signed URL per image per render. The bucket holds
 * nothing but catalogue photography that is already on the shop front.
 *
 * The MIME allowlist is the real enforcement: it is what stops a signed
 * upload URL being used to park an executable or an SVG (which can carry
 * script) in the bucket. `saveProductImageAction` re-checks it, but by then
 * the object is already stored — the bucket refuses it outright.
 */
const desired = {
  public: true,
  file_size_limit: MAX_UPLOAD_BYTES,
  allowed_mime_types: [...ALLOWED_IMAGE_MIME_TYPES],
};

interface Bucket {
  id: string;
  public: boolean;
  file_size_limit: number | null;
  allowed_mime_types: string[] | null;
}

/**
 * `null` means the bucket does not exist yet, which is the normal first run.
 *
 * Storage does not say that with an HTTP 404. A missing bucket comes back as
 * **400** carrying `{"statusCode":"404","code":"NoSuchBucket"}` in the body,
 * so the body is what has to be read — keying off `response.status` alone
 * turns "not created yet" into a hard error and the script can never create
 * anything. Both shapes are accepted in case that is ever tidied up.
 */
async function readBucket(): Promise<Bucket | null> {
  const response = await fetch(`${url}/storage/v1/bucket/${IMAGE_BUCKET}`, { headers: headers() });
  if (response.ok) return (await response.json()) as Bucket;

  const body = await response.text();
  if (response.status === 404) return null;

  try {
    const parsed = JSON.parse(body) as { statusCode?: string; code?: string };
    if (parsed.code === 'NoSuchBucket' || parsed.statusCode === '404') return null;
  } catch {
    // Not JSON — fall through and report it as the real failure it is.
  }

  throw new Error(`Could not read the bucket (${response.status}): ${body}`);
}

async function createBucket(): Promise<void> {
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ id: IMAGE_BUCKET, name: IMAGE_BUCKET, ...desired }),
  });
  if (!response.ok) {
    throw new Error(`Could not create the bucket (${response.status}): ${await response.text()}`);
  }
}

async function updateBucket(): Promise<void> {
  const response = await fetch(`${url}/storage/v1/bucket/${IMAGE_BUCKET}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(desired),
  });
  if (!response.ok) {
    throw new Error(`Could not update the bucket (${response.status}): ${await response.text()}`);
  }
}

/** The settings that have drifted from what the app enforces, named in English. */
function drift(bucket: Bucket): string[] {
  const problems: string[] = [];

  if (!bucket.public) {
    problems.push('it is private, so next/image cannot fetch the photos');
  }
  if (bucket.file_size_limit !== desired.file_size_limit) {
    const was = bucket.file_size_limit === null ? 'no limit' : `${bucket.file_size_limit} bytes`;
    problems.push(`size limit is ${was}, should be ${desired.file_size_limit} bytes`);
  }

  const actualTypes = [...(bucket.allowed_mime_types ?? [])].sort();
  const wantedTypes = [...desired.allowed_mime_types].sort();
  if (actualTypes.join(',') !== wantedTypes.join(',')) {
    const was = bucket.allowed_mime_types === null ? 'anything' : actualTypes.join(', ');
    problems.push(`accepts ${was}, should accept ${wantedTypes.join(', ')}`);
  }

  return problems;
}

/**
 * Proves the bucket is actually readable the way a shopper's browser reads it
 * — anonymously, no key. A 400 or 404 for a key that does not exist is the
 * correct answer and means the bucket is reachable and public; a 403 means it
 * is not public and every product photo would render broken.
 */
async function verifyPublicRead(): Promise<void> {
  const probe = `${url}/storage/v1/object/public/${IMAGE_BUCKET}/${IMAGE_FOLDER}/does-not-exist.png`;
  const response = await fetch(probe);
  if (response.status === 403) {
    throw new Error(
      'The bucket is not publicly readable — product photos would render broken.\n' +
        'Check that it is marked public in the Supabase dashboard.',
    );
  }
  console.log(`Public read confirmed (a missing object returns ${response.status}, as it should).`);
}

async function main(): Promise<void> {
  assertCredentials();

  console.log(`Project: ${url}`);
  console.log(`Bucket:  ${IMAGE_BUCKET}\n`);

  const existing = await readBucket();

  if (!existing) {
    if (checkOnly) {
      console.log('The bucket does not exist. Re-run without --check to create it.');
      return;
    }
    await createBucket();
    console.log(`Created "${IMAGE_BUCKET}".`);
    console.log(`  public:     yes`);
    console.log(`  size limit: ${MAX_UPLOAD_BYTES} bytes (${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)`);
    console.log(`  accepts:    ${desired.allowed_mime_types.join(', ')}`);
  } else {
    const problems = drift(existing);
    if (problems.length === 0) {
      console.log(`"${IMAGE_BUCKET}" already exists and is configured correctly. Nothing changed.`);
    } else if (checkOnly) {
      console.log(`"${IMAGE_BUCKET}" exists but has drifted:`);
      for (const problem of problems) console.log(`  - ${problem}`);
      console.log('\nRe-run without --check to correct it.');
      return;
    } else {
      console.log(`"${IMAGE_BUCKET}" exists but had drifted:`);
      for (const problem of problems) console.log(`  - ${problem}`);
      await updateBucket();
      console.log('Corrected.');
    }
  }

  console.log();
  await verifyPublicRead();
  console.log('\nPhoto uploads are ready. Add one at /admin/products/<id>/images.');
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
