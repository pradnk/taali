import { cx } from '@/components/ui';

/**
 * The Taali mark: a burst of applause.
 *
 * Taali means applause, and applause is what this product is for -- so the mark
 * is a radial burst, which reads at once as a clap, a spark, sound radiating
 * outward, and an award rosette. Twelve rays alternating long and short give it
 * the rhythm of a waveform rather than the uniformity of a sunburst.
 *
 * Two details are load-bearing rather than decorative:
 *
 *   - The centre dot. Without it the ring of rays reads unmistakably as a
 *     loading spinner, and at favicon size it collapses into a fuzzy asterisk.
 *     The dot anchors the composition and turns it into a burst.
 *   - Alternating ray lengths. A rosette of equal rays is an asterisk; the
 *     long/short rhythm is what makes it look like sound.
 *
 * Drawn for where it actually has to survive: `currentColor` throughout so it
 * inherits text colour and stays visible in Windows High Contrast mode where
 * author colours are discarded; thick round-capped strokes and closed shapes,
 * no gradients or hairlines, so it holds up as a 16px favicon and on a
 * monochrome printer; and no text inside the artwork, so it never needs
 * translating.
 *
 * It is deliberately absent from certificates. A certificate belongs to the
 * student and the organisation presenting it, not to the software that made it.
 */

/** Twelve rays in one path: a single shape to recolour, and fewer nodes. */
const RAYS =
  'M16.00 9.60L16.00 3.00 M19.20 10.46L20.75 7.77 M21.54 12.80L27.26 9.50 ' +
  'M22.40 16.00L25.50 16.00 M21.54 19.20L27.26 22.50 M19.20 21.54L20.75 24.23 ' +
  'M16.00 22.40L16.00 29.00 M12.80 21.54L11.25 24.23 M10.46 19.20L4.74 22.50 ' +
  'M9.60 16.00L6.50 16.00 M10.46 12.80L4.74 9.50 M12.80 10.46L11.25 7.77';

export function TaaliMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx('size-8', className)}
      // Decorative by default: the wordmark beside it already says "Taali".
      // Pass a title only where the mark stands alone.
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={RAYS} stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.8" fill="currentColor" />
    </svg>
  );
}

/** The mark with the name beside it, for headers and sign-in. */
export function TaaliLogo({
  className,
  markClassName,
  showTagline,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <TaaliMark className={markClassName} />
      <span className="flex flex-col leading-none">
        <span className="font-bold tracking-tight">Taali</span>
        {showTagline && (
          <span className="mt-1.5 text-sm font-normal text-ink-soft">Certificates that speak</span>
        )}
      </span>
    </span>
  );
}
