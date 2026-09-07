import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import {
  DEFAULT_CERTIFICATE_LAYOUT,
  DEFAULT_EVENT_NAME_POSITION,
  DEFAULT_PARTNER_LABEL,
  DEFAULT_PARTNER_LOGO_POSITION,
} from '@/lib/certificate-layout';
import { db } from '@/lib/db';
import { certificates, events, type Event } from '@/lib/db/schema';
import type { ElevenLabsVoice } from '@/lib/elevenlabs';
import { DEFAULT_TEMPLATES, MODEL_AUTO } from '@/lib/languages';
import { DEFAULT_PRINT_WORDING } from '@/lib/print-wording';
import { defaultRecipientTypes } from '@/lib/recipient-types';

/**
 * Certificate ids, deliberately drawn from an alphabet with no look-alike
 * characters -- no 0/O, 1/l/I. These URLs get read aloud over the phone and
 * typed by people using screen magnification, where "l" and "1" are the same
 * shape. Ten characters is still ~10^15 combinations, far beyond guessing.
 */
export const newPublicId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 10);

/**
 * Last-resort voice id, used only when the voice list cannot be fetched.
 *
 * Deliberately not relied upon: stock voice ids differ between accounts, and a
 * hardcoded one that is absent produces an event whose very first generation
 * fails with an opaque error. `pickDefaultVoice` resolves a real one instead.
 */
const FALLBACK_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

/**
 * Chooses the voice a new event starts with, from those the account actually
 * has.
 *
 * Two things are being traded off. Accent matters -- these certificates name
 * Indian students at an Indian ceremony, and British English at least sits
 * closer to Indian English than American does. But a voice added from the
 * ElevenLabs Voice Library (category "professional") cannot be used over the
 * API at all on a free plan, and a default that fails on first use is worse
 * than a default that merely sounds less apt.
 *
 * So stock voices win over library ones, and accent decides within each group.
 * Whoever sets up the event should still press "Test this voice" and listen to
 * a name before running a batch; this only has to be a working starting point.
 */
export function pickDefaultVoice(voices: ElevenLabsVoice[]): string {
  const accentOf = (voice: ElevenLabsVoice) => (voice.labels?.accent ?? '').toLowerCase();
  const isStock = (voice: ElevenLabsVoice) => voice.category === 'premade';
  const find = (predicate: (voice: ElevenLabsVoice) => boolean) =>
    voices.find(predicate)?.voice_id;

  return (
    find((voice) => isStock(voice) && accentOf(voice).includes('indian')) ??
    find((voice) => isStock(voice) && accentOf(voice).includes('british')) ??
    find(isStock) ??
    find((voice) => accentOf(voice).includes('indian')) ??
    voices[0]?.voice_id ??
    FALLBACK_VOICE_ID
  );
}

export function listEvents() {
  return db().select().from(events).orderBy(asc(events.createdAt));
}

export async function getEvent(id: string): Promise<Event | undefined> {
  const [row] = await db().select().from(events).where(eq(events.id, id)).limit(1);
  return row;
}

export function listCertificates(eventId: string) {
  return db()
    .select()
    .from(certificates)
    .where(eq(certificates.eventId, eventId))
    .orderBy(asc(certificates.sortIndex), asc(certificates.createdAt));
}

export async function getCertificate(id: string) {
  const [row] = await db().select().from(certificates).where(eq(certificates.id, id)).limit(1);
  return row;
}

/** Public lookup for /c/[publicId]. Joins the event for the display header. */
export async function getCertificateByPublicId(publicId: string) {
  const [row] = await db()
    .select({ certificate: certificates, event: events })
    .from(certificates)
    .innerJoin(events, eq(certificates.eventId, events.id))
    .where(eq(certificates.publicId, publicId))
    .limit(1);
  return row;
}

/**
 * The event most recently created, if any.
 *
 * A new event inherits its organisation name, wording, recipient types and
 * their prizes, partner logos, printed layout, voice and language from this one. Almost every deployment runs the same event year after year, so
 * copying forward is what people expect -- and it means the generic starting
 * wording is only ever seen once, by whoever sets the tool up.
 */
export async function mostRecentEvent(): Promise<Event | undefined> {
  const [row] = await db().select().from(events).orderBy(desc(events.createdAt)).limit(1);
  return row;
}

/** Field values for a new event, seeded from the previous one where there is one. */
export function newEventDefaults(
  name: string,
  slug: string,
  voiceId: string,
  previous?: Event,
  orgName?: string,
) {
  return {
    name,
    slug,
    orgName: orgName?.trim() || previous?.orgName || '',
    templates: previous ? { ...previous.templates } : { ...DEFAULT_TEMPLATES },
    recipientTypes: previous
      ? previous.recipientTypes.map((type) => ({ ...type, awards: [...type.awards] }))
      : defaultRecipientTypes(),
    partnerLogos: previous ? [...previous.partnerLogos] : [],
    partnerLogoPosition: previous?.partnerLogoPosition ?? DEFAULT_PARTNER_LOGO_POSITION,
    partnerLabel: previous?.partnerLabel ?? DEFAULT_PARTNER_LABEL,
    certificateLayout: previous?.certificateLayout ?? DEFAULT_CERTIFICATE_LAYOUT,
    eventNamePosition: previous?.eventNamePosition ?? DEFAULT_EVENT_NAME_POSITION,
    // Not carried forward. A signature belongs to the person who signed this
    // year's certificates, and inheriting one would sign next year's for them.
    signatures: [],
    printWording: previous ? { ...previous.printWording } : { ...DEFAULT_PRINT_WORDING },
    voiceId,
    modelId: previous?.modelId ?? MODEL_AUTO,
    defaultLanguage: previous?.defaultLanguage ?? 'en-IN',
  };
}
