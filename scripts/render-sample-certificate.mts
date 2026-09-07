/**
 * Renders a sample certificate outside the browser, for verification.
 *
 *   npm run sample
 *
 * Runs the real mixing engine (src/lib/audio/mix.ts) against the real backing
 * tracks, substituting synthesised tones for the narration clips so that no
 * ElevenLabs credits are spent. It writes sample-certificate.mp3 in the project
 * root and prints the measurements that matter.
 *
 * This exists because the mixer is the part of the system with the least
 * margin for error and the most awkward to test: it needs a Web Audio
 * implementation, and its output is a sound rather than a value. Checking the
 * loudness, the peak and -- crucially -- that the applause really is pushed
 * down underneath the speech catches the failures that would otherwise only
 * turn up when someone plays a certificate at an awards ceremony.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioBuffer, OfflineAudioContext } from 'node-web-audio-api';
import { Mp3Encoder } from '@breezystack/lamejs';

// The mixer expects these as globals, exactly as a browser provides them.
Object.assign(globalThis, { OfflineAudioContext, AudioBuffer });

const { renderCertificate } = await import('../src/lib/audio/mix.ts');
const { BEDS, SAMPLE_RATE, TIMING } = await import('../src/lib/audio/score.ts');
const { integratedLoudness } = await import('../src/lib/audio/loudness.ts');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readWav(path: string): Float32Array {
  const bytes = readFileSync(path);
  let offset = 12;
  while (offset < bytes.length - 8) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'data') {
      const count = size / 2;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i += 1) samples[i] = bytes.readInt16LE(offset + 8 + i * 2) / 32768;
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No data chunk in ${path}`);
}

function toAudioBuffer(samples: Float32Array): AudioBuffer {
  const buffer = new AudioBuffer({
    numberOfChannels: 1,
    length: samples.length,
    sampleRate: SAMPLE_RATE,
  });
  buffer.copyToChannel(new Float32Array(samples), 0);
  return buffer;
}

/** Stand-in for a narration clip: a voice-like tone at a realistic level. */
function speechLike(seconds: number, fundamental: number): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    // A few harmonics plus syllable-rate amplitude modulation, so the loudness
    // meter sees something with speech-like statistics rather than a pure tone.
    const syllables = 0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 3.2 * t));
    const edge = Math.min(1, t / 0.02, (seconds - t) / 0.02);
    samples[i] =
      0.22 *
      edge *
      syllables *
      (Math.sin(2 * Math.PI * fundamental * t) +
        0.5 * Math.sin(2 * Math.PI * fundamental * 2 * t) +
        0.25 * Math.sin(2 * Math.PI * fundamental * 3 * t));
  }
  return samples;
}

const segments = [
  { id: 'intro', text: '', spoken: '', speed: 1, shared: true },
  { id: 'awardLine', text: '', spoken: '', speed: 1, shared: true },
  { id: 'name', text: '', spoken: '', speed: 0.9, shared: false },
  { id: 'citation', text: '', spoken: '', speed: 1, shared: false },
  { id: 'prize', text: '', spoken: '', speed: 1, shared: false },
  { id: 'closing', text: '', spoken: '', speed: 1, shared: true },
] as const;

const clipLengths: Record<string, number> = {
  intro: 7.4,
  awardLine: 1.7,
  name: 1.5,
  citation: 7.8,
  prize: 1.1,
  closing: 6.2,
};

const clips = Object.fromEntries(
  Object.entries(clipLengths).map(([id, seconds], index) => [
    id,
    toAudioBuffer(speechLike(seconds, 120 + index * 8)),
  ]),
);

