import { DEFAULT_AWARDS, matchAward, normaliseAwards, type AwardCategory } from '@/lib/awards';
import type { PrintWording } from '@/lib/print-wording';
import {
  SPOKEN_FIELDS,
  normaliseWordingOverrides,
  resolveOverride,
  type TemplateSet,
  type WordingOverrides,
} from '@/lib/wording';

/**
 * The kinds of people an event gives certificates to.
 *
 * An awards evening rarely honours one group. A science fair recognises the
 * students who exhibited and the teachers who got them there, and the two are
 * not competing for the same prizes -- "First Prize" and "Best Mentor" belong
 * on separate lists, offered to separate people.
 *
 * A type carries its own prize categories, and optionally its own sentence on
 * the certificate. Most of the wording stays shared -- the title, the lead-in,
 * the closing line, the sign-off -- because it reads the same for everybody,
 * and `{{role}}` fills in the group's own name where it is needed.
 *
 * The one line that usually cannot be shared is what the certificate is *for*:
 * a student took part, a teacher guided the students who took part, and no
 * single sentence says both well. So a type may carry its own, and falls back
 * to the shared one when it does not.
 */

export type RecipientType = {
  /**
   * Stable key stored on every certificate. Derived from the label once, when
   * the type is created, and never rewritten -- renaming "Student" to
   * "Participant" must not orphan the certificates already filed under it.
   */
  id: string;
  /** What this group is called, e.g. "Student" or "Teacher". */
  label: string;
  /** The prizes offered to this group, each able to carry its own wording. */
  awards: AwardCategory[];
} & WordingOverrides;

/** More than this and the add form becomes a menu. */
export const MAX_RECIPIENT_TYPES = 8;

const MAX_LABEL_LENGTH = 40;

/**
 * What a brand-new deployment starts with: one unnamed group holding the
 * standard prizes, so an event that never needs a second one never has to
 * think about types at all.
 */
export function defaultRecipientTypes(): RecipientType[] {
  return [
    { id: 'recipient', label: 'Recipient', awards: normaliseAwards([...DEFAULT_AWARDS]) },
  ];
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'type'
  );
}

/** A stable id for a new type, unique among the ones already there. */
export function newRecipientTypeId(label: string, existing: readonly RecipientType[]): string {
  const base = slug(label);
  const taken = new Set(existing.map((type) => type.id));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Cleans a list from the settings form or the database.
 *
 * A type with no label is dropped, but a type with no prizes is kept: an
 * organiser part-way through setting one up should not have it vanish when
 * they save.
 */
export function normaliseRecipientTypes(values: readonly RecipientType[]): RecipientType[] {
  const seen = new Set<string>();
  const cleaned: RecipientType[] = [];

  for (const value of values ?? []) {
    const label = typeof value?.label === 'string' ? value.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH) : '';
    if (!label) continue;

    const id = typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : slug(label);
    if (seen.has(id)) continue;
    seen.add(id);

    cleaned.push({
      id,
      label,
      awards: normaliseAwards(value?.awards ?? []),
      ...normaliseWordingOverrides(value),
    });
    if (cleaned.length === MAX_RECIPIENT_TYPES) break;
  }

  return cleaned;
}

/**
 * The types to offer for an event, never empty.
 *
 * An event whose types have all been deleted still has to be able to add
 * somebody, and an empty dropdown reads as a broken screen rather than as a
 * deliberate choice.
 */
export function recipientTypesFor(event: { recipientTypes?: RecipientType[] | null }): RecipientType[] {
  const configured = normaliseRecipientTypes(event.recipientTypes ?? []);
  return configured.length > 0 ? configured : defaultRecipientTypes();
}

/**
 * The type a certificate belongs to, falling back to the first.
 *
 * Falling back rather than failing matters: a type can be deleted in Settings
 * while certificates still point at it, and those certificates must keep
 * printing.
 */
export function recipientTypeFor(
  types: readonly RecipientType[],
  id: string | null | undefined,
): RecipientType {
  return types.find((type) => type.id === id) ?? types[0];
}

/** Matches a typed or pasted type name, by id or by label, ignoring case. */
export function matchRecipientType(
  value: string,
  types: readonly RecipientType[],
): RecipientType | undefined {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return undefined;
  return types.find(
    (type) => type.id.toLowerCase() === wanted || type.label.toLowerCase() === wanted,
  );
}

/**
 * The prize category a certificate belongs to, if its award is one of them.
 *
 * Certificates carry the award as free text, so a one-off prize typed on the
 * day simply matches nothing and inherits the group's wording.
 */
export function awardCategoryFor(
  type: RecipientType | undefined,
  awardName: string,
): AwardCategory | undefined {
  return matchAward(awardName, type?.awards ?? []);
}

/**
 * The printed wording for one certificate.
 *
 * Only the two lines that genuinely differ between groups are overridable; the
 * title, the lead-in, the "from" line and the sign-off read the same for
 * everybody and stay on the event.
 */
export function printWordingFor(
  type: RecipientType | undefined,
  awardName: string,
  shared: PrintWording,
): PrintWording {
  const levels = [awardCategoryFor(type, awardName), type];
  return {
    ...shared,
    // The title comes from the group alone: what kind of certificate this is
    // follows from who it is for, not from which prize they were handed.
    title: resolveOverride([type], (o) => o.title, shared.title),
    recognition: resolveOverride(levels, (o) => o.recognition, shared.recognition),
    closing: resolveOverride(levels, (o) => o.closing, shared.closing),
  };
}

/**
 * The spoken wording for one certificate, in one language.
 *
 * Every beat can be overridden, resolved one at a time: a group that only wants
 * a different citation writes that and inherits the other four, rather than
 * having to restate the whole recording to change one line of it.
 */
export function spokenTemplatesFor(
  type: RecipientType | undefined,
  awardName: string,
  language: string,
  shared: TemplateSet,
): TemplateSet {
  const levels = [awardCategoryFor(type, awardName), type];
  const resolved = { ...shared };
  for (const field of SPOKEN_FIELDS) {
    resolved[field] = resolveOverride(
      levels,
      (o) => o.spoken?.[language]?.[field],
      shared[field],
    );
  }
  return resolved;
}
