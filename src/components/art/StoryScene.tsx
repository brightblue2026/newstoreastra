/*
  The company story illustration: a sawtooth-roofed factory between two
  coconut palms, with bubbles where a chimney's smoke would be. Kerala, and
  a factory that makes soap, in one drawing.
*/

const BUBBLES: ReadonlyArray<readonly [number, number, number]> = [
  [338, 62, 6], [350, 44, 8], [334, 24, 5], [366, 22, 10], [388, 8, 6],
];

// A frond as a closed leaf: out along one curve, back along a second curve
// bowed a little further, so it reads as a leaf blade rather than a wire.
function frond(tx: number, ty: number, cx: number, cy: number, ex: number, ey: number): string {
  return `M${tx} ${ty} Q${cx} ${cy} ${ex} ${ey} Q${cx} ${cy + 14} ${tx} ${ty} Z`;
}

function Palm({ x, flip = false }: { x: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  const tx = x + s * 14;
  const ty = 120;
  return (
    <g>
      <path d={`M${x} 262 C${x + s * 6} 214 ${x - s * 4} 170 ${tx} ${ty}`} strokeWidth={3} />
      <path d={frond(tx, ty, tx - s * 34, ty - 30, tx - s * 62, ty + 4)} className="fill-paper" />
      <path d={frond(tx, ty, tx - s * 20, ty - 44, tx - s * 6, ty - 64)} className="fill-paper" />
      <path d={frond(tx, ty, tx + s * 24, ty - 44, tx + s * 50, ty - 40)} className="fill-paper" />
      <path d={frond(tx, ty, tx + s * 40, ty - 22, tx + s * 64, ty + 8)} className="fill-paper" />
      <path d={frond(tx, ty, tx + s * 26, ty - 2, tx + s * 36, ty + 34)} className="fill-paper" />
      <path d={frond(tx, ty, tx - s * 26, ty - 4, tx - s * 36, ty + 34)} className="fill-paper" />
      <circle cx={tx - s * 5} cy={ty + 7} r="5" className="fill-sky" />
      <circle cx={tx + s * 5} cy={ty + 9} r="5" className="fill-sky" />
    </g>
  );
}

export default function StoryScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 290"
      aria-hidden="true"
      focusable="false"
      className={`stroke-ink ${className}`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Hills */}
      <path d="M0 214 C70 186 130 204 190 190 S320 170 380 188 S450 200 480 194" className="stroke-line" />

      {/* Chimney, behind the roof */}
      <rect x="326" y="76" width="22" height="80" className="fill-paper" />

      {/* Factory */}
      <path d="M120 150 L120 108 L176 150 L176 108 L232 150 L232 108 L288 150 L288 108 L344 150 L344 150 Z" className="fill-paper" />
      <rect x="112" y="150" width="248" height="112" className="fill-paper" />
      {[136, 176, 216, 256, 296].map((x) => (
        <rect key={x} x={x} y="172" width="24" height="30" rx="2" strokeWidth={1.5} />
      ))}
      <path d="M322 262 V218 H346 V262" className="fill-sky" />
      <path d="M136 226 H296" strokeWidth={1.25} />

      {/* Bubbles in place of smoke */}
      {BUBBLES.map(([cx, cy, r], index) => (
        <g key={index} className="animate-drift" style={{ animationDelay: `${index * -0.8}s` }}>
          <circle cx={cx} cy={cy} r={r} className={index === 1 ? 'fill-sky' : 'fill-paper'} strokeWidth={1.5} />
        </g>
      ))}

      <Palm x={62} />
      <Palm x={420} flip />

      {/* Ground */}
      <path d="M8 262 H472" />
    </svg>
  );
}
