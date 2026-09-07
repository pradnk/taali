'use client';

import { upload } from '@vercel/blob/client';

import {
  completeGeneration,
  failGeneration,
  prepareGeneration,
} from '@/app/admin/actions';
import { decodeAudio, loadBeds } from '@/lib/audio/decode';
import { encodeMp3 } from '@/lib/audio/encode';
import { renderCertificate, type ClipMap } from '@/lib/audio/mix';
import type { ScriptSnapshot } from '@/lib/db/schema';
import { certificateFileBase } from '@/lib/filename';

/**
 * Produces one finished certificate, end to end, from the browser.
 *
 * Everything expensive happens here rather than on the server: the tab holds
 * the audio engine, so a batch of forty certificates costs no function time and
 * cannot hit a serverless timeout. The server is only asked for the script, for
 * synthesised speech, and to record the result.
 */

export const STAGE_LABELS = {
  preparing: 'Working out the wording',
  speaking: 'Recording the voice',
  mixing: 'Adding the applause',
  encoding: 'Packaging the audio',
  uploading: 'Saving',
  done: 'Ready',
} as const;

export type GenerationStage = keyof typeof STAGE_LABELS;

export type GenerateOptions = {
  certificateId: string;
  eventName: string;
  studentName: string;
  onStage?: (stage: GenerationStage) => void;
};

export type GenerateResult = {
  audioUrl: string;
  durationMs: number;
  charsBilled: number;
  measuredLufs: number;
};

type TtsResponse = {
  clips?: Array<{ id: string; url: string; cached: boolean }>;
  charsBilled?: number;
  error?: string;
  retryable?: boolean;
};

class GenerationError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'GenerationError';
    this.retryable = retryable;
  }
}

async function synthesizeClips(
  snapshot: ScriptSnapshot,
): Promise<{ clips: ClipMap; charsBilled: number }> {
  const response = await fetch('/api/admin/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voiceId: snapshot.voiceId,
      modelId: snapshot.modelId,
      segments: snapshot.segments.map((segment) => ({
        id: segment.id,
        spoken: segment.spoken,
        speed: segment.speed,
      })),
    }),
  });

  let body: TtsResponse;
  try {
    body = (await response.json()) as TtsResponse;
  } catch {
    throw new GenerationError(
      `The voice service could not be reached (${response.status}).`,
      true,
    );
  }

  if (!response.ok || !body.clips) {
    throw new GenerationError(
      body.error ?? `The voice service returned ${response.status}.`,
      body.retryable ?? response.status >= 500,
    );
  }

  // Fetch and decode every clip at once; they are small and already on a CDN.
  const decoded = await Promise.all(
    body.clips.map(async (clip) => {
      const audio = await fetch(clip.url);
      if (!audio.ok) {
        throw new GenerationError(`Could not download the "${clip.id}" clip.`, true);
      }
      return [clip.id, await decodeAudio(await audio.arrayBuffer())] as const;
    }),
  );

  return {
    clips: Object.fromEntries(decoded) as ClipMap,
    charsBilled: body.charsBilled ?? 0,
  };
}

export async function generateCertificate(options: GenerateOptions): Promise<GenerateResult> {
  const stage = (next: GenerationStage) => options.onStage?.(next);

  try {
    stage('preparing');
    const snapshot = await prepareGeneration(options.certificateId);

    stage('speaking');
    // The backing tracks load in parallel with synthesis, and are cached across
    // the whole batch, so only the first certificate waits for them.
    const [{ clips, charsBilled }, beds] = await Promise.all([
      synthesizeClips(snapshot),
      loadBeds(),
    ]);

    stage('mixing');
    const mix = await renderCertificate(snapshot.segments, clips, beds);

    stage('encoding');
    const mp3 = await encodeMp3(mix.samples, mix.sampleRate);

    stage('uploading');
    const base = certificateFileBase(options.eventName, options.studentName);
    const blob = await upload(`certificates/${base}.mp3`, mp3, {
      access: 'public',
      handleUploadUrl: '/api/admin/blob-token',
      contentType: 'audio/mpeg',
    });

    await completeGeneration(options.certificateId, {
      audioUrl: blob.url,
      durationMs: mix.durationMs,
    });

    stage('done');
    return {
      audioUrl: blob.url,
      durationMs: mix.durationMs,
      charsBilled,
      measuredLufs: mix.measuredLufs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    // Record the failure so the row shows why, and so a later Retry knows this
    // one still needs doing. If even this fails, the original error still wins.
    await failGeneration(options.certificateId, message).catch(() => {});
    throw error;
  }
}

export { GenerationError };
