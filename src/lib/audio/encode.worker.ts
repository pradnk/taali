/// <reference lib="webworker" />
import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * MP3 encoding, off the main thread.
 *
 * Encoding a 45-second certificate takes a few hundred milliseconds. Done
 * inline that is invisible for one certificate and a frozen, unresponsive tab
 * for a batch of forty -- exactly when the operator most needs to see progress.
 */

export type EncodeRequest = {
  /**
   * Correlates a response with its request. The worker is shared, and the batch
   * runner encodes more than one certificate at a time, so without this a
   * caller could resolve with another certificate's audio.
   */
  requestId: number;
  samples: Float32Array;
  sampleRate: number;
  bitrateKbps: number;
};

export type EncodeResponse = { requestId: number } & (
  | { ok: true; mp3: Uint8Array }
  | { ok: false; error: string }
);

/** lamejs works in 16-bit PCM; AudioBuffers are floats in the range -1..1. */
function toInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

/** lamejs is happiest fed exactly one MP3 frame of samples at a time. */
const FRAME_SIZE = 1152;

function encode(request: EncodeRequest): Uint8Array {
  const pcm = toInt16(request.samples);
  const encoder = new Mp3Encoder(1, request.sampleRate, request.bitrateKbps);
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < pcm.length; offset += FRAME_SIZE) {
    const frame = pcm.subarray(offset, offset + FRAME_SIZE);
    const encoded = encoder.encodeBuffer(frame);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mp3 = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    mp3.set(chunk, position);
    position += chunk.length;
  }
  return mp3;
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { requestId } = event.data;
  try {
    const mp3 = encode(event.data);
    const response: EncodeResponse = { requestId, ok: true, mp3 };
    (self as DedicatedWorkerGlobalScope).postMessage(response, [mp3.buffer as ArrayBuffer]);
  } catch (error) {
    const response: EncodeResponse = {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  }
};
