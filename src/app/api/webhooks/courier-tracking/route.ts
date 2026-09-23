/*
  The same tracking webhook as /api/webhooks/shiprocket, at a URL Shiprocket's
  dashboard will accept: it refuses webhook URLs containing "shiprocket",
  "kartrocket", "sr" or "kr". This is the address to paste there. The original
  path stays so nothing already pointing at it breaks.
*/
export { POST } from '../shiprocket/route';

// Segment config has to be declared here; Next.js does not follow a re-export.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
