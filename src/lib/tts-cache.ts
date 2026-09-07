import 'server-only';

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { ttsCache } from '@/lib/db/schema';
import { synthesize } from '@/lib/elevenlabs';

/**
 * Content-addressed store for synthesised speech.
 *
 * Every clip is keyed by a hash of exactly the inputs that determine its sound.
 * That single mechanism pays for itself three times over:
 *
 *   - the event intro and closing are identical for all 45 students, so they
 *     are billed once instead of 45 times;
 *   - previewing a name's pronunciation is free after the first play, which is
 *     what makes it reasonable to audit an entire list;
 *   - re-running a batch after one row failed re-bills nothing that already
 *     succeeded.
 */

export type ClipRequest = {
  text: string;
  voiceId: string;
  modelId: string;
  speed: number;
};

export type ClipResult = {
  url: string;
  /** False when this call actually spent credits. */
  cached: boolean;
  chars: number;
};

export function clipHash(request: ClipRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([request.text, request.voiceId, request.modelId, request.speed.toFixed(2)]),
    )
    .digest('hex')
    .slice(0, 40);
}

export async function getOrCreateClip(request: ClipRequest): Promise<ClipResult> {
  const hash = clipHash(request);

  const [hit] = await db().select().from(ttsCache).where(eq(ttsCache.hash, hash)).limit(1);
  if (hit) return { url: hit.url, cached: true, chars: 0 };

  const audio = await synthesize({
    text: request.text,
    voiceId: request.voiceId,
    modelId: request.modelId,
    speed: request.speed,
  });

  const blob = await put(`tts/${hash}.mp3`, Buffer.from(audio), {
    access: 'public',
    contentType: 'audio/mpeg',
    // The key is derived from the content, so a collision means the identical
    // clip -- overwriting is always safe and keeps the path predictable.
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 31_536_000,
  });

  await db()
    .insert(ttsCache)
    .values({ hash, url: blob.url, chars: request.text.length })
    .onConflictDoNothing();

  return { url: blob.url, cached: false, chars: request.text.length };
}
