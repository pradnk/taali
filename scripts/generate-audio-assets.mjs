/**
 * Generates the backing tracks for the certificate score.
 *
 *   node scripts/generate-audio-assets.mjs
 *
 * Everything is synthesised from noise and sine tones rather than sampled, for
 * two reasons. Licensing: a charity should not have to defend the provenance of
 * a sound file it found online, and audio generated here is unambiguously the
 * project's own. Reproducibility: the random number generator is seeded, so
 * re-running this produces byte-identical output, and the character of the
 * applause can be tuned by editing numbers rather than by hunting for a
 * different recording.
 *
 * The applause is the part worth understanding before changing anything. It is
 * not a random scatter of clicks -- that was the first attempt, and it sounds
 * like rain on a window. It is roughly a hundred people, each clapping
 * *periodically* at their own tempo, drifting against one another, at different
 * distances, in a room that smears the whole thing together. Those four
 * properties are what the ear uses to hear "a crowd" rather than "noise", and
 * `makeApplause` models each of them explicitly.
 *
 * If you would rather use a real recording, drop it into public/audio with the
 * same filename and record its licence in public/audio/CREDITS.md -- nothing
 * else needs to change.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 48_000;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');

// ---------------------------------------------------------------- utilities

/** Seeded PRNG, so every run produces identical files. */
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seconds = (n) => Math.round(n * SAMPLE_RATE);

