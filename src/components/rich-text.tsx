import { richRuns } from '@/lib/rich-text';

/**
 * Printed wording, with the two pieces of formatting it can carry.
 *
 * A line is an element rather than a `<br>`, so that a blank line between two
 * paragraphs is real space rather than a stack of breaks, and so print.css can
 * still control the spacing between them.
 */
export function RichText({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        // Index keys: these are lines of one paragraph, never reordered.
        // Utility classes rather than a print.css rule: this renders on the
        // certificate page too, and that stylesheet is only loaded for print.
        <span key={index} className="block empty:h-[0.6em]">
          {richRuns(line).map((run, runIndex) =>
            run.bold ? <strong key={runIndex}>{run.text}</strong> : <span key={runIndex}>{run.text}</span>,
          )}
        </span>
      ))}
    </>
  );
}
