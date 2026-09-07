import { BEDS, SAMPLE_RATE, type BedId } from './score';

/**
 * Audio decoding and backing-track loading. Browser only.
 */

let sharedContext: BaseAudioContext | undefined;

function decodeContext(): BaseAudioContext {
  if (!sharedContext) {
    // An OfflineAudioContext resamples whatever it decodes to its own rate, so
    // every clip arrives at 48 kHz regardless of what the voice engine or the
    // sound files were recorded at. It also needs no user gesture to exist,
    // unlike a live AudioContext.
    sharedContext = new OfflineAudioContext({
      numberOfChannels: 1,
      length: 1,
      sampleRate: SAMPLE_RATE,
    });
  }
  return sharedContext;
}

/** Note: decoding detaches `data`; do not reuse the ArrayBuffer afterwards. */
export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return decodeContext().decodeAudioData(data);
}

const bedCache = new Map<BedId, AudioBuffer>();

async function loadBed(bed: BedId): Promise<AudioBuffer> {
  const cached = bedCache.get(bed);
  if (cached) return cached;

  const response = await fetch(BEDS[bed].src);
  if (!response.ok) {
    throw new Error(
      `Could not load the ${bed} sound (${BEDS[bed].src} returned ${response.status}). ` +
        'Check that the audio files are present in public/audio.',
    );
  }
  const buffer = await decodeAudio(await response.arrayBuffer());
  bedCache.set(bed, buffer);
  return buffer;
}

/**
 * Loads every backing track once and keeps them in memory. Called before a
 * batch so that generating forty certificates fetches the applause once, not
 * forty times.
 */
export async function loadBeds(): Promise<Record<BedId, AudioBuffer>> {
  const ids = Object.keys(BEDS) as BedId[];
  const buffers = await Promise.all(ids.map(loadBed));
  return Object.fromEntries(ids.map((id, index) => [id, buffers[index]])) as Record<
    BedId,
    AudioBuffer
  >;
}
