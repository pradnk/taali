import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '@/lib/logo';

/**
 * A picture with a name attached, and the rules every list of them follows.
 *
 * Two things on a certificate are shaped like this -- the supporters' logos and
 * the signatures -- and they behave identically: uploaded one at a time, named
 * so a screen reader has something to read, capped so the row stays a row.
 * Shared rather than written twice, because the interesting part is the name
 * requirement and it should not be possible to forget it in one place.
 */

export type NamedImage = {
  url: string;
  /**
   * Who or what this is. Not printed on the certificate -- it is the image's
   * `alt` text, and the only way somebody who cannot see the picture learns
   * what it was. Required for that reason: a nameless image is not saved.
   */
  name: string;
};

/** Long enough for "Help the Blind Foundation" or a name and a title. */
const MAX_NAME_LENGTH = 80;

export { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES };

/**
 * Cleans a list coming from the settings form or the database.
 *
 * Runs on the server on every save as well as in the browser: the form is a
 * client component, so what reaches the action is whatever the caller sent.
 */
export function normaliseNamedImages(values: readonly NamedImage[], max: number): NamedImage[] {
  const seen = new Set<string>();
  const cleaned: NamedImage[] = [];

  for (const value of values ?? []) {
    const url = typeof value?.url === 'string' ? value.url.trim() : '';
    const name =
      typeof value?.name === 'string'
        ? value.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
        : '';

    // Both halves are required. A nameless picture is invisible to a screen
    // reader, and a name with no picture has nothing to label.
    if (!url || !name || seen.has(url)) continue;

    seen.add(url);
    cleaned.push({ url, name });
    if (cleaned.length === max) break;
  }

  return cleaned;
}
