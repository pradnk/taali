/**
 * Where the organisation's logo sits on a certificate.
 *
 * The same setting drives the printed sheet and the web page, but they are
 * different shapes: print is a fixed A4 landscape frame with four real corners,
 * while the web page is a single scrolling column. So "top" and "bottom" are
 * honoured on the web as the header and footer bands, and "left"/"right" as the
 * alignment within them. That keeps one setting meaningful in both places
 * without pretending a web page has corners.
 */

export const LOGO_POSITIONS = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
] as const;

export type LogoPosition = (typeof LOGO_POSITIONS)[number]['value'];

export const DEFAULT_LOGO_POSITION: LogoPosition = 'top-right';

export function isLogoPosition(value: unknown): value is LogoPosition {
  return LOGO_POSITIONS.some((position) => position.value === value);
}

export function logoPositionLabel(value: LogoPosition): string {
  return LOGO_POSITIONS.find((position) => position.value === value)?.label ?? value;
}

export function isTop(position: LogoPosition): boolean {
  return position.startsWith('top');
}

export function isLeft(position: LogoPosition): boolean {
  return position.endsWith('left');
}

/** What the upload endpoint accepts. */
export const LOGO_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
