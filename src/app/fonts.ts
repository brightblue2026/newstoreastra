import localFont from 'next/font/local';
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google';

/**
 * Display face. Only the two weights the design system uses are shipped —
 * Medium 500 and Semibold 600. Adding more is a design decision, not a
 * convenience.
 */
export const clashDisplay = localFont({
  src: [
    { path: './fonts/ClashDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ClashDisplay-Semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

/** Body face. Regular, Medium and Bold. */
export const satoshi = localFont({
  src: [
    { path: './fonts/Satoshi-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Satoshi-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Satoshi-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
  preload: true,
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

/**
 * Utility face — SKUs, order numbers, admin tabular figures. Served from our
 * own origin by next/font, not from Google's CDN.
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});

/**
 * Accent face — the true second type register for the hero's "collision"
 * word (§9 / DECISIONS.md). A high-contrast didone italic against Clash
 * Display's heavy grotesque and Satoshi's geometric sans, self-hosted by
 * next/font like JetBrains Mono. Used only on the emphasis word — never
 * body copy, never a heading.
 */
export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['italic'],
  variable: '--font-accent',
  display: 'swap',
  fallback: ['ui-serif', 'Georgia', 'serif'],
});

/** Every font variable, for the <html> class. */
export const fontVariables = [
  clashDisplay.variable,
  satoshi.variable,
  jetbrainsMono.variable,
  instrumentSerif.variable,
].join(' ');
