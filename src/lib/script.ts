import type {
  Certificate,
  Event,
  ScriptSegment,
  ScriptSnapshot,
  TemplateSet,
} from '@/lib/db/schema';
import { modelSupportsSpeed, resolveModel, terminatorFor } from '@/lib/languages';
import { recipientTypeFor, recipientTypesFor, spokenTemplatesFor } from '@/lib/recipient-types';
import { stripBold } from '@/lib/rich-text';

/**
 * Turns an event's wording templates plus one student's details into the exact
 * list of clips that will be spoken.
 *
 * Template syntax:
 *   {{token}}        substituted with the value, or "" if unset
 *   [[ ... ]]        an optional block: dropped entirely if any {{token}}
 *                    inside it is empty
 *
 * The optional block is what lets one template cover a student with no recorded
 * school and one with a school, a city and a project blurb, without the result
 * reading as "from , — for their exhibit, "".
 */

const TOKEN = /\{\{(\w+)\}\}/g;
const OPTIONAL_BLOCK = /\[\[(.*?)\]\]/gs;

export type ScriptVars = Record<string, string | null | undefined>;

/** Substitution and optional blocks, before any tidying. */
function fill(template: string, vars: ScriptVars): string {
  const substitute = (text: string) =>
    text.replace(TOKEN, (_match, name: string) => (vars[name] ?? '').toString().trim());

  const withOptionalBlocks = template.replace(OPTIONAL_BLOCK, (_match, inner: string) => {
    const tokens = [...inner.matchAll(TOKEN)].map((match) => match[1]);
    const anyEmpty = tokens.some((name) => !(vars[name] ?? '').toString().trim());
    return anyEmpty ? '' : substitute(inner);
  });

  return substitute(withOptionalBlocks);
}

/**
 * One line of text, for anywhere it is spoken or used as a plain string.
 *
 * Bold markers are stripped here rather than passed along: the voice engine
 * would read them out, and "star star congratulations star star" is not what
 * anybody wants at an awards ceremony. Line breaks collapse to spaces for the
 * same reason -- a recording has no lines.
 */
export function renderTemplate(template: string, vars: ScriptVars): string {
  return tidy(stripBold(fill(template, vars)));
}

/**
 * The same wording, kept as the lines it was typed as.
 *
 * Tidied line by line rather than all at once, so that the punctuation left
 * behind by a dropped optional block is still cleaned up while a deliberate
 * line break survives to paper. Bold markers are left in place for the caller
 * to render; see lib/rich-text.ts.
 */
export function renderPrintedLines(template: string, vars: ScriptVars): string[] {
  // Only the last line gets its trailing punctuation trimmed. That rule exists
  // to clear the comma a dropped optional block leaves hanging, and at the end
  // of an earlier line the comma is nearly always deliberate.
  const raw = fill(template, vars).split(/\r?\n/).map(tidyWithin);
  const lines = raw.map((line, index) =>
    index === raw.length - 1 ? trimTrailingPunctuation(line) : line,
  );

  // Blank lines at either end are the ones nobody meant; a blank line between
  // two paragraphs is one somebody typed on purpose.
  while (lines.length > 0 && !lines[0]) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/**
 * Adds a full stop when a rendered sentence lost its own to a dropped optional
 * block. Without one the voice engine gives the clip a rising, unfinished
 * intonation, which sounds like a mistake when the applause comes in after it.
 */
function ensureTerminal(text: string, terminator: string): string {
  if (!text) return text;
  return /[.!?।]["”'’)]?$/.test(text) ? text : text + terminator;
}

/**
 * Cleans up the punctuation debris left when optional blocks drop out, so the
 * voice engine never has to read a stray comma or a doubled full stop.
 */
function tidy(text: string): string {
  return trimTrailingPunctuation(tidyWithin(text));
}

/**
 * Everything tidy does except strip punctuation off the end.
 *
 * Split out for printed lines: a comma at the end of a line is usually one
 * somebody typed on purpose before pressing return, not debris from a dropped
 * optional block, and eating it turns their sentence into two fragments.
 */
function tidyWithin(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.।;:!?])/g, '$1')
    .replace(/([,.।;:])\1+/g, '$1')
    .replace(/^[\s,.;:—–-]+/, '')
    .trim();
}

function trimTrailingPunctuation(text: string): string {
  return text.replace(/[\s,;:—–-]+$/, '').trim();
}

function templatesFor(event: Event, language: string): TemplateSet | undefined {
  return event.templates[language];
}

