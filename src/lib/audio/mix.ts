import type { ScriptSegment } from '@/lib/db/schema';
import { integratedLoudness, peakAmplitude } from './loudness';
import { BEDS, SAMPLE_RATE, planTimeline, type BedId, type Timeline } from './score';

/**
 * Assembles one certificate into a single mono audio buffer, in the browser.
 *
 * Runs on OfflineAudioContext rather than server-side ffmpeg: the browser
 * already ships a professional audio engine, a 45-second piece renders in well
 * under a second, and a batch of forty certificates never touches a serverless
 * function timeout or a 250 MB bundle limit.
 */

export type ClipMap = Partial<Record<ScriptSegment['id'], AudioBuffer>>;

export type MixResult = {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  /** Measured before normalisation, useful for diagnosing a bad recording. */
  measuredLufs: number;
  appliedGainDb: number;
  /** Peak amplitude after limiting. Should always be below 1.0. */
  peak: number;
  timeline: Timeline;
};

/**
 * Broadcast-style target. Around -16 LUFS is the convention for speech content
 * played on phones and laptops: loud enough to hear over a noisy room without
 * being fatiguing, and matching what podcast apps and WhatsApp voice notes
 * sound like, so a certificate does not arrive jarringly quieter or louder than
 * the message before it.
 */
const TARGET_LUFS = -16;

/** Guard rails, so a near-silent or clipped input cannot be wildly amplified. */
const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = 20;

/** Where the soft limiter starts bending peaks, in linear amplitude. */
const LIMIT_THRESHOLD = 0.75;

/**
 * The hardest the output is ever allowed to hit: -1 dBFS.
 *
 * Not 1.0. An MP3 decoder reconstructs a waveform that can overshoot the sample
 * values it was encoded from, so a mix that peaks at digital full scale comes
 * back distorted on playback -- worst on the cheap phone speakers most of these
 * certificates will be heard through. A decibel of headroom costs nothing
 * audible and removes the risk.
 */
const CEILING = 0.891;

export async function renderCertificate(
  segments: ScriptSegment[],
  clips: ClipMap,
  beds: Record<BedId, AudioBuffer>,
): Promise<MixResult> {
  const durations: Partial<Record<ScriptSegment['id'], number>> = {};
  for (const segment of segments) {
    const clip = clips[segment.id];
    if (clip) durations[segment.id] = clip.duration;
  }

  const timeline = planTimeline(segments, durations);
  const rendered = await renderTimeline(timeline, clips, beds);

  // Copied out of the AudioBuffer rather than used in place. getChannelData
  // hands back a live view the buffer still owns, and the batch runner renders
  // two certificates at once -- so the caller must own its samples outright,
  // and normalising below must not write into an engine-owned buffer.
  const samples = new Float32Array(rendered.getChannelData(0));

  const measuredLufs = integratedLoudness(samples, SAMPLE_RATE);
  const appliedGainDb = Number.isFinite(measuredLufs)
    ? Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, TARGET_LUFS - measuredLufs))
    : 0;

  // Normalise and limit in one pass over the samples rather than with a
  // DynamicsCompressor in the graph. It is deterministic, avoids the pumping a
  // compressor's release can introduce under sustained applause, and saves a
  // second render.
  applyGainAndSoftLimit(samples, 10 ** (appliedGainDb / 20));

  return {
    samples,
    sampleRate: SAMPLE_RATE,
    durationMs: Math.round(timeline.duration * 1000),
    measuredLufs,
    appliedGainDb,
    peak: peakAmplitude(samples),
    timeline,
  };
}

async function renderTimeline(
  timeline: Timeline,
  clips: ClipMap,
  beds: Record<BedId, AudioBuffer>,
): Promise<AudioBuffer> {
  const context = new OfflineAudioContext({
    numberOfChannels: 1,
    length: Math.ceil(timeline.duration * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
  });

  const master = context.createGain();
  master.connect(context.destination);

  // One shared bus for everything that gets pulled down under speech. Routing
  // the beds through a single ducked node means the envelope is computed once
  // and every bed stays perfectly in step with it.
  const duckBus = context.createGain();
  duckBus.connect(master);
  automate(duckBus.gain, timeline.duckAutomation, 0, context);

  for (const cue of timeline.speech) {
    const clip = clips[cue.id];
    if (!clip) continue;
    const source = context.createBufferSource();
    source.buffer = clip;
    source.connect(master);
    source.start(cue.at);
  }

  for (const cue of timeline.beds) {
    const buffer = beds[cue.bed];
    if (!buffer) continue;

    const source = context.createBufferSource();
    source.buffer = buffer;
    if (cue.loop) {
      // The applause and ambience files are shorter than the tail they have to
      // cover, so they loop rather than falling silent mid-cheer.
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
    }

    const gain = context.createGain();
    automate(gain.gain, cue.envelope, cue.at, context);

    source.connect(gain);
    gain.connect(BEDS[cue.bed].ducks ? duckBus : master);
    source.start(cue.at);
    source.stop(cue.at + cue.duration);
  }

  return context.startRendering();
}

function automate(
  param: AudioParam,
  points: Array<{ t: number; gain: number }>,
  offset: number,
  context: BaseAudioContext,
): void {
  if (points.length === 0) return;
  const clamp = (time: number) => Math.max(0, Math.min(time, context.currentTime + 1e9));

  param.setValueAtTime(points[0].gain, clamp(offset + points[0].t));
  for (let i = 1; i < points.length; i += 1) {
    param.linearRampToValueAtTime(points[i].gain, clamp(offset + points[i].t));
  }
}

/**
 * Scales the mix to the target loudness, bending anything that would overshoot
 * instead of letting it clip.
 *
 * The curve is smooth all the way to unity, so a loud burst of applause gets
 * gently compressed rather than squared off into distortion -- which on a small
 * phone speaker is the difference between a crowd and a buzz.
 */
function applyGainAndSoftLimit(samples: Float32Array, gain: number): void {
  const headroom = CEILING - LIMIT_THRESHOLD;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] * gain;
    const magnitude = Math.abs(value);
    if (magnitude <= LIMIT_THRESHOLD) {
      samples[i] = value;
    } else {
      const excess = (magnitude - LIMIT_THRESHOLD) / headroom;
      samples[i] = Math.sign(value) * (LIMIT_THRESHOLD + headroom * Math.tanh(excess));
    }
  }
}
