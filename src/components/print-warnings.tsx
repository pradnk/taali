'use client';

import { useEffect, useState } from 'react';

import { isDeploymentSpecificHost } from '@/lib/env';

/**
 * Warnings shown above a print preview, never on the printed page.
 *
 * All of these catch mistakes that are invisible until the certificates are
 * already on paper and handed out, which is far too late.
 */
export function PrintWarnings({
  url,
  notReady,
}: {
  /** The address the QR codes encode. */
  url: string;
  /** Names whose audio has not been generated yet. */
  notReady: string[];
}) {
  const { overflowing, stubborn } = usePrintFit();
  const host = safeHost(url);

  // localhost resolves to whatever device is scanning, so the code can never
  // reach this machine. Always fatal.
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

  // A private network address does work -- for a phone on the same wifi, which
  // is how you would sensibly test a QR code before deploying. It just will not
  // work for a family at home, so it is a caution rather than a blocker.
  const isPrivateNetwork =
    !isLoopback &&
    (host.endsWith('.local') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host));

  // A Vercel address containing a build hash or a branch name belongs to one
  // deployment, not to the project. It works when you test it and 404s the next
  // time anyone deploys -- by which point the codes are printed and handed out.
  const isPerDeployment = !isLoopback && !isPrivateNetwork && isDeploymentSpecificHost(host);

  if (
    !isLoopback &&
    !isPrivateNetwork &&
    !isPerDeployment &&
    notReady.length === 0 &&
    overflowing.length === 0 &&
    stubborn.length === 0
  ) {
    return null;
  }

  return (
    <div className="print-hide mx-auto flex max-w-4xl flex-col gap-4 px-5 pb-6">
      {isLoopback && (
        <div
          role="alert"
          className="rounded-lg border-2 border-danger bg-danger-bg px-5 py-4 text-danger"
        >
          <p className="text-lg font-bold">Do not print — the QR codes cannot work.</p>
          <p className="mt-2">
            They point at <code className="font-mono font-bold">{url}</code>. A phone scanning that
            code looks for the address <em>on the phone itself</em>, so it will never find the
            certificate.
          </p>
          <p className="mt-2">
            Deploy the site and set{' '}
            <code className="font-mono font-bold">NEXT_PUBLIC_SITE_URL</code> to its public address,
            then reload this page. To test from a phone before deploying, set it to this computer&apos;s
            network address instead — something like{' '}
            <code className="font-mono font-bold">http://192.168.1.20:3000</code> — and keep the
            phone on the same wifi.
          </p>
        </div>
      )}

      {isPerDeployment && (
        <div
          role="alert"
          className="rounded-lg border-2 border-danger bg-danger-bg px-5 py-4 text-danger"
        >
          <p className="text-lg font-bold">Do not print — these QR codes will stop working.</p>
          <p className="mt-2">
            They point at <code className="font-mono font-bold">{host}</code>, which is the address
            of <em>one deployment</em> rather than of the site. The next time anyone deploys, that
            address disappears and every code printed today leads nowhere.
          </p>
          <p className="mt-2">
            Set <code className="font-mono font-bold">NEXT_PUBLIC_SITE_URL</code> to the project&apos;s
            permanent address — its custom domain, or the Vercel address without the
            deployment&apos;s own hash in it — then redeploy and reload this page.
          </p>
        </div>
      )}

      {isPrivateNetwork && (
        <div className="rounded-lg border-2 border-focus bg-teal-50 px-5 py-4">
          <p className="text-lg font-bold">These QR codes only work on this wifi network.</p>
          <p className="mt-2">
            They point at <code className="font-mono font-bold">{url}</code>, which is fine for
            testing with a phone on the same network, but a family opening it at home will get
            nothing. Deploy and set{' '}
            <code className="font-mono font-bold">NEXT_PUBLIC_SITE_URL</code> before printing the
            real certificates.
          </p>
        </div>
      )}

      {overflowing.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border-2 border-danger bg-danger-bg px-5 py-4 text-danger"
        >
          <p className="text-lg font-bold">
            {overflowing.length} certificate{overflowing.length === 1 ? '' : 's'} will not fit on
            one sheet.
          </p>
          <p className="mt-2">
            Taali has already squeezed the type as far as it will go without the sheet looking
            unlike the rest of the pile, and {overflowing.length === 1 ? 'this one is' : 'these are'}{' '}
            still over. Most often it is a name long enough to wrap onto a second line, which costs
            more room than anything else on the sheet; a long description or a long paragraph in the
            printed wording can do it too. Shorten those on the recipients page or in Settings.
          </p>
          <p className="mt-2 font-bold">{overflowing.join(', ')}</p>
        </div>
      )}

      {stubborn.length > 0 && (
        <div className="rounded-lg border-2 border-focus bg-teal-50 px-5 py-4">
          <p className="text-lg font-bold">
            {stubborn.length} line{stubborn.length === 1 ? '' : 's'} would not fit on one line, even
            made smaller.
          </p>
          <p className="mt-2">
            Taali shrinks a long name or school line a little so that it stays on one line and the
            certificate still matches the rest of the pile. These went past what that can rescue, so
            they will wrap. Shortening them on the recipients page — dropping a middle name, or the
            city — is usually all it takes.
          </p>
          <p className="mt-2 font-bold">{stubborn.join(', ')}</p>
        </div>
      )}

      {notReady.length > 0 && (
        <div className="rounded-lg border-2 border-focus bg-teal-50 px-5 py-4">
          <p className="text-lg font-bold">
            {notReady.length} certificate{notReady.length === 1 ? ' has' : 's have'} no audio yet.
          </p>
          <p className="mt-2">
            Scanning {notReady.length === 1 ? 'its' : 'their'} QR code will reach the page, but there
            will be nothing to listen to. Make the audio first, on the recipients page.
          </p>
          <p className="mt-2 font-bold">{notReady.join(', ')}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The smallest a fitted line may get, as a fraction of its designed size.
 *
 * Three fifths, measured rather than guessed: a 44-character name needs about
 * 65% of the designed size to sit on one line, so a tighter floor would refuse
 * to fit names that are merely long. At 60% the name is still the largest thing
 * on the sheet by some way. Below that it stops matching the rest of the pile
 * and starts looking like a mistake, so past that point it is better to say so
 * and let somebody shorten the name.
 */
const MIN_FIT_SCALE = 0.6;

/**
 * Squeezes the marked lines onto one line each.
 *
 * A wrapped name is the single most expensive thing that can happen to one of
 * these sheets -- at 44pt a second line costs about 17mm, more than any other
 * block -- and it is also the ugliest, because that one certificate no longer
 * matches the rest of the pile. Stepping the type down a few points for that
 * sheet alone fixes both.
 *
 * Done in the browser rather than from the character count because the count
 * says nothing useful: "Venkatanarasimharajuvaripeta" and a Kannada name of the
 * same length occupy quite different widths, and only the browser about to
 * print it knows which.
 *
 * Returns the lines it could not fit even at the floor.
 */
function fitLines(): string[] {
  const stubborn: string[] = [];

  for (const page of document.querySelectorAll('.certificate-page')) {
    const name = page.querySelector('.certificate-name')?.textContent?.trim() ?? 'Unnamed';

    for (const line of page.querySelectorAll<HTMLElement>('[data-fit]')) {
      // The designed size is remembered on the element, so running this again
      // -- and it runs again on every print -- measures from the original
      // rather than compounding one shrink on top of the last.
      const nominal = Number(line.dataset.fitNominal) || parseFloat(getComputedStyle(line).fontSize);
      line.dataset.fitNominal = String(nominal);
      line.style.fontSize = `${nominal}px`;

      const linesUsed = () => {
        const lineHeight = parseFloat(getComputedStyle(line).lineHeight) || nominal;
        return Math.round(line.getBoundingClientRect().height / lineHeight);
      };

      if (linesUsed() <= 1) continue;

      // One measurement gets most of the way there: with wrapping switched off,
      // how much wider than its box does the line want to be? Measured with a
      // Range over the text rather than from scrollWidth, which on a block with
      // visible overflow reports the box rather than the content and quietly
      // returns a ratio of 1 for a line that is half again too wide.
      line.style.whiteSpace = 'nowrap';
      const range = document.createRange();
      range.selectNodeContents(line);
      const natural = range.getBoundingClientRect().width;
      range.detach();
      const available = line.clientWidth;
      line.style.whiteSpace = '';

      const floor = nominal * MIN_FIT_SCALE;
      // A hair under the exact ratio, so rounding cannot leave it one pixel long.
      let size = natural > 0 ? Math.max(floor, (nominal * available * 0.98) / natural) : nominal;
      line.style.fontSize = `${size}px`;

      // Then small steps until it fits or the floor stops us. Shrinking changes
      // where the text would have broken, so the first guess is occasionally a
      // shade generous; the floor guarantees this terminates.
      while (linesUsed() > 1 && size > floor) {
        size = Math.max(floor, size * 0.94);
        line.style.fontSize = `${size}px`;
      }

      if (linesUsed() > 1) {
        stubborn.push(
          line.dataset.fit === 'name' ? name : `${name} — where they are from`,
        );
      }
    }
  }

  return stubborn;
}

/**
 * The smallest a whole sheet may be squeezed, as a fraction of its designed size.
 *
 * Ten per cent is about the point at which a certificate stops looking like the
 * others in the pile, which is the thing this is protecting. Past that it is
 * better to say so and let somebody shorten the wording.
 */
const MIN_SHEET_SCALE = 0.9;

/**
 * Squeezes a sheet that is running over until it fits on one page.
 *
 * Only the type and the gaps between it move; the code, the logos and the
 * border are fixed millimetres, so the sheet keeps its proportions and the QR
 * keeps the module size it needs to be scanned. A step at a time rather than
 * one calculation, because shrinking the type changes where lines wrap and a
 * sheet can come back under in fewer steps than the arithmetic predicts.
 *
 * Returns the names it could not rescue.
 */
function fitSheets(): string[] {
  const stubborn: string[] = [];

  for (const page of document.querySelectorAll('.certificate-page')) {
    const frame = page.querySelector<HTMLElement>('.certificate-frame');
    if (!frame) continue;

    frame.style.removeProperty('--fit');
    if (frame.scrollHeight <= frame.clientHeight + 1) continue;

    let scale = 1;
    while (scale > MIN_SHEET_SCALE && frame.scrollHeight > frame.clientHeight + 1) {
      // Rounded, so the value in the stylesheet reads as 0.92 rather than as
      // the floating point tail that repeated subtraction leaves behind.
      scale = Math.max(MIN_SHEET_SCALE, Math.round((scale - 0.02) * 100) / 100);
      frame.style.setProperty('--fit', String(scale));
    }

    if (frame.scrollHeight > frame.clientHeight + 1) {
      stubborn.push(
        page.querySelector('.certificate-name')?.textContent?.trim() || 'Unnamed certificate',
      );
    }
  }

  return stubborn;
}

/**
 * Fits the long lines, then reports what still does not fit on one sheet.
 *
 * The two belong together and in that order: fitting changes the height of the
 * page, so measuring for overflow before it would condemn sheets that the fit
 * was about to rescue.
 */
function usePrintFit(): { overflowing: string[]; stubborn: string[] } {
  const [result, setResult] = useState<{ overflowing: string[]; stubborn: string[] }>({
    overflowing: [],
    stubborn: [],
  });

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      // Longest lines first, then the sheet as a whole: fitting the name can
      // take a sheet back under on its own, and squeezing everything to rescue
      // something one line could have fixed makes the rest smaller for nothing.
      const stubborn = fitLines();
      const overflowing = fitSheets();
      setResult({ overflowing, stubborn });
    };

    // Fonts and logos both change the height, and both land after first paint,
    // so measuring on mount alone would clear the warning it should raise.
    const images = [...document.querySelectorAll<HTMLImageElement>('.certificate-page img')];
    void Promise.all([
      document.fonts?.ready,
      ...images.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    ]).then(run);

    // Again just before the print dialog, in case somebody reached for it
    // faster than the fonts loaded.
    window.addEventListener('beforeprint', run);
    window.addEventListener('resize', run);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeprint', run);
      window.removeEventListener('resize', run);
    };
  }, []);

  return result;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
