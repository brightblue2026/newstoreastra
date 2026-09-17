---
name: ui-polish
description: Systematic visual QA and fixing for the Bright Blue storefront and admin. Use whenever changing layout, spacing, typography, animation or responsive behaviour, and whenever fixing misaligned text, uneven columns, inconsistent gaps, clipped type, overflow or any "small UI issue".
---

# UI polish

Small visual bugs almost always come from a missing system: no shared container, no spacing scale, no type scale, or conflicting CSS. Fix the system, then the symptom disappears everywhere.

## Process

1. **See it first.** Take Playwright screenshots of the affected pages at 360, 390, 768, 1024, 1280 and 1536 px. Use full-page screenshots. Never fix a visual bug you haven't looked at.
2. **List issues before fixing.** For each: page, breakpoint, element, what's wrong, likely root cause, severity (broken / noticeable / nitpick).
3. **Find the root cause.** Check in this order: container and grid, spacing tokens, type tokens, component props, CSS specificity or class conflicts, content length.
4. **Fix at the lowest shared level.** Prefer a token or shared component change over a page-specific override.
5. **Re-screenshot at all widths** and compare with the originals. Check that the fix didn't break another page using the same component.
6. **Report** before/after pairs and anything you chose not to change.

## Checklist

### Container and grid
- One `Container` component with a single max-width and gutter scale. Every section's content starts at the same left edge.
- Adjacent sections that show columns (stats rows, tables, card grids) share the same column lines.
- Equal columns use `grid-template-columns: repeat(n, minmax(0, 1fr))`. `minmax(0, …)` stops long words from widening a column.
- Tables with equal columns use `table-layout: fixed`. Wide tables scroll inside their own `overflow-x: auto` wrapper; the page body never scrolls sideways.
- Dividers and backgrounds are either full-bleed or contained, consistently.

### Spacing
- A spacing scale on a 4 px base, exposed as tokens. Section vertical padding uses 2–3 named sizes only (for example `section-sm`, `section-md`, `section-lg`), responsive.
- Top and bottom padding of a band are equal unless there's a deliberate reason.
- Check for doubled gaps: section padding + margin on the first/last child + a divider with its own margin.
- Watch margin collapse and `space-y` utilities stacking with explicit margins.

### Typography
- A type scale as tokens (size, line-height, letter-spacing, weight). No arbitrary font sizes in components.
- Body copy line length 45–75 characters (`max-width: 65ch` is a good default).
- Mixed sizes on one line (a big number next to a headline, a price next to a strike-through MRP) use `align-items: baseline`, not `center`.
- Display type with tight line-height: confirm ascenders, descenders and accents aren't clipped, especially inside `overflow: hidden` animation wrappers.
- Headings use `text-wrap: balance`; paragraphs use `text-wrap: pretty`. No single-word last lines in headings.
- Columns of short descriptions share a max width so they wrap evenly.
- Numbers in tables and prices use `font-variant-numeric: tabular-nums`, right-aligned.
- Web fonts load with `next/font` (or equivalent) and a fallback with matched metrics, so text doesn't jump.

### Alignment details
- Icon + text pairs: icon centred on the text's x-height, fixed icon size, consistent gap.
- Button labels vertically centred; buttons in a row share height.
- Form labels, inputs and helper text share a left edge.
- Cards in a row have equal height and their CTAs align to the bottom.

### Responsive
- No horizontal scroll at 360 px. Find offenders with a quick script that flags elements wider than the viewport.
- Tap targets at least 44 × 44 px.
- Fixed pixel widths and heights on text containers are a bug waiting to happen; use max-width and let height follow content.
- Images use `aspect-ratio` or explicit dimensions and `object-fit`, with correct `sizes` so nothing shifts on load.

### States
- Every interactive element has hover, `:focus-visible`, active and disabled styles. Focus rings are visible on both the navy and the light backgrounds.
- Loading uses skeletons that match final layout dimensions. Empty and error states exist.

### Colour and contrast
- Body text 4.5:1 minimum, large text 3:1, including text on the light-blue band and the cream background.
- Status is never shown by colour alone.

### Motion (cleancult-style animations)
- Animations use transform and opacity only, never properties that trigger layout.
- Elements reserve their final space before animating in: no layout shift.
- Respect `prefers-reduced-motion` with an instant, non-animated fallback.
- Scroll-triggered reveals don't leave content invisible if JS fails or the observer never fires.

### CSS hygiene
- In Tailwind, merge classes with `tailwind-merge` / a `cn()` helper so later classes actually win.
- No `!important`, no magic-number margins, no negative margins used to "nudge" alignment.
- A z-index scale as tokens (base, dropdown, sticky, overlay, modal, toast).
- One radius scale and one shadow scale, applied by component role.

## Report format

```
## UI issues — <page>
| # | Breakpoint | Element | Problem | Root cause | Fix | Status |
```
Attach before/after screenshots from `/qa/screenshots/<page>/<width>-before.png` and `-after.png`.
