import { normaliseNamedImages, type NamedImage } from '@/lib/named-images';
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '@/lib/logo';

/**
 * The organisations shown alongside the presenting one at the foot of a
 * certificate.
 *
 * Separate from `logoUrl`, which is the single mark of whoever is presenting
 * the award -- in a corner on the classic sheet, and leading the header beside
 * the event's name on the centred one. These are the co-organisers and
 * supporters, and there are usually several, so they get a row of their own.
 *
 * Per event, and empty by default: a ceremony's partners are the one thing
 * guaranteed to differ between deployments, and a certificate that credits an
 * organisation which had nothing to do with the award is worse than one that
 * credits nobody.
 *
 * Deliberately not spoken. The narration is already forty-five seconds of a
 * child's moment; reading out a list of institutions would spend that moment on
 * the institutions. See lib/script.ts, which has no notion of these at all.
 */

export type PartnerLogo = NamedImage;

/** More than this and the row stops being a row. */
export const MAX_PARTNER_LOGOS = 6;

/** Re-exported so the picker has one import for everything it needs. */
export { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES };

/**
 * Cleans a list coming from the settings form or the database.
 *
 * Runs on the server on every save as well as in the browser: the form is a
 * client component, so what reaches the action is whatever the caller sent.
 */
export function normalisePartnerLogos(values: readonly PartnerLogo[]): PartnerLogo[] {
  return normaliseNamedImages(values ?? [], MAX_PARTNER_LOGOS);
}
