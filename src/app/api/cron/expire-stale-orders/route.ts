import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { expireStaleOrders } from '@/lib/orders';

/*
  GET /api/cron/expire-stale-orders — triggered every 15 minutes by the
  Worker's cron handler (see `worker.ts` and `triggers` in `wrangler.jsonc`),
  not by anything a customer or admin screen calls.

  The handler sends `Authorization: Bearer $CRON_SECRET` — this route only
  has to check that header matches. Fails
  closed: no configured secret means every request is rejected, same as the
  Shiprocket webhook when its token is unset.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    console.warn('[cron] expire-stale-orders rejected: no CRON_SECRET configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 400 });
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await expireStaleOrders();

  if (result.failed.length > 0) {
    console.error('[cron] expire-stale-orders: some orders could not be cancelled:', result.failed);
  }
  if (result.cancelled.length > 0) {
    console.info('[cron] expire-stale-orders: cancelled', result.cancelled.join(', '));
  }

  return NextResponse.json(result);
}
