import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import d1NextTagCache from '@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache';

/**
 * How the Next.js caches map onto Cloudflare. All three are needed, not just
 * the first: the storefront is ISR (`revalidate = 60`) and the admin calls
 * `revalidatePath` after every edit, and on the App Router that only reaches
 * the storefront when a tag cache records what was invalidated.
 *
 *   - R2      holds the rendered pages.
 *   - D1      records which paths the admin has invalidated.
 *   - DO queue de-duplicates the background re-renders ISR asks for.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: d1NextTagCache,
});
