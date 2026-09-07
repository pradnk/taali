import { normaliseNamedImages, type NamedImage } from '@/lib/named-images';

/**
 * Scanned signatures, printed under the sign-off at the foot of the sheet.
 *
 * They go in the space the QR code already reserves opposite them, so a signed
 * certificate costs no more height than an unsigned one -- that space was left
 * clear for a pen, and this is the same room used a different way.
 *
 * Printed only. A signature is a mark made on paper; the certificate page has
 * the recording and the transcript, which are what it is for.
 */

export type Signature = NamedImage;

/**
 * Two is the usual pair -- someone from the organisation and someone from the
 * event. Three fits across the space left under the sign-off; a fourth would
 * have to shrink them past the point where a signature reads as one.
 */
export const MAX_SIGNATURES = 3;

export function normaliseSignatures(values: readonly Signature[]): Signature[] {
  return normaliseNamedImages(values ?? [], MAX_SIGNATURES);
}