const beds = Object.fromEntries(
  (Object.keys(BEDS) as Array<keyof typeof BEDS>).map((bed) => [
    bed,
    toAudioBuffer(readWav(join(ROOT, 'public', BEDS[bed].src))),
  ]),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness
const mix = await renderCertificate(segments as any, clips as any, beds as any);

console.log('Rendered certificate');
console.log(`  duration       ${(mix.durationMs / 1000).toFixed(2)} s`);
console.log(`  measured       ${mix.measuredLufs.toFixed(2)} LUFS (before normalising)`);
console.log(`  gain applied   ${mix.appliedGainDb >= 0 ? '+' : ''}${mix.appliedGainDb.toFixed(2)} dB`);
console.log(`  final peak     ${(20 * Math.log10(mix.peak)).toFixed(2)} dBFS`);
console.log(`  final loudness ${integratedLoudness(mix.samples, mix.sampleRate).toFixed(2)} LUFS`);

// Ducking check: compare the applause-only stretch against the stretch where
// the closing line plays over it. The second must be measurably quieter in the
// backing track, which is what keeps the words intelligible.
const at = (seconds: number) => Math.round(seconds * mix.sampleRate);
const rms = (from: number, to: number) => {
  let total = 0;
  for (let i = at(from); i < at(to); i += 1) total += mix.samples[i] ** 2;
  return 20 * Math.log10(Math.sqrt(total / (at(to) - at(from))));
};

const closing = mix.timeline.speech.find((cue) => cue.id === 'closing')!;
const applause = mix.timeline.beds.find((cue) => cue.bed === 'applause')!;

console.log('\nSpeech over applause (the closing line must dominate)');
console.log(`  applause alone       ${rms(applause.at + 1.8, closing.at - 0.5).toFixed(1)} dB`);
console.log(
  `  closing line + bed   ${rms(closing.at + 0.6, closing.at + closing.duration - 0.3).toFixed(1)} dB`,
);

/*
 * The measurement above includes the speech, so it shows the words winning but
 * says nothing about what happened to the crowd underneath them. Rendering the
 * same score again with the narration replaced by silence leaves only the beds,
 * which is the only way to see the ducking itself.
 */
const silentClips = Object.fromEntries(
  Object.entries(clipLengths).map(([id, seconds]) => [
    id,
    toAudioBuffer(new Float32Array(Math.round(seconds * SAMPLE_RATE))),
  ]),
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness
const bedsOnly = await renderCertificate(segments as any, silentClips as any, beds as any);

const bedRms = (from: number, to: number) => {
  let total = 0;
  for (let i = at(from); i < at(to); i += 1) total += bedsOnly.samples[i] ** 2;
  return 20 * Math.log10(Math.sqrt(total / (at(to) - at(from))));
};
const unducked = bedRms(applause.at + 1.8, closing.at - 0.5);
const ducked = bedRms(closing.at + 0.6, closing.at + closing.duration - 0.3);

console.log('\nDucking, measured on the beds alone');
console.log(`  applause at full     ${unducked.toFixed(1)} dB`);
console.log(`  applause under speech ${ducked.toFixed(1)} dB`);
console.log(
  `  pushed down by       ${(unducked - ducked).toFixed(1)} dB  (score asks for ${-TIMING.duckDb} dB)`,
);
/*
 * That measured figure under-reports, and by a knowable amount. A beds-only
 * render has no speech in it, so loudness normalisation applies a large makeup
 * gain and drives the loud applause into the soft limiter while the ducked
 * section stays below the knee -- squashing the loud half and narrowing the
 * apparent gap. The gain applied is printed so the discrepancy is legible
 * rather than mysterious.
 */
console.log(
  `  (beds-only render was lifted ${bedsOnly.appliedGainDb.toFixed(1)} dB and peaks at ` +
    `${(20 * Math.log10(bedsOnly.peak)).toFixed(1)} dBFS, so the limiter compresses the loud half)`,
);

/*
 * The number that actually decides whether the closing line is intelligible:
 * how far the speech sits above the crowd underneath it.
 */
const speechOverBed =
  rms(closing.at + 0.6, closing.at + closing.duration - 0.3) -
  bedRms(closing.at + 0.6, closing.at + closing.duration - 0.3);
console.log(`\n  speech sits ${speechOverBed.toFixed(1)} dB above the crowd during the closing line`);
console.log(
  `  swells back after    ${bedRms(closing.at + closing.duration + 0.9, closing.at + closing.duration + 1.8).toFixed(1)} dB`,
);

console.log('\nSilence around the name (should be near-silent apart from the quiet room tone)');
const name = mix.timeline.speech.find((cue) => cue.id === 'name')!;
console.log(`  before the name      ${rms(name.at - 0.35, name.at - 0.06).toFixed(1)} dB`);
console.log(`  the name itself      ${rms(name.at + 0.1, name.at + name.duration - 0.1).toFixed(1)} dB`);
console.log(`  after the name       ${rms(name.at + name.duration + 0.08, name.at + name.duration + 0.45).toFixed(1)} dB`);

// Encode with the same settings the browser uses.
const pcm = new Int16Array(mix.samples.length);
for (let i = 0; i < mix.samples.length; i += 1) {
  const clamped = Math.max(-1, Math.min(1, mix.samples[i]));
  pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}
const encoder = new Mp3Encoder(1, mix.sampleRate, 128);
const chunks: Buffer[] = [];
for (let offset = 0; offset < pcm.length; offset += 1152) {
  const encoded = encoder.encodeBuffer(pcm.subarray(offset, offset + 1152));
  if (encoded.length > 0) chunks.push(Buffer.from(encoded));
}
const tail = encoder.flush();
if (tail.length > 0) chunks.push(Buffer.from(tail));

const mp3 = Buffer.concat(chunks);
const outPath = join(ROOT, 'sample-certificate.mp3');
writeFileSync(outPath, mp3);
console.log(`\nWrote ${outPath} (${(mp3.length / 1024).toFixed(0)} KB) — play it to hear the score.`);
