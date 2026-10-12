/** Liveness only. Reveals no version, credentials, or customer information. */
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
