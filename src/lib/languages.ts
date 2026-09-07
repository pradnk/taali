import type { TemplateSet } from '@/lib/db/schema';

/**
 * Languages offered in the per-student dropdown.
 *
 * `nativeName` is shown alongside the English name so an operator who reads the
 * script can pick confidently. Eleven v3 covers all of these; Multilingual v2
 * covers only the ones marked `inMultilingualV2`, which matters if you ever
 * fall back to that model.
 */
export type Language = {
  tag: string;
  englishName: string;
  nativeName: string;
  inMultilingualV2: boolean;
  /** Full stop used when a sentence needs one added: danda for Devanagari/Bengali. */
  terminator: '.' | '।';
};

export const SUPPORTED_LANGUAGES: Language[] = [
  { tag: 'en-IN', englishName: 'English (India)', nativeName: 'English', inMultilingualV2: true, terminator: '.' },
  { tag: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', inMultilingualV2: true, terminator: '।' },
  { tag: 'kn', englishName: 'Kannada', nativeName: 'ಕನ್ನಡ', inMultilingualV2: false, terminator: '.' },
  { tag: 'ta', englishName: 'Tamil', nativeName: 'தமிழ்', inMultilingualV2: true, terminator: '.' },
  { tag: 'te', englishName: 'Telugu', nativeName: 'తెలుగు', inMultilingualV2: false, terminator: '.' },
  { tag: 'ml', englishName: 'Malayalam', nativeName: 'മലയാളം', inMultilingualV2: false, terminator: '.' },
  { tag: 'mr', englishName: 'Marathi', nativeName: 'मराठी', inMultilingualV2: false, terminator: '।' },
  { tag: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', inMultilingualV2: false, terminator: '।' },
  { tag: 'gu', englishName: 'Gujarati', nativeName: 'ગુજરાતી', inMultilingualV2: false, terminator: '.' },
];

export function languageLabel(tag: string): string {
  const match = SUPPORTED_LANGUAGES.find((language) => language.tag === tag);
  return match ? `${match.englishName} — ${match.nativeName}` : tag;
}

export function terminatorFor(tag: string): string {
  return SUPPORTED_LANGUAGES.find((language) => language.tag === tag)?.terminator ?? '.';
}

export const MODEL_MULTILINGUAL_V2 = 'eleven_multilingual_v2';
export const MODEL_V3 = 'eleven_v3';

/** Event setting meaning "let each certificate use the best model for its language". */
export const MODEL_AUTO = 'auto';

/**
 * Picks the voice model for a language.
 *
 * Multilingual v2 is preferred wherever it reaches, because it honours the
 * `speed` voice setting and the score depends on that to slow the student's
 * name down. Eleven v3 ignores speed, but it is the only model that speaks
 * Kannada, Telugu, Malayalam, Marathi, Bengali or Gujarati at all -- so those
 * languages get v3 and the score compensates with extra silence around the name
 * instead. See planTimeline in lib/audio/score.ts.
 */
export function pickModelFor(language: string): string {
  const match = SUPPORTED_LANGUAGES.find((entry) => entry.tag === language);
  return match?.inMultilingualV2 ? MODEL_MULTILINGUAL_V2 : MODEL_V3;
}

/** Resolves an event's model setting, which may be "auto", for one language. */
export function resolveModel(eventModelId: string, language: string): string {
  return eventModelId === MODEL_AUTO ? pickModelFor(language) : eventModelId;
}

/** Eleven v3 ignores the `speed` voice setting; Multilingual v2 honours it. */
export function modelSupportsSpeed(modelId: string): boolean {
  return modelId !== MODEL_V3;
}

/**
 * Starting wording for a brand new event, in a brand new deployment.
 *
 * Deliberately generic. This wording is *spoken aloud* on every certificate, so
 * a default that describes one particular organisation's event would put the
 * wrong words in another organisation's mouth -- and nobody proofreads a
 * default they were never asked about. Every event can rewrite all of it under
 * Event settings, and a second event inherits the wording of the first, so this
 * plain version is only ever heard if someone chooses to keep it.
 *
 * Only English and Hindi ship with defaults. Every other language deliberately
 * starts empty: a machine-translated certificate that reads awkwardly at an
 * awards ceremony is worse than one an actual speaker of the language wrote, so
 * the admin screen asks a human to supply the wording before that language can
 * be used. The Hindi set below is a starting draft and is flagged for review in
 * the UI for the same reason.
 */
export const DEFAULT_TEMPLATES: Record<string, TemplateSet> = {
  'en-IN': {
    intro: '{{event}}, presented by {{org}}.',
    awardLine: 'This certificate is awarded to',
    citation: '[[from {{location}}]][[ — for {{projectTitle}}]][[. {{blurb}}]]',
    prize: '{{award}}.',
    closing: 'Congratulations, and very well done. From all of us at {{org}}.',
  },
  hi: {
    intro: '{{event}}, प्रस्तुतकर्ता {{org}}।',
    awardLine: 'यह प्रमाणपत्र प्रदान किया जाता है',
    citation: '[[{{location}} से]][[, {{projectTitle}} के लिए]][[। {{blurb}}]]',
    prize: '{{award}}।',
    closing: 'हार्दिक बधाई। {{org}} की ओर से शुभकामनाएँ।',
  },
};

/** Languages that ship with wording out of the box. */
export const LANGUAGES_WITH_DEFAULTS = Object.keys(DEFAULT_TEMPLATES);

/** Hindi defaults are a draft; surface that in the admin UI. */
export const LANGUAGES_NEEDING_REVIEW = ['hi'];
