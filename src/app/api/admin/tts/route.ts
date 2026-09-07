import { isAdmin, unauthorized } from '@/lib/auth-server';
import { mapLimit } from '@/lib/concurrency';
import { ElevenLabsError } from '@/lib/elevenlabs';
import { getOrCreateClip } from '@/lib/tts-cache';

/**
 * Synthesises the clips for one certificate (or a single name preview) and
 * returns URLs the browser can fetch and mix.
 *
 * The audio never passes through this response body -- only Blob URLs -- so the
 * function stays small and fast regardless of how long the certificate is.
 */

export const runtime = 'nodejs';
/** Well inside Vercel's limits: this only waits on ElevenLabs, never on mixing. */
export const maxDuration = 60;

/** Parallel synthesis, capped to stay clear of the account rate limit. */
const CONCURRENCY = 3;

type RequestBody = {
  voiceId?: string;
  modelId?: string;
  segments?: Array<{ id?: string; spoken?: string; speed?: number }>;
};

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const { voiceId, modelId, segments } = body;
  if (!voiceId || !modelId || !Array.isArray(segments) || segments.length === 0) {
    return Response.json(
      { error: 'voiceId, modelId and a non-empty segments array are required.' },
      { status: 400 },
    );
  }

  const requests = segments.map((segment) => ({
    id: String(segment.id ?? ''),
    text: String(segment.spoken ?? '').trim(),
    speed: typeof segment.speed === 'number' ? segment.speed : 1,
  }));

  const empty = requests.find((segment) => !segment.text);
  if (empty) {
    return Response.json(
      { error: `Segment "${empty.id}" has no text to speak.` },
      { status: 400 },
    );
  }

  try {
    const clips = await mapLimit(requests, CONCURRENCY, async (segment) => {
      const clip = await getOrCreateClip({
        text: segment.text,
        voiceId,
        modelId,
        speed: segment.speed,
      });
      return { id: segment.id, ...clip };
    });

    return Response.json({
      clips,
      charsBilled: clips.reduce((total, clip) => total + clip.chars, 0),
    });
  } catch (error) {
    if (error instanceof ElevenLabsError) {
      // 429 and 5xx are surfaced as 503 so the client's batch runner knows the
      // row is worth retrying, rather than marking it permanently failed.
      return Response.json(
        { error: error.message, retryable: error.retryable },
        { status: error.retryable ? 503 : 502 },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return Response.json({ error: message, retryable: false }, { status: 500 });
  }
}
