import 'server-only';

import { env } from '@/lib/env';
import { modelSupportsSpeed } from '@/lib/languages';

/**
 * Thin ElevenLabs client. Server-side only -- the `server-only` import above
 * makes it a build error to pull this into a client component, which is the
 * safety net that keeps the API key out of the browser bundle.
 */

const API_ROOT = 'https://api.elevenlabs.io/v1';

/**
 * 44.1 kHz / 128 kbps. The mix is re-encoded afterwards anyway, so this is
 * about giving the mixer clean source material rather than the final size.
 * mp3_44100_192 would be marginally better but needs a Creator-tier account.
 */
const OUTPUT_FORMAT = 'mp3_44100_128';

export type SynthesizeOptions = {
  text: string;
  voiceId: string;
  modelId: string;
  /** Speaking rate. Silently ignored by models that do not support it. */
  speed?: number;
};

export class ElevenLabsError extends Error {
  readonly status: number;
  /** True when retrying later might work (rate limit, transient 5xx). */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Turns an API failure into something a volunteer running an event can act on,
 * rather than a bare status code.
 */
async function describeFailure(response: Response): Promise<ElevenLabsError> {
  let detail = '';
  try {
    const body = (await response.json()) as { detail?: { message?: string; status?: string } | string };
    detail =
      typeof body.detail === 'string' ? body.detail : (body.detail?.message ?? body.detail?.status ?? '');
  } catch {
    // Non-JSON error body; the status alone will have to do.
  }

  switch (response.status) {
    case 401:
      return new ElevenLabsError(
        'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY in the project settings.',
        401,
        false,
      );
    case 402:
      /*
       * 402 covers two different problems that need opposite responses:
       * running out of credits, and the free plan refusing to use a Voice
       * Library voice over the API. Reporting either as "out of credits" sends
       * someone off to buy credits they may already have, so ElevenLabs' own
       * wording is passed through and only the remedy is added.
       */
      return new ElevenLabsError(
        detail
          ? `ElevenLabs refused the request: ${detail}`
          : 'ElevenLabs refused the request — check the plan and remaining credits.',
        402,
        false,
      );
    case 422:
      return new ElevenLabsError(
        `ElevenLabs could not read that text${detail ? `: ${detail}` : ''}. Check the wording and the pronunciation field for stray characters.`,
        422,
        false,
      );
    case 429:
      return new ElevenLabsError(
        'ElevenLabs is rate limiting this account. Generation will retry automatically in a moment.',
        429,
        true,
      );
    default:
      return new ElevenLabsError(
        `ElevenLabs returned ${response.status}${detail ? `: ${detail}` : ''}.`,
        response.status,
        response.status >= 500,
      );
  }
}

async function requestSpeech(options: SynthesizeOptions): Promise<ArrayBuffer> {
  const url = `${API_ROOT}/text-to-speech/${encodeURIComponent(options.voiceId)}?output_format=${OUTPUT_FORMAT}`;

  const voiceSettings: Record<string, number | boolean> = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    use_speaker_boost: true,
  };
  if (options.speed !== undefined && modelSupportsSpeed(options.modelId)) {
    voiceSettings.speed = options.speed;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': env.elevenLabsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: options.text,
      model_id: options.modelId,
      voice_settings: voiceSettings,
    }),
    cache: 'no-store',
  });

  if (!response.ok) throw await describeFailure(response);
  return response.arrayBuffer();
}

/** Synthesises one clip, retrying the failures that are worth retrying. */
export async function synthesize(options: SynthesizeOptions, attempts = 3): Promise<ArrayBuffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestSpeech(options);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ElevenLabsError ? error.retryable : true;
      if (!retryable || attempt === attempts) break;
      // Back off before trying again: 0.8s, then 2.4s.
      await new Promise((resolve) => setTimeout(resolve, 800 * 3 ** (attempt - 1)));
    }
  }

  throw lastError;
}

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  /**
   * "premade" for the stock voices every account has, "professional" for ones
   * added from the Voice Library. The distinction matters: library voices are
   * refused over the API on free plans.
   */
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
};

/** Voices available to this account, for the event settings picker. */
export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const response = await fetch(`${API_ROOT}/voices`, {
    headers: { 'xi-api-key': env.elevenLabsApiKey },
    /*
     * Never cached. The one moment anybody loads the settings page is straight
     * after adding a voice in the ElevenLabs Voice Library, and a cached list
     * would tell them it is not there. It is a single small request against a
     * page that is already dynamic.
     */
    cache: 'no-store',
  });
  if (!response.ok) throw await describeFailure(response);
  const body = (await response.json()) as { voices?: ElevenLabsVoice[] };
  return body.voices ?? [];
}
