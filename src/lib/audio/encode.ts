import type { EncodeRequest, EncodeResponse } from './encode.worker';

/**
 * Mono at 128 kbps: about 700 KB for a 45-second certificate. Small enough to
 * forward on WhatsApp over a patchy connection, which is how most families will
 * actually receive it, and stereo would add nothing to a mono voice recording.
 */
const BITRATE_KBPS = 128;

let worker: Worker | undefined;
let nextRequestId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/**
 * Encodes rendered samples to an MP3 blob.
 *
 * The samples are copied before being handed to the worker: transferring an
 * AudioBuffer's own backing store would detach it, and the caller may still
 * want it for waveform display or a retry.
 */
export function encodeMp3(samples: Float32Array, sampleRate: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const copy = new Float32Array(samples);
    const active = getWorker();
    const requestId = nextRequestId;
    nextRequestId += 1;

    const onMessage = (event: MessageEvent<EncodeResponse>) => {
      // The worker is shared across concurrent encodes; ignore other callers'
      // replies rather than resolving with the wrong certificate's audio.
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok) {
        resolve(new Blob([event.data.mp3 as BlobPart], { type: 'audio/mpeg' }));
      } else {
        reject(new Error(`Could not encode the audio: ${event.data.error}`));
      }
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      // A worker that has errored is not reusable; drop it so the next attempt
      // starts a fresh one rather than hanging forever.
      worker?.terminate();
      worker = undefined;
      reject(new Error(`Could not encode the audio: ${event.message}`));
    };

    function cleanup() {
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
    }

    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);

    const request: EncodeRequest = {
      requestId,
      samples: copy,
      sampleRate,
      bitrateKbps: BITRATE_KBPS,
    };
    active.postMessage(request, [copy.buffer]);
  });
}
