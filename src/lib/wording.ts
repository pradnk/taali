/**
 * The names of the pieces a certificate is made of, and the shape of an
 * override.
 *
 * A leaf module on purpose: it imports nothing, so the schema, the prize list
 * and the script builder can all agree on these names without any of them
 * having to depend on another.
 *
 * Wording lives at three levels, and the most specific one that has something
 * to say wins:
 *
 *   the prize category  ->  the recipient group  ->  the event
 *
 * Only the level that actually differs is ever filled in. A "Certificate of
 * Qualification" is given for something a "Certificate of Participation" is
 * not; a teacher is thanked for something a student is not; and everything
 * that reads the same for everybody stays written once, on the event.
 */

/** The five beats of the spoken certificate. See lib/script.ts. */
export const SPOKEN_FIELDS = ['intro', 'awardLine', 'citation', 'prize', 'closing'] as const;

export type SpokenField = (typeof SPOKEN_FIELDS)[number];

/** The five pieces of wording that make up a certificate, in one language. */
export type TemplateSet = Record<SpokenField, string>;

/**
 * Spoken overrides, keyed by language tag then by beat.
 *
 * Per language, unlike the printed overrides, and not for tidiness: the voice
 * engine works out which language to speak from the words themselves, so an
 * English override reaching a Hindi certificate would not be a translation
 * mistake but a recording that changes language in the middle of a sentence.
 * A language with no override simply falls back to the event's own wording for
 * that language.
 */
export type SpokenOverrides = Record<string, Partial<TemplateSet>>;

/** What a prize category or a recipient group may say for itself. */
export type WordingOverrides = {
  /**
   * Printed: the heading across the top, e.g. "Student Certificate".
   *
   * Resolved from the recipient group only, never from the prize: what kind of
   * certificate this is follows from who it is for, not from which prize they
   * were given, so a "Certificate of Participation" and a "First Prize" handed
   * to two students are both a Student Certificate.
   */
  title?: string;
  /** Printed: what the certificate is recognised for. */
  recognition?: string;
  /** Printed: the parting line under the citation. */
  closing?: string;
  /** Spoken, per language. */
  spoken?: SpokenOverrides;
};

/**
 * The longest any one line of wording may be.
 *
 * Enforced on the way in as well as here, so that a paragraph is stopped while
 * it is being typed rather than silently losing its tail somewhere between the
 * settings screen and the printer.
 */
export const MAX_WORDING_LENGTH = 400;

const MAX_FIELD_LENGTH = MAX_WORDING_LENGTH;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_LENGTH) : '';
}

/**
 * Keeps only the overrides that say something.
 *
 * An empty string means "no override" rather than "say nothing", so blank
 * fields are dropped instead of stored -- otherwise a group that had once been
 * opened and closed again would silence a line the event had filled in.
 */
export function normaliseWordingOverrides(value: WordingOverrides | undefined): WordingOverrides {
  const result: WordingOverrides = {};

  const title = clean(value?.title);
  if (title) result.title = title;

  const recognition = clean(value?.recognition);
  if (recognition) result.recognition = recognition;

  const closing = clean(value?.closing);
  if (closing) result.closing = closing;

  const spoken: SpokenOverrides = {};
  for (const [language, set] of Object.entries(value?.spoken ?? {})) {
    const kept: Partial<TemplateSet> = {};
    for (const field of SPOKEN_FIELDS) {
      const text = clean(set?.[field]);
      if (text) kept[field] = text;
    }
    if (Object.keys(kept).length > 0) spoken[language] = kept;
  }
  if (Object.keys(spoken).length > 0) result.spoken = spoken;

  return result;
}

/** True when this level has anything to say at all, in any language. */
export function hasOverrides(value: WordingOverrides | undefined): boolean {
  const cleaned = normaliseWordingOverrides(value);
  return Boolean(cleaned.title || cleaned.recognition || cleaned.closing || cleaned.spoken);
}

/**
 * The first level that has something to say, most specific first.
 *
 * `levels` is expected in that order -- prize, then group -- with the event's
 * own value as the fallback.
 */
export function resolveOverride(
  levels: readonly (WordingOverrides | undefined)[],
  pick: (overrides: WordingOverrides) => string | undefined,
  fallback: string,
): string {
  for (const level of levels) {
    const value = level ? pick(level)?.trim() : '';
    if (value) return value;
  }
  return fallback;
}
