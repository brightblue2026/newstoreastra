/*
  One line drawing per catalogue segment, keyed by the top-level category
  slug (seed.ts derives those slugs from the Segment enum). Same drawing
  language as the hero: ink line, sky and paper fills, no brand accent.

  A slug with no drawing renders nothing rather than a generic stand-in.
*/

const sparkle = (x: number, y: number, s = 1) =>
  `M${x} ${y - 10 * s} L${x + 2.6 * s} ${y - 2.6 * s} L${x + 10 * s} ${y} L${x + 2.6 * s} ${y + 2.6 * s} L${x} ${y + 10 * s} L${x - 2.6 * s} ${y + 2.6 * s} L${x - 10 * s} ${y} L${x - 2.6 * s} ${y - 2.6 * s} Z`;

const DRAWINGS: Record<string, React.ReactNode> = {
  'dish-care': (
    <>
      <ellipse cx="80" cy="128" rx="52" ry="10" className="fill-paper" />
      <ellipse cx="80" cy="116" rx="52" ry="10" className="fill-sky" />
      <ellipse cx="80" cy="104" rx="52" ry="10" className="fill-paper" />
      <ellipse cx="80" cy="104" rx="34" ry="5" strokeWidth={1.25} />
      <circle cx="58" cy="70" r="9" className="fill-paper" />
      <circle cx="86" cy="56" r="13" className="fill-sky" />
      <circle cx="112" cy="74" r="7" className="fill-paper" />
      <circle cx="104" cy="34" r="6" className="fill-paper" />
    </>
  ),
  'fabric-care': (
    <>
      <path
        d="M58 40 L40 48 L22 74 L42 86 L50 74 L50 138 L110 138 L110 74 L118 86 L138 74 L120 48 L102 40 C98 54 62 54 58 40 Z"
        className="fill-sky"
      />
      <path d="M50 74 L50 60" strokeWidth={1.25} />
      <path d="M110 74 L110 60" strokeWidth={1.25} />
      <path d={sparkle(134, 30)} className="fill-paper" />
      <path d={sparkle(26, 118, 0.6)} className="fill-paper" />
    </>
  ),
  'home-care': (
    <>
      <path d="M112 18 L76 112" />
      <path d="M44 112 L104 112 L112 132 L36 132 Z" className="fill-sky" />
      <path d="M50 132 V140 M62 132 V142 M74 132 V140 M86 132 V142 M98 132 V140" strokeWidth={1.25} />
      <path d="M8 146 H152" />
      <path d={sparkle(130, 70)} className="fill-paper" />
      <path d={sparkle(30, 80, 0.6)} className="fill-paper" />
    </>
  ),
  'personal-care': (
    <>
      <path d="M80 48 V34 H112 V40" />
      <rect x="70" y="46" width="20" height="16" rx="3" className="fill-paper" />
      <rect x="50" y="62" width="60" height="78" rx="12" className="fill-paper" />
      <rect x="62" y="82" width="36" height="34" rx="4" className="fill-sky" />
      <circle cx="128" cy="96" r="8" className="fill-paper" />
      <circle cx="138" cy="118" r="5" className="fill-sky" />
      <circle cx="32" cy="76" r="6" className="fill-paper" />
    </>
  ),
  'car-care': (
    <>
      <path
        d="M14 118 L18 98 C22 92 34 90 44 90 L60 72 C64 68 70 66 78 66 L104 66 C112 66 118 70 122 76 L132 90 C142 92 148 96 148 106 L148 118 Z"
        className="fill-sky"
      />
      <path d="M64 90 L74 76 H96 V90 Z" className="fill-paper" strokeWidth={1.5} />
      <path d="M102 90 V76 H114 L122 90 Z" className="fill-paper" strokeWidth={1.5} />
      <circle cx="46" cy="120" r="14" className="fill-paper" />
      <circle cx="46" cy="120" r="5" />
      <circle cx="118" cy="120" r="14" className="fill-paper" />
      <circle cx="118" cy="120" r="5" />
      <path d="M8 140 H152" />
      <path d={sparkle(132, 38)} className="fill-paper" />
    </>
  ),
  beverage: (
    <>
      <path d="M68 28 C62 20 74 14 68 6" strokeWidth={1.5} />
      <path d="M82 34 C76 24 88 18 82 8" strokeWidth={1.5} />
      <path d="M96 28 C90 20 102 14 96 6" strokeWidth={1.5} />
      <path d="M52 50 L108 50 L100 138 L60 138 Z" className="fill-paper" />
      <path d="M55 78 L105 78 L100 138 L60 138 Z" className="fill-sky" />
      <path d="M54 64 H106" strokeWidth={1.25} />
      <path d="M40 146 H120" />
      <path d="M122 132 C120 112 132 100 148 98 C150 116 140 130 122 132 Z" className="fill-paper" />
      <path d="M122 132 L140 108" strokeWidth={1.25} />
    </>
  ),
  food: (
    <>
      <rect x="54" y="40" width="52" height="14" rx="3" className="fill-paper" />
      <path
        d="M58 54 H102 V62 C122 72 126 96 122 120 C120 132 112 140 100 140 H60 C48 140 40 132 38 120 C34 96 38 72 58 62 Z"
        className="fill-sky"
      />
      <path d="M58 62 H102" strokeWidth={1.25} />
      <rect x="62" y="88" width="36" height="28" rx="4" className="fill-paper" />
      <path d="M130 44 C142 50 146 66 136 80" />
      <path d="M130 44 L126 36" />
    </>
  ),
  fragrance: (
    <>
      <path d="M80 58 C64 50 66 28 80 18 C94 28 96 50 80 58 Z" className="fill-paper" />
      <rect x="72" y="58" width="16" height="14" rx="2" className="fill-paper" />
      <path
        d="M80 72 C104 72 118 88 118 106 C118 126 102 140 80 140 C58 140 42 126 42 106 C42 88 56 72 80 72 Z"
        className="fill-sky"
      />
      <path d="M58 100 C66 90 94 90 102 100" strokeWidth={1.25} />
      <path d={sparkle(128, 44, 0.8)} className="fill-paper" />
      <path d={sparkle(34, 56, 0.6)} className="fill-paper" />
    </>
  ),
};

export default function SegmentArt({ slug, className = '' }: { slug: string; className?: string }) {
  const drawing = DRAWINGS[slug];
  if (!drawing) return null;

  return (
    <svg
      viewBox="0 0 160 160"
      aria-hidden="true"
      focusable="false"
      className={`stroke-ink ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing}
    </svg>
  );
}
