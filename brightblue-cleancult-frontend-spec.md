# Cleancult teardown → BrightBlue frontend + motion spec

Reference: cleancult.com · Target: brightblue.in (store) + brightblue.vercel.app (brand)
Hand this file to Claude Code as the design/motion brief.

---

## PART 1 — What Cleancult actually is, under the hood

### Stack (confirmed from the live site)

| Layer | What they use | Evidence |
|---|---|---|
| Framework | **Next.js, Pages Router** | `<meta name="next-head-count">` is emitted by `next/head`, which only the Pages Router uses |
| CMS | **Contentful** | every image is `images.ctfassets.net/1s5kub6totmj/...` — that's their Contentful space ID |
| Images | **next/image** with Contentful loader | URLs carry `?w=640&q=75&fm=webp`, and the same asset is emitted at 640 / 750 / 828 / 1080 / 1200 — those are Next's default `deviceSizes` |
| OG images | **dynamic, generated per route** | `og:image` = `/api/images/og?slug=/refill-ritual` — a Next API route rendering OG cards on the fly |
| PWA shell | `apple-mobile-web-app-capable`, `application-name`, `msapplication-TileColor`, `theme-color: #001F60` | installable-app meta set |
| Viewport | `user-scalable=no, minimum-scale=1` | app-like feel (don't copy this one — see accessibility note at the end) |
| Commerce | headless — Shopify/Recharge-style cart drawer, not a themed storefront | two `Open cart` triggers (desktop + mobile), client-side cart |

**The single most important structural fact:** the marketing pages are 100% CMS-driven. Every hero, badge, "cloud content" cutout, and alternating image/text block is a Contentful entry rendered by a small set of repeated React section components. That's *why* the site can look rich without being hand-coded per page — and it's exactly the model you want, because your admin panel already needs to manage products, offers, discounts and combos. Same idea, extended to homepage sections.

### The design system they're running

- **Base:** deep navy `#001F60` (their own declared theme color) against white and pale sky.
- **Motif:** sky / clouds / "heavenly." Product cutouts float on cloud PNGs with soft drop shadows. Everything is a cutout on a flat colour field — no photographic backgrounds.
- **Type:** heavy all-caps condensed display (`ENOUGH OF THE PLASTIC`) deliberately colliding with a lowercase script/serif word (`Brainwashing`, `Cleaner`, `Our Story`). That mixed-case collision *is* their signature. Two type registers doing two different jobs in the same sentence.
- **Voice:** short, confident, slightly cheeky. `Refill not landfill.` `None of the harsh stuff.` `Smells like Clean Spirit.` Every feature is a 2–5 word claim + a 1-line explainer. Never a paragraph in a card.
- **Trust row:** four icon badges immediately under the hero — `RECYCLABLE PAPER BASED REFILLS`, `FREE FROM HARSH CHEMICALS`, `POWERFUL FORMULAS`, `ETERNAL ALUMINUM BOTTLES`. Claims before catalogue.

### Homepage section order (copy this skeleton exactly)

```
01  announcement ticker      "Powerful clean, now just a TARGET trip away"
02  sticky nav               logo centre-ish, Shop / Refill Ritual / Sustainability, Stores, Account, Cart
03  category pill row        Refills · Best Sellers · Hand Soaps · Dish · Laundry · Sprays · Toilet
04  hero                     one big image + one sentence + one button (SHOP NOW)
05  trust badge row          4 icons, all-caps micro labels
06  mission statement        floating cloud cutout + 3-sentence manifesto
07  ambient video            YouTube embed, controls=0 — plays as texture, not content
08  3-up value cards         "Born Again and Again" / "A Cleaner Kind Of Cult" / "Scent From The Heavens"
09  system explainer         big product image + 3 bullets + LEARN MORE
10  how it works (3 steps)   pour → recycle → sparkle, one photo each
11  our story                long-form founder narrative, editorial column
12  footer
```

Note what is **absent**: no product grid on the homepage, no prices, no reviews carousel above the fold. The homepage sells the *belief*; the shop page sells the *product*. That's the whole strategy.

---

## PART 2 — The animation inventory

This is the part you asked for. Below is every motion pattern this class of site runs, with the technique to build it. Cleancult is Next + React, so the idiomatic tool is **Motion (formerly Framer Motion)** plus **Lenis** for smooth scroll.

```bash
npm i motion lenis clsx
```

### Tier 1 — the ones that carry 80% of the feel

**A1. Announcement ticker (infinite marquee)**
Duplicate the content twice inside a flex row, translate `-50%` on a linear infinite loop. Pause on hover.

**A2. Sticky nav that changes state on scroll**
Above 40px: shrink height 88→64px, fade in a white background + hairline border, drop the shadow in. Hide on scroll-down, reveal on scroll-up (cheap and it always feels expensive).

**A3. Scroll reveal on every section**
`whileInView` with `once: true` and a `-100px` margin so it fires *before* the element is fully on screen. Fade + 24px rise + a very slight `scale: 0.98 → 1`. Never animate more than 24px — bigger and it reads as jank on mobile.

**A4. Staggered children**
Hero words, badge row, card grids: parent variant with `staggerChildren: 0.08`. This is the single highest-value trick. A row of 4 badges appearing one-by-one over 320ms reads as designed; all four at once reads as a template.

**A5. Ambient float on cutouts**
The cloud/product PNGs breathe: `y: [0, -12, 0]` over 6s, `repeat: Infinity`, `ease: "easeInOut"`, with a different `delay` per element so they desync. Costs nothing, makes a static PNG feel alive.

**A6. Scroll parallax**
`useScroll` + `useTransform` on the section container. Background cloud moves `y: 0 → -80`, foreground bottle moves `y: 0 → 40`. Two layers is enough; three is showing off.

### Tier 2 — the ones that make it look funded

**B1. Pinned "how it works" sequence**
Sticky the visual column for 300vh while the three step captions scroll past it, swapping the image at each threshold. This is the single most impressive scroll moment you can build.

**B2. Scroll-driven background colour**
Map scroll progress across a section to a background colour interpolation (navy → sky → cream). `useTransform(scrollYProgress, [0,0.5,1], [c1,c2,c3])` animates colour natively.

**B3. Product card hover**
Lift `y: -8`, scale the image `1 → 1.06`, and **swap to the second product photo** on hover with a crossfade. Add the "Quick add" button sliding up from the bottom of the card. This is the standard DTC card and it converts.

**B4. Cart drawer**
`AnimatePresence` → backdrop fades to `rgba(0,0,0,.35)` with `backdrop-blur`, panel springs in from the right (`x: 100% → 0`, spring stiffness 260, damping 30). Line items animate in/out with `layout` so removing one makes the rest slide up smoothly.

**B5. Fly-to-cart**
On "Add", clone the product image, `position: fixed`, animate it along a curve to the cart icon while shrinking to 0.2 scale, then bounce the cart badge. Pure delight, ~40 lines.

**B6. Number count-up**
`animate(0, 24, { onUpdate })` when the stat enters view. You have a real one: **24 fragrance variants of MX-3 — International Book of Records.** That number counting from 0 to 24 is your hero stat.

**B7. Page transitions**
`AnimatePresence mode="wait"` in the layout — 200ms fade-out, 300ms fade-in with a 12px rise. Keep it under 500ms total or navigation feels sticky.

**B8. Magnetic buttons**
Button translates up to 6px toward the cursor within a 24px radius, springs back on leave. Use on the primary CTA only.

### Tier 3 — texture

- Marquee of your 7 brand logos, slow, greyscale, colourising on hover.
- Text reveal by clipping each line in an `overflow-hidden` wrapper and translating `y: 100% → 0` per line, staggered 60ms. Use once — on the hero headline.
- Cursor-following blob on the hero, `mix-blend-mode: multiply`, heavily blurred. Desktop only.
- Accordion FAQ with `height: auto` layout animation.
- Skeleton shimmer on product grid while data loads.

---

## PART 3 — BrightBlue's translation

Don't clone their navy-and-clouds. Clone their **grammar**: flat colour fields, cutout products, claim-first copy, two colliding type registers, CMS-driven sections. Then run it in your own identity.

### Tokens

```css
:root {
  /* core — from the BB seal */
  --bb-navy:    #0A2472;   /* deep, the seal's outer ring */
  --bb-blue:    #1E6FD9;   /* the bright in Bright Blue — primary CTA */
  --bb-sky:     #DCEAFB;   /* section wash */
  --bb-paper:   #F7F5F0;   /* warm off-white, keeps it from feeling clinical */
  --bb-ink:     #0B1220;   /* body text, never pure black */

  /* 7 brand accents — one per house brand */
  --mx3:        #1E6FD9;   /* dish        */
  --rafasi:     #7C5CD6;   /* fabric      */
  --landfloro:  #14A38B;   /* floor       */
  --fairoze:    #E8617A;   /* personal    */
  --ansaf:      #F0A020;   /* car         */
  --ilfa:       #B4552A;   /* tea         */
  --kenzaniya:  #2F7D3A;   /* food        */
}
```

The 7-brand accent system is your equivalent of their cloud motif — it's the thing you have that they don't. Every category page, product card border, and nav hover state picks up its brand's colour. The homepage becomes a colour wheel of seven houses under one navy roof.

### Type

- **Display:** a heavy grotesque with real width — Archivo Black, Anton, or Clash Display. All-caps, tight tracking (`-0.02em`).
- **Collision face:** one warm humanist italic or script for the single emphasised word, mid-headline. This is the Cleancult trick and it's free.
- **Body:** Inter or General Sans, 17px, `line-height: 1.6`.
- **Utility:** same body face at 11px, `letter-spacing: .12em`, uppercase — for badge labels and eyebrows.

Headline pattern to use:
`24 SCENTS. ONE *obsession*.` — grotesque caps, italic serif on the one word.

### Motion tokens

```ts
export const ease = [0.22, 1, 0.36, 1] as const;   // expo-out, the DTC house curve
export const dur  = { fast: 0.25, base: 0.5, slow: 0.8 };
```

Everything on the site uses one of three durations and one curve. That consistency is what separates "designed" from "a pile of animations."

---

## PART 4 — Code you can paste

### `lib/motion.ts` — the primitives

```ts
"use client";
import type { Variants } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

export const stagger = (delay = 0, gap = 0.08): Variants => ({
  hidden: {},
  show: { transition: { delayChildren: delay, staggerChildren: gap } },
});

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.5, ease } },
};

// use on every section wrapper
export const inView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "-100px" },
} as const;
```

### `components/Reveal.tsx`

```tsx
"use client";
import { motion } from "motion/react";
import { fadeUp, stagger, inView } from "@/lib/motion";

export function Reveal({ children, gap = 0.08, className = "" }) {
  return (
    <motion.div variants={stagger(0, gap)} {...inView} className={className}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className = "" }) {
  return <motion.div variants={fadeUp} className={className}>{children}</motion.div>;
}
```

Usage — the badge row, in four lines:

```tsx
<Reveal className="grid grid-cols-2 md:grid-cols-4 gap-6">
  {badges.map(b => (
    <RevealItem key={b.id}><Badge {...b} /></RevealItem>
  ))}
</Reveal>
```

### `components/SmoothScroll.tsx` — Lenis

```tsx
"use client";
import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let id: number;
    const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf); };
    id = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(id); lenis.destroy(); };
  }, []);
  return null;
}
```

Mount once in `app/layout.tsx`. Every scroll-triggered animation on the site inherits its quality from this — it's the highest leverage 20 lines in the build.

### `components/Ticker.tsx` — announcement marquee

```tsx
"use client";
import { motion } from "motion/react";

export default function Ticker({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden bg-[var(--bb-navy)] text-white text-[11px] tracking-[.12em] uppercase py-2.5">
      <motion.div
        className="flex gap-12 w-max"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
      >
        {row.map((t, i) => <span key={i} className="whitespace-nowrap">{t}</span>)}
      </motion.div>
    </div>
  );
}
```

Feed it: `["Free delivery over ₹499", "24 fragrances · MX-3", "7 brands, one factory", "International Book of Records holder"]`

### `components/Nav.tsx` — shrink + hide-on-scroll

```tsx
"use client";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";

export default function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid]   = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setSolid(y > 40);
    setHidden(y > prev && y > 200);
  });

  return (
    <motion.header
      animate={{
        y: hidden ? "-100%" : 0,
        height: solid ? 64 : 88,
        backgroundColor: solid ? "rgba(255,255,255,.92)" : "rgba(255,255,255,0)",
        boxShadow: solid ? "0 1px 0 rgba(10,36,114,.10)" : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 flex items-center backdrop-blur-md"
    >
      {/* logo · links · stores · account · cart */}
    </motion.header>
  );
}
```

### `components/FloatCutout.tsx` — ambient float + parallax

```tsx
"use client";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import Image from "next/image";

export default function FloatCutout({ src, alt, depth = 60, delay = 0 }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [depth, -depth]);

  return (
    <motion.div ref={ref} style={{ y }}>
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, delay, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image src={src} alt={alt} width={640} height={640}
               className="drop-shadow-[0_24px_48px_rgba(10,36,114,.18)]" />
      </motion.div>
    </motion.div>
  );
}
```

Two nested motion divs: outer = scroll parallax, inner = idle breathing. They compose cleanly because each owns its own `y`.

### `components/ProductCard.tsx` — hover swap + quick add

```tsx
"use client";
import { motion } from "motion/react";
import { useState } from "react";
import Image from "next/image";

export default function ProductCard({ p, accent }) {
  const [hover, setHover] = useState(false);
  return (
    <motion.article
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-2xl bg-white p-4 border"
      style={{ borderColor: hover ? accent : "rgba(10,36,114,.08)" }}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--bb-sky)]">
        <motion.div animate={{ scale: hover ? 1.06 : 1 }} transition={{ duration: 0.5 }}
                    className="absolute inset-0">
          <Image src={p.image} alt={p.name} fill className="object-contain p-6" />
        </motion.div>
        {p.hoverImage && (
          <motion.div initial={false} animate={{ opacity: hover ? 1 : 0 }}
                      transition={{ duration: 0.35 }} className="absolute inset-0">
            <Image src={p.hoverImage} alt="" fill className="object-contain p-6" />
          </motion.div>
        )}
        <motion.button
          initial={false}
          animate={{ y: hover ? 0 : 56, opacity: hover ? 1 : 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-3 bottom-3 rounded-full py-3 text-white text-sm font-semibold"
          style={{ background: accent }}
        >
          Quick add
        </motion.button>
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[.12em]" style={{ color: accent }}>
        {p.brand}
      </p>
      <h3 className="mt-1 font-semibold">{p.name}</h3>
      <p className="text-sm opacity-70">₹{p.price}{p.mrp > p.price && (
        <s className="ml-2 opacity-50">₹{p.mrp}</s>)}</p>
    </motion.article>
  );
}
```

`accent` comes from the product's brand — MX-3 cards glow blue, Fairoze pink, Ilfa Valley clay. That's your signature interaction.

### `components/CartDrawer.tsx`

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";

export default function CartDrawer({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed right-0 top-0 z-[70] h-dvh w-full max-w-md bg-white flex flex-col"
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

Wrap each line item in `<motion.div layout exit={{ opacity: 0, x: 40 }}>` so removals slide the rest up.

### `components/PinnedSteps.tsx` — the showpiece

```tsx
"use client";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import Image from "next/image";

export default function PinnedSteps({ steps }) {           // steps: [{img, title, body}]
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  return (
    <section ref={ref} className="relative" style={{ height: `${steps.length * 100}vh` }}>
      <div className="sticky top-0 h-dvh grid md:grid-cols-2 items-center gap-10 px-6">
        <div className="relative aspect-square">
          {steps.map((s, i) => {
            const seg = 1 / steps.length;
            const opacity = useTransform(
              scrollYProgress,
              [i * seg - 0.08, i * seg + 0.06, (i + 1) * seg - 0.06, (i + 1) * seg + 0.08],
              [0, 1, 1, 0]
            );
            const scale = useTransform(
              scrollYProgress, [i * seg, (i + 1) * seg], [1.04, 0.98]
            );
            return (
              <motion.div key={i} style={{ opacity, scale }} className="absolute inset-0">
                <Image src={s.img} alt={s.title} fill className="object-contain" />
              </motion.div>
            );
          })}
        </div>
        <div className="space-y-16">
          {steps.map((s, i) => (
            <motion.div key={i}
              initial={{ opacity: 0.25 }} whileInView={{ opacity: 1 }}
              viewport={{ margin: "-45% 0px -45% 0px" }}>
              <span className="text-[11px] tracking-[.12em] text-[var(--bb-blue)]">
                STEP {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-3xl font-black uppercase">{s.title}</h3>
              <p className="mt-2 opacity-70 max-w-sm">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

> Hooks-in-a-loop: fine here because `steps.length` is fixed per render. If it can change, hoist each step into its own child component.

### `components/CountUp.tsx` — your 24-fragrance stat

```tsx
"use client";
import { animate, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

export default function CountUp({ to = 24, suffix = "" }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.22, 1, 0.36, 1],
                               onUpdate: v => setN(Math.round(v)) });
    return () => c.stop();
  }, [seen, to]);
  return <span ref={ref} className="tabular-nums">{n}{suffix}</span>;
}
```

---

## PART 5 — Homepage build order for BrightBlue

Same skeleton as Cleancult, your content:

```
01  Ticker            free delivery · 24 fragrances · 7 brands · Book of Records
02  Nav               sticky shrink, mega-menu by brand (7 columns, each in its accent)
03  Brand pill row    MX-3 · Rafasi · Landfloro · Fairoze · ANSAF · Ilfa Valley · Kenzaniya
04  Hero              headline with the italic collision word + FloatCutout of the MX-3 lineup
                      + magnetic "Shop all" CTA
