import { put } from '@vercel/blob';

import { isAdmin, unauthorized } from '@/lib/auth-server';
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '@/lib/logo';

/**
 * Uploads an organisation logo and returns its URL.
 *
 * Server-side rather than a signed direct-to-Blob upload, unlike the finished
 * certificate audio: a logo is a couple of hundred kilobytes uploaded once per
 * event, so routing it through a function costs nothing and lets the type and
 * size be checked before anything is stored. It also works before the event
 * exists, which is what allows a logo to be chosen on the create form.
 */

export const runtime = 'nodejs';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();

  let file: File | null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return Response.json({ error: 'Expected a file upload.' }, { status: 400 });
  }

  if (!file) {
    return Response.json({ error: 'No file was chosen.' }, { status: 400 });
  }

  if (!LOGO_CONTENT_TYPES.includes(file.type as (typeof LOGO_CONTENT_TYPES)[number])) {
    return Response.json(
      { error: 'The logo must be a PNG, JPEG, WebP or SVG image.' },
      { status: 415 },
    );
  }

  if (file.size > LOGO_MAX_BYTES) {
    return Response.json(
      {
        error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please use one under ${LOGO_MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  const blob = await put(`logos/logo.${EXTENSIONS[file.type]}`, file, {
    access: 'public',
    contentType: file.type,
    // A random suffix rather than a fixed name: replacing a logo must not
    // silently change every certificate already printed with the old one still
    // cached, and old files are cheap to keep.
    addRandomSuffix: true,
    cacheControlMaxAge: 31_536_000,
  });

  return Response.json({ url: blob.url });
}
