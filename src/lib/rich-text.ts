/**
 * The small amount of formatting the printed wording can carry.
 *
 * Two things only: **bold** around a few words, and a line break where one was
 * typed. Not a rich text editor and not HTML -- the wording fields already
 * carry `{{tokens}}` and `[[optional blocks]]`, and a WYSIWYG box over that
 * syntax would fight it. Markers in a plain textarea stay legible, survive
 * copy and paste, and cannot smuggle markup onto a certificate.
 *
 * Deliberately printed-only. The same markers reaching the voice engine would
 * be read out as "star star", so lib/script.ts strips them from everything
 * that is spoken.
 */

const BOLD = /\*\*(.+?)\*\*/gs;

/** One run of text, and whether it is bold. */
export type RichRun = { text: string; bold: boolean };

/**
 * Splits a line into bold and plain runs.
 *
 * Any marker left unpaired is dropped rather than printed: a stray `**` on a
 * certificate is a typo nobody wants handed to a family, and hiding it is
 * kinder than reproducing it.
 */
export function richRuns(line: string): RichRun[] {
  const runs: RichRun[] = [];
  let index = 0;

  for (const match of line.matchAll(BOLD)) {
    const start = match.index ?? 0;
    if (start > index) runs.push({ text: stripBold(line.slice(index, start)), bold: false });
    runs.push({ text: match[1], bold: true });
    index = start + match[0].length;
  }

  if (index < line.length) runs.push({ text: stripBold(line.slice(index)), bold: false });
  return runs.filter((run) => run.text.length > 0);
}

/** Removes the markers, leaving the words. */
export function stripBold(text: string): string {
  return text.replace(BOLD, '$1').replace(/\*\*/g, '');
}

/**
 * Wraps a stretch of text in bold markers, or unwraps it if it already is.
 *
 * Used by the Bold button in the settings form, which is why it works on
 * offsets rather than on the string alone -- it has to hand back where the
 * selection should sit afterwards, so that typing can carry on uninterrupted.
 */
export function toggleBold(
  text: string,
  start: number,
  end: number,
): { text: string; start: number; end: number } {
  const selected = text.slice(start, end);

  // Already wrapped, either inside the markers or around them: take them off.
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
    const inner = selected.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
    return {
      text: text.slice(0, start - 2) + selected + text.slice(end + 2),
      start: start - 2,
      end: end - 2,
    };
  }

  // Nothing selected: leave the markers ready with the cursor between them.
  if (start === end) {
    return { text: `${text.slice(0, start)}****${text.slice(end)}`, start: start + 2, end: start + 2 };
  }

  // Both ends shift right by the two characters inserted before them, so the
  // same words stay selected and a second press takes the markers off again.
  return {
    text: `${text.slice(0, start)}**${selected}**${text.slice(end)}`,
    start: start + 2,
    end: end + 2,
  };
}
