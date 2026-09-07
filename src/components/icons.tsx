import { cx } from '@/components/ui';

/**
 * Interface icons.
 *
 * All decorative: every one of them sits next to a visible text label, so they
 * are `aria-hidden` and a screen reader reads only the word. An icon that
 * repeats its own label is noise, and an icon-only control would be worse still
 * for an audience that includes people using magnification.
 *
 * Drawn on a 24px grid in `currentColor` with round caps, matching the Taali
 * mark: they inherit text colour, survive Windows High Contrast mode where
 * author colours are dropped, and stay legible when the page is zoomed to 400%.
 */

function Icon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('size-5 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * Settings. Sliders rather than the more usual cog, deliberately: a cog is a
 * ring of radiating teeth, which at this size is very nearly the Taali mark
 * sitting a few centimetres away in the header. Sliders read as "adjust" just
 * as clearly and cannot be confused with the logo.
 */
export function SettingsIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
      <path d="M14 2v4M8 10v4M16 18v4" />
    </Icon>
  );
}

export function PrintIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7 8V3h10v5" />
      <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="7" rx="1" />
    </Icon>
  );
}

/** Recipients. A pair of figures, for the list of people on an event. */
export function PeopleIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M15 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.87M16.5 3.63a4 4 0 0 1 0 6.74" />
    </Icon>
  );
}
