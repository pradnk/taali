/**
 * How the printed certificate is arranged, and where the partner logos sit.
 *
 * Two settings rather than one, because they are independent: either layout can
 * carry the logos at the top or at the foot. Both live here for the same reason
 * lib/logo.ts exists -- the admin screens need a list to offer, the server
 * action needs a guard, and the renderer needs the value, and none of them
 * should be the place the options are defined.
 */

export const CERTIFICATE_LAYOUTS = [
  {
    value: 'classic',
    label: 'Classic — everything aligned left',
    hint: 'Event and organisation in a ruled header, the prize, and what they showed.',
  },
  {
    value: 'centred',
    label: 'Centred — a title across the top',
    hint: 'A large title, then the name, school and prize centred beneath it. No exhibit.',
  },
] as const;

export type CertificateLayout = (typeof CERTIFICATE_LAYOUTS)[number]['value'];

/**
 * Existing events keep the layout they were printed with. Changing what an
 * event already handed out is never the right default.
 */
export const DEFAULT_CERTIFICATE_LAYOUT: CertificateLayout = 'classic';

export function isCertificateLayout(value: unknown): value is CertificateLayout {
  return CERTIFICATE_LAYOUTS.some((layout) => layout.value === value);
}

export function certificateLayoutLabel(value: CertificateLayout): string {
  return CERTIFICATE_LAYOUTS.find((layout) => layout.value === value)?.label ?? value;
}

export const PARTNER_LOGO_POSITIONS = [
  { value: 'bottom-centre', label: 'Across the foot, centred' },
  { value: 'top-right', label: 'Top right, beside the event name' },
] as const;

export type PartnerLogoPosition = (typeof PARTNER_LOGO_POSITIONS)[number]['value'];

export const DEFAULT_PARTNER_LOGO_POSITION: PartnerLogoPosition = 'bottom-centre';

export function isPartnerLogoPosition(value: unknown): value is PartnerLogoPosition {
  return PARTNER_LOGO_POSITIONS.some((position) => position.value === value);
}

export function partnerLogoPositionLabel(value: PartnerLogoPosition): string {
  return PARTNER_LOGO_POSITIONS.find((position) => position.value === value)?.label ?? value;
}

/** What the label above the logos says when nobody has changed it. */
export const DEFAULT_PARTNER_LABEL = 'Presented by';

/** Long enough for "In association with" and a little more. */
const MAX_PARTNER_LABEL_LENGTH = 60;

/** Trimmed, and empty when there should be no label at all. */
export function normalisePartnerLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PARTNER_LABEL_LENGTH);
}

/**
 * Where the event's name sits on the centred sheet.
 *
 * Beside the organisation's logo the header reads as a masthead running along
 * one edge; centred, it reads as the top of a formal certificate with the marks
 * flanking it. Which is right depends on how long the name is, so it is a
 * setting rather than a decision made here. Either way the name stays inside
 * the header band -- it is not a separate line below it.
 */
export const EVENT_NAME_POSITIONS = [
  { value: 'left', label: 'Left, beside the logo' },
  { value: 'centre', label: 'Centred, between the logo and the partners' },
] as const;

export type EventNamePosition = (typeof EVENT_NAME_POSITIONS)[number]['value'];

export const DEFAULT_EVENT_NAME_POSITION: EventNamePosition = 'left';

export function isEventNamePosition(value: unknown): value is EventNamePosition {
  return EVENT_NAME_POSITIONS.some((position) => position.value === value);
}
