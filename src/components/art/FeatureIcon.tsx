/*
  Small line icons for the homepage "why buy here" row and the support band.
  48px grid, 2px ink stroke, one sky fill — the hero's language at icon size.
*/

export type FeatureIconName = 'fragrance' | 'certified' | 'combo' | 'payment' | 'maker' | 'delivery' | 'phone';

const ICONS: Record<FeatureIconName, React.ReactNode> = {
  fragrance: (
    <>
      <rect x="15" y="26" width="18" height="16" rx="4" className="fill-sky" />
      <path d="M21 26 V21 H27 V26" />
      <path d="M12 14 C15 11 18 17 21 14 S27 11 30 14 S36 17 39 14" strokeWidth={1.5} />
      <path d="M16 7 C19 4 22 10 25 7 S31 4 34 7" strokeWidth={1.5} />
    </>
  ),
  certified: (
    <>
      <path d="M17 30 L13 44 L19 41 L22 46 L24 33" />
      <path d="M31 30 L35 44 L29 41 L26 46 L24 33" />
      <circle cx="24" cy="20" r="14" className="fill-sky" />
      <path d="M18 20 L22 24 L30 16" />
    </>
  ),
  combo: (
    <>
      <path d="M10 42 V20 C10 16 12 14 15 14 H19 C22 14 24 16 24 20 V42 Z" className="fill-sky" />
      <path d="M14 14 V8 H20 V14" />
      <path d="M24 42 V24 C24 20 26 18 29 18 H33 C36 18 38 20 38 24 V42 Z" className="fill-paper" />
      <path d="M28 18 V12 H34 V18" />
      <path d="M6 42 H42" />
    </>
  ),
  payment: (
    <>
      <rect x="5" y="11" width="38" height="26" rx="4" className="fill-sky" />
      <path d="M5 19 H43" />
      <rect x="10" y="25" width="10" height="6" rx="1.5" className="fill-paper" />
      <path d="M30 29 H38" />
    </>
  ),
  maker: (
    <>
      <path d="M6 22 L6 14 L16 22 L16 14 L26 22 L26 14 L36 22 Z" className="fill-sky" />
      <rect x="34" y="8" width="6" height="14" />
      <rect x="6" y="22" width="36" height="20" className="fill-paper" />
      <path d="M21 42 V32 H27 V42" />
    </>
  ),
  delivery: (
    <>
      <path d="M8 15 L24 7 L40 15 V33 L24 41 L8 33 Z" className="fill-sky" />
      <path d="M8 15 L24 23 L40 15" />
      <path d="M24 23 V41" />
      <path d="M16 11 L32 19 V25" strokeWidth={1.5} />
    </>
  ),
  phone: (
    <>
      <path
        d="M14 6 H20 L23 15 L18 19 C20 24 24 28 29 30 L33 25 L42 28 V34 C42 38 39 42 35 42 C19 41 7 29 6 13 C6 9 10 6 14 6 Z"
        className="fill-sky"
      />
    </>
  ),
};

export default function FeatureIcon({ name, className = '' }: { name: FeatureIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={`stroke-ink ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}
