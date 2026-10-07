import { isShiprocketConfigured, trackByAwb } from '@/lib/shiprocket';

/**
 * The courier's scan history, fetched live from Shiprocket when the order page
 * renders. Streamed in behind a Suspense boundary so the rest of the page never
 * waits on it, and it renders nothing on any failure — the AWB and the
 * courier's own tracking link are already on the page above it.
 */
export default async function ShipmentTracking({ awbNumber }: { awbNumber: string }) {
  if (!isShiprocketConfigured()) return null;

  const tracking = await trackByAwb(awbNumber);
  if (!tracking || (tracking.scans.length === 0 && !tracking.currentStatus)) return null;

  return (
    <div className="mt-6">
      {tracking.currentStatus && (
        <p className="type-body">
          <span className="text-ink-soft">Latest: </span>
          {tracking.currentStatus}
        </p>
      )}
      {tracking.expectedDelivery && (
        <p className="mt-1 type-caption text-ink-soft">
          Expected by {formatScanDate(tracking.expectedDelivery)}
        </p>
      )}
      {tracking.scans.length > 0 && (
        <ol className="mt-4 space-y-3 border-l border-line pl-4">
          {tracking.scans.slice(0, 8).map((scan) => (
            <li key={`${scan.at}-${scan.status}`}>
              <p className="type-body">{scan.status}</p>
              <p className="type-caption text-ink-soft">
                {formatScanDate(scan.at)}
                {scan.location ? ` · ${scan.location}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Shiprocket sends "2026-09-24 14:05:00" in IST; shown as "24 Sep 2026, 2:05 pm". */
function formatScanDate(value: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}+05:30`);
  if (Number.isNaN(date.getTime())) return value;
  const hasTime = /\d:\d/.test(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  });
}