/** RBJ cookbook biquad, applied in place. */
function biquad(buffer, { b0, b1, b2, a1, a2 }) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const x0 = buffer[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    buffer[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return buffer;
}

function lowpass(freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function highpass(freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function bandpass(freq, q = 1) {
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function normalise(buffer, target = 0.9) {
  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return buffer;
  const gain = target / peak;
  for (let i = 0; i < buffer.length; i += 1) buffer[i] *= gain;
  return buffer;
}

/**
 * Normalises to a target RMS rather than a target peak, soft-clipping whatever
 * pokes above the ceiling.
 *
 * Applause needs this and the one-shots do not. It is extremely peaky -- a
 * crest factor near 20 dB -- so normalising it by peak sets its *loudness*
 * according to whichever single clap happened to land hardest. Change the
 * synthesis a little, get a taller peak, and the whole bed quietly drops
 * several decibels underneath the narration even though nothing about the mix
 * was touched. Fixing the RMS instead keeps the balance against speech stable
 * across any future tweak to the crowd.
 */
function normaliseRms(buffer, targetDb = -17, ceiling = 0.97) {
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  const rms = Math.sqrt(sum / buffer.length);
  if (rms === 0) return buffer;

  const gain = 10 ** (targetDb / 20) / rms;
  const knee = ceiling * 0.75;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] * gain;
    const magnitude = Math.abs(value);
    if (magnitude <= knee) {
      buffer[i] = value;
    } else {
      const excess = (magnitude - knee) / (ceiling - knee);
      buffer[i] = Math.sign(value) * (knee + (ceiling - knee) * Math.tanh(excess));
    }
  }
  return buffer;
}

/**
 * Turns a longer buffer into a seamlessly looping one of `length` samples by
 * crossfading the overrun back over the start. Without this, looping applause
 * produces an audible click every time it wraps.
 */
function makeLoopable(buffer, length, fadeSamples) {
  const out = new Float32Array(length);
  out.set(buffer.subarray(0, length));
  for (let i = 0; i < fadeSamples; i += 1) {
    const t = i / fadeSamples;
    out[i] = out[i] * t + buffer[length + i] * (1 - t);
  }
  return out;
}

/** Normally-distributed random, for human timing jitter. */
function gaussian(random) {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/**
 * A feedback delay network reverb: four delay lines cross-mixed through a
 * Hadamard matrix, each damped by a one-pole lowpass in its feedback path.
 *
 * This is the single biggest thing standing between synthesised applause and
 * the real sound of a hall. Dry claps are just clicks; what makes a crowd sound
 * like a crowd is a few hundred milliseconds of reflections smearing every clap
 * into its neighbours. Damping in the feedback path makes high frequencies die
 * away faster than low ones, which is what air and soft furnishings actually do
 * and what stops the tail sounding metallic.
 *
 * Written in place of convolution with a recorded impulse response: convolving
 * eleven seconds against a 1.5-second tail is billions of operations, and an FDN
 * gets somewhere convincing in linear time.
 */
function reverb(input, { rt60 = 1.5, damping = 0.34, wet = 0.4, predelayMs = 14 } = {}) {
  // Mutually prime-ish lengths, so the delay lines never line up and produce a
  // ringing pitch.
  const delays = [1657, 2113, 2549, 2971];
  const lines = delays.map((d) => new Float32Array(d));
  const cursors = new Array(delays.length).fill(0);
  const lowpassState = new Array(delays.length).fill(0);
  // Per-line feedback gain chosen so every line decays over the same RT60.
  const gains = delays.map((d) => 10 ** ((-3 * d) / (rt60 * SAMPLE_RATE)));

  const predelay = Math.round((predelayMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(input.length);

  for (let i = 0; i < input.length; i += 1) {
    const source = i >= predelay ? input[i - predelay] : 0;

    const read = [0, 0, 0, 0];
    for (let l = 0; l < 4; l += 1) read[l] = lines[l][cursors[l]];

    // Hadamard: every line feeds every other, which is what builds density.
    const mixed = [
      0.5 * (read[0] + read[1] + read[2] + read[3]),
      0.5 * (read[0] - read[1] + read[2] - read[3]),
      0.5 * (read[0] + read[1] - read[2] - read[3]),
      0.5 * (read[0] - read[1] - read[2] + read[3]),
    ];

    for (let l = 0; l < 4; l += 1) {
      let value = source + mixed[l] * gains[l];
      // One-pole lowpass: the tail gets darker as it decays.
      lowpassState[l] += (value - lowpassState[l]) * (1 - damping);
      value = lowpassState[l];
      lines[l][cursors[l]] = value;
      cursors[l] = (cursors[l] + 1) % lines[l].length;
    }

    out[i] = input[i] * (1 - wet) + 0.25 * (read[0] + read[1] + read[2] + read[3]) * wet;
  }

  return out;
}

// ------------------------------------------------------------------- sounds

/**
 * A single hand clap.
 *
 * Modelled as two things rather than one, because that is what a clap is: a
 * very short broadband transient as the palms collide, then a brief resonant
 * "body" as the air cavity trapped between them rings. Cupped hands trap more
 * air and give a lower, hollower pop; flat hands give a bright crack. Rendering
 * only the transient -- which is what the first version of this did -- produces
 * something closer to static than to hands.
 *
 * `voice` carries the characteristics of one particular person's hands, so all
 * of their claps sound like each other and unlike their neighbour's.
 */
function addClap(buffer, at, voice, gain, random) {
  if (at < 0 || at >= buffer.length) return;

  const decay = voice.decay * (0.85 + random() * 0.3);
  const length = Math.min(seconds(decay * 5), buffer.length - at);
  if (length <= 0) return;

  const clap = new Float32Array(length);

  // The body: filtered noise ringing at the cavity resonance.
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    clap[i] = (random() * 2 - 1) * Math.exp(-t / decay);
  }
  biquad(clap, bandpass(voice.resonance * (0.92 + random() * 0.16), voice.q));

  // The attack: two milliseconds of unfiltered noise, which is the part the ear
  // uses to place the clap in time and hear it as a hard surface.
  const attackLength = Math.min(seconds(0.002), length);
  for (let i = 0; i < attackLength; i += 1) {
    clap[i] += (random() * 2 - 1) * (1 - i / attackLength) * 0.9;
  }

  // Distance: far claps lose their top end long before they lose their level.
  // This is what separates the front row from the back of the hall.
  biquad(clap, lowpass(voice.brightness));
  biquad(clap, highpass(320));

  for (let i = 0; i < length; i += 1) buffer[at + i] += clap[i] * gain;
}

/**
 * A whoop from the crowd: a voiced shout, not filtered noise.
 *
 * Given a pitch that rises then falls, harmonics, and a pair of formants, this
 * reads unmistakably as a person. The previous version used band-limited noise,
 * which reads as wind.
 */
function addWhoop(buffer, at, random) {
  const durationSec = 0.55 + random() * 0.75;
  const length = Math.min(seconds(durationSec), buffer.length - at);
  if (length <= 0) return;

  const base = 230 + random() * 300;
  const rise = 1.18 + random() * 0.5;
  const breath = 0.05 + random() * 0.06;
  const voice = new Float32Array(length);

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const p = i / length;
    // Pitch arcs up and back down, the shape of an actual "woo".
    const freq = base * (1 + (rise - 1) * Math.sin(Math.PI * p));
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;

    const envelope = Math.sin(Math.PI * p) ** 1.3;
    const harmonics =
      Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.28 * Math.sin(3 * phase) + 0.15 * Math.sin(4 * phase);

    voice[i] = (harmonics + (random() * 2 - 1) * breath) * envelope;
  }

  // Two formants, roughly an open "oo" moving toward "aa".
  biquad(voice, bandpass(620, 2.4));
  biquad(voice, bandpass(1180, 3.2));

  const level = 0.16 + random() * 0.16;
  for (let i = 0; i < length; i += 1) buffer[at + i] += voice[i] * level;
}

/**
 * A crowd applauding.
 *
 * The important idea here is that applause is not a random scatter of claps.
 * It is a hundred people each clapping *periodically*, at their own tempo,
 * slightly out of time with one another and drifting. A Poisson process of
 * clicks -- which is what the first version of this was -- has the right
 * average density and completely the wrong texture: it sounds like rain on a
 * window, because nothing in it repeats. Give every clapper a pulse and the
 * sound immediately reads as people.
 *
 * On top of that:
 *   - each clapper has fixed hands, so their claps are consistent;
 *   - each sits at a distance, which sets level, brightness and arrival delay;
 *   - the whole crowd breathes, swelling and relaxing over a few seconds;
 *   - the room smears it all together (see `reverb`).
 *
 * Density stays statistically even across the file so it can loop; the breathing
 * is built from harmonics of the loop length so it wraps seamlessly too.
 */
function makeApplause({ durationSec, clappers, seed, cheer }) {
  const random = mulberry32(seed);
  const fade = seconds(0.9);
  const total = seconds(durationSec) + fade;
  const dry = new Float32Array(total);
  const loopSamples = seconds(durationSec);

  /*
   * Crowd "breathing": slow swells in enthusiasm. Built only from whole
   * harmonics of the loop length, so the modulation is exactly periodic over
   * the loop and no discontinuity appears at the wrap point.
   */
  const swellPhases = [random(), random(), random()].map((v) => v * 2 * Math.PI);
  const breathe = (sample) => {
    const p = (2 * Math.PI * sample) / loopSamples;
    return (
      1 +
      0.2 * Math.sin(p + swellPhases[0]) +
      0.12 * Math.sin(2 * p + swellPhases[1]) +
      0.07 * Math.sin(3 * p + swellPhases[2])
    );
  };

  for (let c = 0; c < clappers; c += 1) {
    // Where they are in the hall. Squared, so most of the crowd is further away
    // than the few people near the microphone.
    const distance = random() ** 0.6;

    // Their hands. Cupped palms trap more air: lower, hollower, longer.
    const cupped = random() < 0.42;
    const voice = {
      resonance: cupped ? 380 + random() * 420 : 950 + random() * 1500,
      q: cupped ? 2.6 + random() * 1.8 : 1.1 + random() * 1.0,
      decay: cupped ? 0.026 + random() * 0.022 : 0.011 + random() * 0.014,
      // Air absorbs treble over distance.
      brightness: 11000 - distance * 8200,
    };

    const level = (1 - 0.72 * distance) * (0.55 + random() * 0.65);
    // Sound takes time to cross a hall; up to ~25 m of spread.
    const arrival = Math.round(((distance * 25) / 343) * SAMPLE_RATE);

    // Their tempo. People clap somewhere around two to five times a second.
    let period = SAMPLE_RATE / (2.1 + random() * 2.9);
    let t = random() * period;

    while (t < total) {
      // Nobody is a metronome: jitter each strike, and let the tempo wander.
      const jitter = gaussian(random) * period * 0.035;
      const at = Math.round(t + jitter) + arrival;

      // Enthusiasm rises and falls with the crowd, and people miss beats.
      const enthusiasm = breathe(at % loopSamples);
      if (random() < 0.93 * Math.min(1, enthusiasm)) {
        addClap(dry, at, voice, level * enthusiasm, random);
      }

      period *= 1 + gaussian(random) * 0.012;
      period = Math.max(SAMPLE_RATE / 5.5, Math.min(SAMPLE_RATE / 1.8, period));
      t += period;
    }
  }

  if (cheer) {
    for (let i = 0; i < Math.round(durationSec * 0.9); i += 1) {
      addWhoop(dry, Math.floor(random() * (total - seconds(1.4))), random);
    }

    // A couple of whistles, high and piercing, as at any prize-giving.
    for (let w = 0; w < 2; w += 1) {
      const start = Math.floor(random() * (total - seconds(1.2)));
      const length = seconds(0.45 + random() * 0.5);
      const freq0 = 2050 + random() * 750;
      for (let i = 0; i < length; i += 1) {
        const t = i / SAMPLE_RATE;
        const envelope = Math.sin((Math.PI * i) / length) ** 2;
        const f = freq0 * (1 + 0.045 * Math.sin(2 * Math.PI * 5.5 * t));
        dry[start + i] += Math.sin(2 * Math.PI * f * t) * envelope * 0.07;
      }
    }
  }

  // The hall. Without this it is a very good recording of clicking, made in a
  // vacuum; with it, it is a room full of people.
  const wet = reverb(dry, { rt60: 1.45, damping: 0.36, wet: 0.42, predelayMs: 16 });

  return normaliseRms(makeLoopable(wet, loopSamples, fade), -17);
}

/**
 * Room tone: the sound of a hall with people in it who are not making noise on
 * purpose. Almost subliminal, but its absence makes the narration feel like it
 * was recorded in a cupboard.
 */
function makeAmbience({ durationSec, seed }) {
  const random = mulberry32(seed);
  const fade = seconds(1.0);
  const total = seconds(durationSec) + fade;
  const buffer = new Float32Array(total);

  for (let i = 0; i < total; i += 1) buffer[i] = random() * 2 - 1;
  biquad(buffer, lowpass(900));
  biquad(buffer, lowpass(1400));
  biquad(buffer, highpass(90));

  // Slow swells, as a room's murmur rises and falls.
  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    buffer[i] *= 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.07 * t) * Math.sin(2 * Math.PI * 0.031 * t);
  }

  // Very occasional distant movement, so it is not a static hiss.
  const random2 = mulberry32(seed + 1);
  for (let i = 0; i < Math.round(durationSec * 2.5); i += 1) {
    // Distant, dull and quiet: someone shifting in a seat two rows back.
    const distant = { resonance: 520, q: 2.2, decay: 0.03, brightness: 2200 };
    addClap(buffer, Math.floor(random2() * (total - seconds(0.3))), distant, 0.05, random2);
  }

  return normalise(makeLoopable(buffer, seconds(durationSec), fade), 0.55);
}

/**
 * The signature chime: three ascending notes with bell-like partials. Played at
 * the head of every certificate, so it becomes the sound of a Vividha award.
 */
function makeChime() {
  const durationSec = 3.2;
  const total = seconds(durationSec);
  const buffer = new Float32Array(total);

  // A major triad, C6-E6-G6: unambiguously bright and celebratory.
  const notes = [
    { freq: 1046.5, at: 0.0 },
    { freq: 1318.51, at: 0.26 },
    { freq: 1567.98, at: 0.52 },
  ];
  // Slightly inharmonic partials give it the metallic quality of a struck bar
  // rather than the hollow purity of a sine.
  const partials = [
    { ratio: 1.0, gain: 1.0, decay: 1.5 },
    { ratio: 2.02, gain: 0.42, decay: 0.9 },
    { ratio: 3.01, gain: 0.18, decay: 0.55 },
    { ratio: 4.97, gain: 0.09, decay: 0.32 },
    { ratio: 6.83, gain: 0.05, decay: 0.2 },
  ];

  for (const note of notes) {
    const start = seconds(note.at);
    for (let i = 0; start + i < total; i += 1) {
      const t = i / SAMPLE_RATE;
      let value = 0;
      for (const partial of partials) {
        value += Math.sin(2 * Math.PI * note.freq * partial.ratio * t)
          * partial.gain
          * Math.exp(-t / partial.decay);
      }
      // A 4 ms attack ramp: an instant start would click.
      const attack = Math.min(1, t / 0.004);
      buffer[start + i] += value * attack * 0.3;
    }
  }

  // Fade the last 250 ms to true silence so the file ends cleanly.
  const fade = seconds(0.25);
  for (let i = 0; i < fade; i += 1) {
    buffer[total - fade + i] *= 1 - i / fade;
  }

  return normalise(buffer, 0.85);
}

/**
 * The riser before the prize is named: noise sweeping upward through a
 * resonant filter, with a rising tone underneath. Purely a tension device --
 * it tells the listener that the important part is about to happen.
 */
function makeRiser() {
  const durationSec = 1.8;
  const total = seconds(durationSec);
  const random = mulberry32(99);
  const buffer = new Float32Array(total);

  for (let i = 0; i < total; i += 1) {
    const progress = i / total;
    const t = i / SAMPLE_RATE;

    // Noise component, swept by a one-pole filter whose cutoff climbs.
    const noise = random() * 2 - 1;

    // Rising tone, an octave and a half over the length of the sweep.
    const freq = 220 * 2 ** (progress * 1.6);
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.35;

    // Crescendo, steep at the end.
    const envelope = progress ** 1.8;
    buffer[i] = (noise * 0.5 + tone) * envelope;
  }

  // Sweep a bandpass across the whole thing in blocks, which is cheaper than a
  // per-sample time-varying filter and indistinguishable here.
  const blocks = 60;
  const blockSize = Math.floor(total / blocks);
  for (let b = 0; b < blocks; b += 1) {
    const slice = buffer.subarray(b * blockSize, (b + 1) * blockSize);
    biquad(slice, bandpass(400 + (b / blocks) ** 1.5 * 4200, 1.4));
  }

  // Short fade out so it tucks under the prize word instead of stopping dead.
  const fade = seconds(0.12);
  for (let i = 0; i < fade; i += 1) buffer[total - fade + i] *= 1 - i / fade;

  return normalise(buffer, 0.8);
}

// ------------------------------------------------------------------ encoding

/**
 * Written as WAV, not MP3, deliberately.
 *
 * MP3 carries encoder delay and end padding, so a decoded file begins with
 * silence and ends with a fragment. The applause and room tone are looped, and
 * that padding would put a click at every wrap -- exactly the artefact the
 * crossfade above exists to prevent. WAV decodes to the same samples that went
 * in, so the loop points land where they were designed to.
 *
 * The cost is size, and it is paid only by the admin tab that mixes
 * certificates. Anyone opening a certificate link downloads a finished MP3 and
 * never fetches these at all.
 */
function encodeWav(samples) {
  const header = Buffer.alloc(44);
  const dataBytes = samples.length * 2;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);

  const data = Buffer.alloc(dataBytes);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), i * 2);
  }
  return Buffer.concat([header, data]);
}

function write(name, samples) {
  const wav = encodeWav(samples);
  writeFileSync(join(OUT_DIR, name), wav);
  const durationSec = samples.length / SAMPLE_RATE;
  console.log(
    `  ${name.padEnd(14)} ${durationSec.toFixed(2)}s  ${(wav.length / 1024).toFixed(0)} KB`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
console.log('Generating backing tracks into public/audio:');
write('chime.wav', makeChime());
write('riser.wav', makeRiser());
// Loop lengths kept modest: long enough not to sound repetitive under a
// 15-second applause tail, short enough to keep the admin page light.
write('ambience.wav', makeAmbience({ durationSec: 9, seed: 7 }));
write('applause.wav', makeApplause({ durationSec: 10, clappers: 95, seed: 42, cheer: true }));
console.log('Done.');
