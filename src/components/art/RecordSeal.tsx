/*
  A rosette for the record section. The scalloped edge has 24 lobes — one per
  MX-3 fragrance, the same count as the hero's bubbles.

  This is a drawn seal, not the International Book of Records' own logo;
  the section's text states the record, and the seal is decoration beside it.
*/

const CX = 120;
const CY = 120;

function scallopPath(lobes: number, radius: number, depth: number): string {
  const steps = lobes * 12;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = radius + depth * Math.cos(theta * lobes);
    points.push(`${(CX + r * Math.cos(theta)).toFixed(2)} ${(CY + r * Math.sin(theta)).toFixed(2)}`);
  }
  return `M${points.join(' L')} Z`;
}

const SCALLOP = scallopPath(24, 102, 5);

export default function RecordSeal({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 290"
      aria-hidden="true"
      focusable="false"
      className={`stroke-ink ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <defs>
        <path id="bb-seal-arc" d={`M${CX} ${CY + 70} a70 70 0 1 1 0.01 0`} />
      </defs>

      {/* Ribbon tails, behind the seal */}
      <path d="M86 190 L70 280 L90 266 L104 282 L116 204 Z" className="fill-ink" />
      <path d="M154 190 L170 280 L150 266 L136 282 L124 204 Z" className="fill-ink" />

      <path d={SCALLOP} className="fill-paper" />
      <circle cx={CX} cy={CY} r="86" />
      <circle cx={CX} cy={CY} r="56" strokeWidth={1.25} />

      <text className="fill-ink stroke-none font-body" fontSize="11" letterSpacing="1.2">
        {/* The arc starts at the bottom; stopping short of the full 440
            leaves a gap there, above the ribbons, instead of a collision. */}
        <textPath href="#bb-seal-arc" startOffset="30" textLength="380" lengthAdjust="spacing">
          International Book of Records · MX-3 dishwash
        </textPath>
      </text>

      <text
        x={CX}
        y={CY + 14}
        textAnchor="middle"
        className="fill-ink stroke-none font-display"
        fontSize="52"
        fontWeight="600"
      >
        24
      </text>
      <text
        x={CX}
        y={CY + 34}
        textAnchor="middle"
        className="fill-ink stroke-none font-body"
        fontSize="12"
      >
        fragrances
      </text>
    </svg>
  );
}
