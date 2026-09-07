import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

import { isAdmin, unauthorized } from '@/lib/auth-server';

/**
 * Signs direct browser-to-Blob uploads for finished certificate files.
 *
 * The alternative -- POSTing the audio to a function which then forwards it --
 * would push every 700 KB file through a serverless invocation for no benefit.
 * Uploading straight from the tab keeps a 45-certificate batch off the function
 * budget entirely.
 */

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The session was already checked above; this is the last chance to
        // constrain *what* an authenticated tab is allowed to write.
        if (!pathname.startsWith('certificates/')) {
          throw new Error('Uploads are only allowed under certificates/.');
        }
        return {
          // PDFs join the MP3s so that a certificate can be handed to
          // somebody as a link rather than as an attachment. Both are rendered
          // in the tab, so both are uploaded from it.
          allowedContentTypes: ['audio/mpeg', 'application/pdf'],
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
          cacheControlMaxAge: 31_536_000,
        };
      },
      onUploadCompleted: async () => {
        // The client writes the resulting URL onto the certificate row itself,
        // so there is nothing to do here. Vercel requires the callback to exist.
      },
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload could not be authorised.';
    return Response.json({ error: message }, { status: 400 });
  }
}
