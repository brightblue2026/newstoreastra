/** Stable server markup; CSS handles motion preferences without hydration branches. */
export default function Ticker({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden bg-ink py-3 text-paper">
      <ul className="announcement-track flex w-max">
        {[...items, ...items].map((text, index) => (
          <li
            key={`${text}-${index}`}
            className="whitespace-nowrap type-caption"
            aria-hidden={index >= items.length ? true : undefined}
          >
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