05  Record band       CountUp to 24 — "fragrance variants of one dishwash. A world record."
                      This is your hero stat and nobody else in Indian FMCG has it.
06  Trust badges      Made in Palakkad · 7 brands, one factory · Toll-free 1800 123 0621 · Bulk & distributor pricing
07  The 7 houses      7 cards, each in its accent, scroll-staggered. The colour wheel moment.
08  PinnedSteps       "From our floor to yours" — formulate → fill → dispatch → your shelf
09  Best sellers      ProductCard grid, live from the admin panel
10  Combos & offers   horizontal snap-scroll carousel, admin-managed
11  Our story         Bright Blue Manufacturing, Palakkad — editorial column, generous measure
12  Footer            brands, policies, GST 32AAICB5392H1ZN, contact
```

**Section 07 is your signature.** Seven brand cards, each entering with a 0.08s stagger, each carrying its own accent, each hovering to reveal its category and product count. It embodies the actual business — one company, seven houses — in a way a cloud motif never could for you.

---

## PART 6 — The prompt for Claude Code

> Build the BrightBlue storefront homepage in the existing Next.js App Router + Tailwind project.
>
> Install `motion`, `lenis`. Create `lib/motion.ts` with the shared `ease`/`fadeUp`/`stagger`/`inView` primitives, and `components/SmoothScroll.tsx` mounted in the root layout.
>
> Add the CSS custom properties from the token block to `globals.css` and expose them in `tailwind.config.ts` as `bb-navy`, `bb-blue`, `bb-sky`, `bb-paper`, `bb-ink` plus the seven brand accents.
>
> Build these components: `Ticker`, `Nav` (shrink + hide-on-scroll + 7-column brand mega-menu), `FloatCutout`, `Reveal`/`RevealItem`, `ProductCard` (hover lift + image swap + quick add, accent driven by `product.brand`), `CartDrawer` (AnimatePresence, spring from right, `layout` line items), `PinnedSteps`, `CountUp`, `MagneticButton`.
>
> Assemble the homepage in the section order above. Every section wraps in `Reveal`. Every animation uses the shared `ease` and one of the three durations — no ad-hoc timings.
>
> Homepage sections must read from the same data layer as the admin panel: a `sections` collection with a `type` discriminator, so hero copy, badges, and offer rails are editable without a deploy. Products, offers, discounts and combos come from the existing product API.
>
> Non-negotiables: wrap all scroll and loop animations in a `prefers-reduced-motion` check; keyboard focus rings visible on every interactive element; the cart drawer traps focus and closes on Escape; do not set `user-scalable=no`; all images through `next/image` with explicit sizes; Lighthouse mobile performance ≥ 85.

---

## Two notes before you start

**Copy the mechanics, not the artefacts.** Section architecture, motion timings, and interaction patterns are the transferable craft, and they're what actually makes cleancult.com feel the way it does. Their illustrations, cloud PNGs, and copy lines ("refill not landfill", "Smells like Clean Spirit") are theirs — you'll want your own illustrator or cutouts anyway, because the seven-brand colour system needs art that Cleancult's palette wouldn't fit.

**Their viewport meta is a mistake, don't inherit it.** `user-scalable=no, minimum-scale=1` blocks pinch-zoom. It's an accessibility failure and Lighthouse flags it. Use `width=device-width, initial-scale=1` and nothing else.
