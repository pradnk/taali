'use client';

/**
 * Print controls, hidden from the printed output itself.
 *
 * Also carries the one instruction people reliably get wrong: browsers strip
 * background colours when printing unless "Background graphics" is ticked, and
 * without it the certificate's teal frame and award chip vanish.
 */
export function PrintButton({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="print-hide mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-5 py-6">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-14 items-center rounded-lg bg-teal-800 px-6 text-lg font-bold text-white hover:bg-teal-900"
      >
        {label}
      </button>
      <p className="max-w-md text-ink-soft">
        {hint ? `${hint} ` : ''}
        In the print dialog, choose <strong>Save as PDF</strong> and turn on{' '}
        <strong>Background graphics</strong>, or the border and the award will not print.
      </p>
    </div>
  );
}
