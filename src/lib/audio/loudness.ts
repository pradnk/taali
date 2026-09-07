/**
 * Integrated loudness measurement, ITU-R BS.1770-4.
 *
 * Why not just normalise by peak: peak tells you nothing about how loud
 * something *sounds*. A certificate whose applause peaks at 0 dBFS and whose
 * narration sits 20 dB below it would pass a peak check while being unusable on
 * a phone speaker. Loudness normalisation is what makes every certificate in a
 * batch play back at the same comfortable level.
 *
 * The K-weighting coefficients below are the standard ones specified for
 * 48 kHz, which is why the whole pipeline renders at that rate.
 */

const BLOCK_SECONDS = 0.4;
/** 75% overlap between analysis blocks, as the standard requires. */
const HOP_SECONDS = 0.1;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** Stage 1: high-shelf approximating the acoustic effect of a listener's head. */
const HEAD_SHELF: Biquad = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};

/** Stage 2: RLB high-pass, discarding low frequencies we do not perceive as loud. */
const RLB_HIGHPASS: Biquad = {
  b0: 1.0,
  b1: -2.0,
  b2: 1.0,
  a1: -1.99004745483398,
  a2: 0.99007225036621,
};

function filter(input: Float32Array, coefficients: Biquad): Float32Array {
  const { b0, b1, b2, a1, a2 } = coefficients;
  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

/**
 * Integrated loudness in LUFS, or -Infinity for silence.
 * Mono only, which is all this pipeline produces.
 */
export function integratedLoudness(samples: Float32Array, sampleRate: number): number {
  const weighted = filter(filter(samples, HEAD_SHELF), RLB_HIGHPASS);

  const blockSize = Math.round(BLOCK_SECONDS * sampleRate);
  const hopSize = Math.round(HOP_SECONDS * sampleRate);
  if (weighted.length < blockSize) return -Infinity;

  // Mean square of each overlapping block.
  const blockPower: number[] = [];
  for (let start = 0; start + blockSize <= weighted.length; start += hopSize) {
    let sum = 0;
    for (let i = start; i < start + blockSize; i += 1) {
      sum += weighted[i] * weighted[i];
    }
    blockPower.push(sum / blockSize);
  }

  const loudnessOf = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  // Absolute gate: ignore near-silence so leading and trailing quiet does not
  // drag the average down.
  const aboveAbsolute = blockPower.filter((power) => loudnessOf(power) > ABSOLUTE_GATE_LUFS);
  if (aboveAbsolute.length === 0) return -Infinity;

  // Relative gate: ignore anything more than 10 LU below the ungated average,
  // so the quiet passages between beats do not count against the loud ones.
  const relativeThreshold = loudnessOf(mean(aboveAbsolute)) + RELATIVE_GATE_LU;
  const gated = aboveAbsolute.filter((power) => loudnessOf(power) > relativeThreshold);
  if (gated.length === 0) return -Infinity;

  return loudnessOf(mean(gated));
}

export function peakAmplitude(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }
  return peak;
}
