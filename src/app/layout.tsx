import type { Metadata, Viewport } from 'next';
import { fontVariables } from './fonts';
import SmoothScroll from '@/components/SmoothScroll';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Bright Blue',
    template: '%s · Bright Blue',
  },
  description:
    'Bright Blue Trading Corporation — home care, personal care and food, manufactured in Kerala since 2019.',
};

export const viewport: Viewport = {
  // BBTC's own declared theme colour, and the page background.
  themeColor: '#faf7f2',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        {/* Renders nothing; every scroll-driven animation inherits its feel
            from this. Opts itself out under prefers-reduced-motion. */}
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
