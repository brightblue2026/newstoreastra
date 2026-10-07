/*
  The homepage hero illustration: a Kerala kitchen counter — an uruli, a
  kindi and a steel tumbler in front of a standing plate — with a column of
  bubbles rising out of the uruli.

  There are exactly 24 bubbles, one per MX-3 fragrance. Nobody has to notice;
  it is there so the art is about this company and not any dishwash.

  Drawn in the site's own tokens (ink line, sky and paper fills), so it reads
  as part of the page rather than a picture dropped onto it. Decorative only:
  the headline beside it carries the meaning, so it is hidden from assistive
  tech.
*/

// [cx, cy, r] — rising from the uruli, spreading and growing as they climb.
const BUBBLES: ReadonlyArray<readonly [number, number, number]> = [
  [112, 296, 5], [150, 292, 4], [186, 298, 6], [130, 276, 7],
  [168, 268, 5], [98, 254, 8], [200, 256, 6], [142, 240, 9],
  [114, 216, 6], [182, 220, 10], [86, 190, 9], [156, 192, 7],
  [214, 194, 8], [124, 162, 11], [190, 154, 9], [74, 140, 7],
  [236, 132, 12], [158, 118, 8], [102, 100, 13], [204, 92, 10],
  [54, 80, 8], [260, 70, 9], [150, 58, 14], [216, 36, 11],
];

export default function HeroScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 420"
      aria-hidden="true"
      focusable="false"
      className={`stroke-ink ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Counter */}
      <path d="M16 378 H464" />
      <path d="M48 392 H432" className="stroke-line" />

      {/* Standing plate, behind everything */}
      <circle cx="330" cy="250" r="78" className="fill-paper" />
      <circle cx="330" cy="250" r="58" strokeWidth={1.25} />

      {/* Uruli: wide, shallow, two ring handles */}
      <circle cx="40" cy="326" r="9" />
      <circle cx="240" cy="326" r="9" />
      <path d="M46 318 C50 360 90 378 140 378 C190 378 230 360 234 318" className="fill-sky" />
      <ellipse cx="140" cy="318" rx="94" ry="14" className="fill-paper" />
      <ellipse cx="140" cy="319" rx="78" ry="8" className="fill-sky" strokeWidth={1.25} />
      <path d="M92 319 C102 315 110 323 120 319 S138 315 148 319 S166 323 176 319" strokeWidth={1.25} />

      {/* Kindi: round body, tall neck, spout reaching left */}
      <path d="M292 342 C276 336 268 318 262 298" />
      <path d="M298 356 C272 350 258 328 254 300" />
      <path d="M262 298 L254 300" />
      <path d="M296 378 C284 350 290 326 312 314 L348 314 C370 326 376 350 364 378 Z" className="fill-paper" />
      <path d="M289 352 C310 358 350 358 371 352" strokeWidth={1.25} />
      <path d="M316 314 L320 264 L340 264 L344 314" className="fill-paper" />
      <ellipse cx="330" cy="263" rx="18" ry="5" className="fill-paper" />

      {/* Steel tumbler */}
      <path d="M396 298 L444 298 L438 378 L402 378 Z" className="fill-paper" />
      <ellipse cx="420" cy="298" rx="24" ry="5" className="fill-paper" />
      <path d="M399 332 H441" strokeWidth={1.25} />

      {/* 24 bubbles */}
      {BUBBLES.map(([cx, cy, r], index) => (
        <g
          key={index}
          className="animate-drift"
          style={{ animationDelay: `${(index % 6) * -0.7}s` }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            className={index % 5 === 2 ? 'fill-sky' : 'fill-paper'}
            strokeWidth={1.5}
          />
          {r >= 8 && (
            <path
              d={`M${cx - r * 0.55} ${cy - r * 0.1} A${r * 0.6} ${r * 0.6} 0 0 1 ${cx - r * 0.1} ${cy - r * 0.55}`}
              strokeWidth={1.25}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