/** True when the event has wording for this language, so it can be generated. */
export function hasTemplatesFor(event: Event, language: string): boolean {
  const set = templatesFor(event, language);
  return Boolean(set?.intro?.trim() && set?.awardLine?.trim() && set?.closing?.trim());
}

export class MissingTemplatesError extends Error {
  readonly language: string;

  constructor(language: string) {
    super(
      `This event has no wording set for ${language}. Add it under Event settings before generating certificates in that language.`,
    );
    this.name = 'MissingTemplatesError';
    this.language = language;
  }
}

type CertificateInput = Pick<
  Certificate,
  | 'studentName'
  | 'namePronunciation'
  | 'school'
  | 'city'
  | 'className'
  | 'projectTitle'
  | 'projectBlurb'
  | 'award'
  | 'recipientType'
  | 'language'
>;

export function buildScript(event: Event, certificate: CertificateInput): ScriptSnapshot {
  const language = certificate.language || event.defaultLanguage;
  const shared = templatesFor(event, language);
  if (!shared) throw new MissingTemplatesError(language);

  const type = recipientTypeFor(recipientTypesFor(event), certificate.recipientType);
  const roleLabel = type.label;

  // Beat by beat, prize over group over event, and only for this language: a
  // group with nothing to say in Kannada speaks the event's Kannada wording
  // rather than its own English.
  const templates = spokenTemplatesFor(type, certificate.award, language, shared);

  const vars: ScriptVars = {
    event: event.name,
    org: event.orgName,
    date: event.eventDate,
    venue: event.venue,
    name: certificate.studentName,
    school: certificate.school,
    city: certificate.city,
    class: certificate.className,
    projectTitle: certificate.projectTitle,
    blurb: certificate.projectBlurb,
    award: certificate.award,
    // What this person is here as -- "student", "teacher". Offered in two
    // cases because a template needs both: "as a {{role}}" mid-sentence, and
    // "{{Role}} of the Year" at the start of one.
    role: roleLabel.toLowerCase(),
    Role: roleLabel,
    // Pre-joined so one template covers school-only, city-only and both. If the
    // two were separate optional blocks, a student with a city but no recorded
    // school would be introduced as "Ravi Kumar Bengaluru".
    location: [certificate.school, certificate.city]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', '),
  };

  const modelId = resolveModel(event.modelId, language);
  const terminator = terminatorFor(language);
  const segments: ScriptSegment[] = [];

  const push = (
    id: ScriptSegment['id'],
    text: string,
    options: { spoken?: string; speed?: number; shared?: boolean; terminate?: boolean } = {},
  ) => {
    const finalText = options.terminate ? ensureTerminal(text.trim(), terminator) : text.trim();
    if (!finalText) return;
    segments.push({
      id,
      text: finalText,
      spoken: options.spoken?.trim() || finalText,
      speed: options.speed ?? 1,
      shared: options.shared ?? false,
    });
  };

  // Shared beats are identical for every student in the event, so they are
  // synthesised once and reused -- see the tts_cache table.
  push('intro', renderTemplate(templates.intro, vars), { shared: true, terminate: true });
  // No full stop here on purpose: "This certificate is awarded to" should lead
  // into the name with an open, rising intonation rather than landing.
  push('awardLine', renderTemplate(templates.awardLine, vars), { shared: true });

  // The name is its own clip, spoken slowly, and surrounded by silence in the
  // mix. It is the moment the certificate exists for.
  push('name', certificate.studentName.trim(), {
    spoken: certificate.namePronunciation?.trim() || certificate.studentName.trim(),
    speed: modelSupportsSpeed(modelId) ? 0.9 : 1,
  });

  push('citation', renderTemplate(templates.citation, vars), { terminate: true });
  push('prize', renderTemplate(templates.prize, vars), { terminate: true });
  push('closing', renderTemplate(templates.closing, vars), { shared: true, terminate: true });

  return {
    language,
    voiceId: event.voiceId,
    // The resolved model, not the event's possibly-"auto" setting, so the
    // snapshot records exactly what produced this audio.
    modelId,
    segments,
  };
}

/** The certificate as continuous prose, for the on-page transcript. */
export function transcriptFrom(snapshot: ScriptSnapshot): string {
  return snapshot.segments.map((segment) => segment.text).join(' ');
}

/** Characters billed to the voice engine, excluding cached shared beats. */
export function billableChars(snapshot: ScriptSnapshot): number {
  return snapshot.segments
    .filter((segment) => !segment.shared)
    .reduce((total, segment) => total + segment.spoken.length, 0);
}
