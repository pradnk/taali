'use client';

import { useRef, type ComponentProps } from 'react';

import { Textarea } from '@/components/ui';
import { toggleBold } from '@/lib/rich-text';
import { MAX_WORDING_LENGTH } from '@/lib/wording';

/**
 * A wording box that can make part of what it holds bold.
 *
 * A plain textarea with a button rather than a rich text editor, and that is
 * the whole design: these fields carry `{{tokens}}` and `[[optional blocks]]`
 * that a WYSIWYG box would fight with, they have to stay readable to a screen
 * reader, and the markers survive being copied into an email or a spreadsheet.
 * Select some words and press Bold -- or Ctrl+B, which is where a hand already
 * reaches for it.
 */
export function WordingTextarea({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const bold = () => {
    const field = ref.current;
    if (!field) return;

    const next = toggleBold(value, field.selectionStart, field.selectionEnd);

    /*
     * The box is written first and the selection placed against the text it now
     * holds; only then is React told. By the time it re-renders, the value it
     * sets is the one already there, so nothing in the DOM changes and the
     * selection survives.
     *
     * Restoring it afterwards instead -- in an effect or a frame callback --
     * races the commit: the range lands against whichever version of the text
     * happens to be in the box at that moment, and a second press ends up
     * bolding the markers rather than removing them.
     */
    field.value = next.text;
    field.setSelectionRange(next.start, next.end);
    field.focus();
    onChange(next.text);
  };

  return (
    <>
      <Textarea
        {...props}
        ref={ref}
        // The same cap the server applies. Without it a longer paragraph is
        // accepted here and quietly loses its tail on the certificate.
        maxLength={MAX_WORDING_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            bold();
          }
        }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          // Keeps the caret where it was. Without this the button takes focus
          // on mousedown, and some browsers drop the selection with it, so the
          // press would bold nothing.
          onMouseDown={(event) => event.preventDefault()}
          onClick={bold}
          className="min-h-11 rounded-lg border-2 border-teal-800 px-3 font-bold text-teal-900 hover:bg-teal-50"
        >
          Bold
        </button>
        <span className="text-sm text-ink-soft">
          Select some words and press Bold, or Ctrl+B. A new line here is a new line on the
          certificate.
          {value.length > MAX_WORDING_LENGTH - 60 &&
            ` ${MAX_WORDING_LENGTH - value.length} characters left.`}
        </span>
      </div>
    </>
  );
}
