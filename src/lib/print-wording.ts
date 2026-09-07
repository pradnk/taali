/**
 * The words on the printed certificate.
 *
 * Until now every one of them was hardcoded English in the component, which was
 * fine while the sheet only ever said "This certificate is awarded to" -- but
 * the centred layout carries a paragraph that names the event and what it is
 * for, and that is nobody's business but the organisation running it.
 *
 * The same `{{token}}` and `[[optional block]]` syntax as the spoken templates,
 * rendered by the same `renderTemplate` in lib/script.ts. Reusing it is what
 * makes the "from" line disappear cleanly for a recipient with no school
 * recorded, rather than printing a bare "from".
 *
 * One set per event, not one per language. The printed sheet has always been
 * English apart from the recipient's own name; giving it the per-language
 * treatment the narration gets is a larger piece of work than this.
 */

export type PrintWording = {
  /** The large heading across the top. Centred layout only. */
  title: string;
  /** Sits immediately above the name. Used by both layouts. */
  lead: string;
  /** Where they are from. Centred layout only. */
  fromLine: string;
  /** What the certificate is for. Centred layout only. */
  recognition: string;
  /** A parting line under the citation. Centred layout only. */
  closing: string;
  /** Signed off at the foot, e.g. "For Vividha Trust". Centred layout only. */
  signature: string;
};

/**
 * Starting wording, deliberately generic.
 *
 * `{{event}}` rather than any particular ceremony's name, and no closing line
 * at all, for the same reason the spoken defaults are plain: this is printed on
 * every certificate, and a default describing somebody else's event would be
 * handed to families before anyone noticed it was wrong.
 */
export const DEFAULT_PRINT_WORDING: PrintWording = {
  title: 'Certificate',
  lead: 'This certificate is awarded to',
  fromLine: '[[from {{location}}]]',
  recognition: 'in recognition of their contribution to {{event}} as a {{role}}.',
  closing: '',
  signature: 'For {{event}}',
};

/** Generous, but short of a field somebody has pasted a whole page into. */
const MAX_FIELD_LENGTH = 400;

/**
 * Cleans a wording set from the settings form or the database.
 *
 * Missing keys fall back to the default rather than to an empty string, so an
 * event row written before a field existed still prints something sensible.
 */
export function normalisePrintWording(value: Partial<PrintWording> | null | undefined): PrintWording {
  const clean = (key: keyof PrintWording): string => {
    const raw = value?.[key];
    if (typeof raw !== 'string') return DEFAULT_PRINT_WORDING[key];
    return raw.trim().slice(0, MAX_FIELD_LENGTH);
  };

  return {
    title: clean('title'),
    lead: clean('lead'),
    fromLine: clean('fromLine'),
    recognition: clean('recognition'),
    closing: clean('closing'),
    signature: clean('signature'),
  };
}
