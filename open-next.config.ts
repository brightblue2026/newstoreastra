import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

/**
 * How the Next.js caches map onto Cloudflare. All three are needed, not just
 * the first: the storefront is ISR (`revalidate = 60`) and the admin calls
 * `revalidatePath` after every edit, and on the App Router that only reaches
 * the storefront when a tag cache records what was invalidated.
 *
 *   - KV       holds the rendered pages.
 *   - D1       records which paths the admin has invalidated.
 *   - DO queue de-duplicates the background re-renders ISR asks for.
 *
 * KV rather than R2 because R2 has to be switched on in the dashboard and was
 * not. KV is eventually consistent, so an edit can take up to a minute to
 * reach every location — the same order as the 60-second revalidate window,
 * and only ever for display: prices are re-read from Postgres at the cart.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
});
