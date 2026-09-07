import type { Metadata } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';

import './globals.css';

/*
 * Atkinson Hyperlegible was designed by the Braille Institute specifically to
 * increase legibility for low-vision readers: its letterforms are drawn so that
 * commonly-confused pairs (I/l/1, O/0, b/d) stay distinct at small sizes and
 * low contrast. For a product whose whole audience is students with visual
 * impairment and their families, it is the correct default.
 */
const atkinson = Atkinson_Hyperlegible({
  variable: '--font-atkinson',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Taali — certificates that speak',
    // Applies to the admin side only. Certificate pages set an absolute title
    // naming the student and the presenting organisation, because a family
    // opening one should see whose award it is, not which tool produced it.
    template: '%s — Taali',
  },
  description:
    'Taali makes certificates that speak — the award read aloud, with the applause it was given. Built for people who are visually impaired.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${atkinson.variable} h-full`}>
      {/*
        Grammarly and similar extensions write their own attributes onto <body>
        (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded`) before React
        hydrates, which React reports as a hydration mismatch on every page.
        Suppression applies to this element only, not its descendants, so a real
        mismatch anywhere inside the app is still reported.
      */}
      <body
        className="flex min-h-full flex-col bg-paper text-ink antialiased"
        suppressHydrationWarning
      >
        <a
          href="#main"
          className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-teal-900 px-4 py-2 font-bold text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
