import type { ScriptSegment } from '@/lib/db/schema';

/**
 * The certificate's score: where every clip sits on the timeline and how loud
 * it is.
 *
 * Kept as pure data and pure functions with no Web Audio dependency, so the
 * timing can be reasoned about, unit-tested and tweaked without a browser.
 * `mix.ts` turns the plan this file produces into an actual audio graph.
 */

export const SAMPLE_RATE = 48_000;

export type BedId = 'chime' | 'ambience' | 'applause' | 'riser';

/**
 * Backing tracks. `baseDb` is the level each is mixed at relative to speech,
 * which sits at 0 dB. Applause is deliberately close to speech level -- it is
 * the point of the whole thing -- and is kept out of the way by ducking rather
 * than by being quiet.
 */
export const BEDS: Record<BedId, { src: string; baseDb: number; ducks: boolean }> = {
  chime: { src: '/audio/chime.wav', baseDb: -7, ducks: false },
  ambience: { src: '/audio/ambience.wav', baseDb: -26, ducks: true },
  applause: { src: '/audio/applause.wav', baseDb: -2, ducks: true },
  riser: { src: '/audio/riser.wav', baseDb: -9, ducks: true },
};

/** Every timing in the score, in seconds. Tune the feel of the piece here. */
export const TIMING = {
  /** Silence before the first word, letting the chime ring out. */
  leadIn: 2.4,
  ambienceIn: 0.5,
  ambienceFade: 1.5,

  gapAfterIntro: 0.6,
  /** Silence immediately before the name. Deliberate: it sets the name apart. */
  gapBeforeName: 0.45,
  /** And after it, before anything else is allowed to speak. */
  gapAfterName: 0.55,
  /**
   * Added to both of the above when the voice model could not slow the name
   * down (Eleven v3 ignores the speed setting). Silence is the other lever for
   * making the name land, so languages that only v3 speaks lean on it harder.
   */
  unslowedNameExtraSilence: 0.2,
  gapAfterCitation: 0.8,

  riserLength: 1.6,
  /** The prize word lands just before the riser finishes, so they interlock. */
  prizeOverlapsRiser: 0.2,

  /** Beat between the prize word and the crowd reacting. */
  gapBeforeApplause: 0.15,
  /** How long the applause has the room to itself before the closing line. */
  applauseSolo: 4.2,
  /**
   * The crowd surges above its steady level for a moment when the prize is
   * announced, then settles. The applause recording is deliberately flat so it
   * can loop, so the surge is put back here.
   */
  applauseOnset: 0.12,
  applauseSurgeDb: 2.5,
  applauseSettle: 1.7,

  /** Applause is allowed back up to full for this long after the closing line. */
  tailSwell: 2.0,
  tailFade: 3.0,

  /** Ducking envelope for the beds underneath speech. */
  duckDb: -17,
  duckAttack: 0.25,
  duckRelease: 0.6,
} as const;

export function dbToGain(db: number): number {
  return db <= -80 ? 0 : 10 ** (db / 20);
}

export type SpeechCue = {
  id: ScriptSegment['id'];
  at: number;
  duration: number;
};

export type BedCue = {
  bed: BedId;
  at: number;
  duration: number;
  loop: boolean;
  /** Absolute linear gain automation, times relative to the cue's own start. */
  envelope: Array<{ t: number; gain: number }>;
};

export type Timeline = {
  speech: SpeechCue[];
  beds: BedCue[];
  /** Gain automation for the shared bus that ducking beds pass through. */
  duckAutomation: Array<{ t: number; gain: number }>;
  duration: number;
};

/**
 * Lays the score out for one certificate.
 *
 * `durations` maps each script segment to the measured length of its
 * synthesised clip. Segments the script omitted (a student with no recorded
 * project, say) are simply absent, and the timeline closes up around them.
 */
export function planTimeline(
  segments: ScriptSegment[],
  durations: Partial<Record<ScriptSegment['id'], number>>,
): Timeline {
  const present = segments.filter((segment) => durations[segment.id] !== undefined);
  const durationOf = (id: ScriptSegment['id']) => durations[id] ?? 0;
  const has = (id: ScriptSegment['id']) => present.some((segment) => segment.id === id);

  const speech: SpeechCue[] = [];
  const beds: BedCue[] = [];

  const say = (id: ScriptSegment['id'], at: number) => {
    const duration = durationOf(id);
    speech.push({ id, at, duration });
    return at + duration;
  };

  let t: number = TIMING.leadIn;

  beds.push({
    bed: 'chime',
    at: 0,
    duration: 4,
    loop: false,
    envelope: [{ t: 0, gain: dbToGain(BEDS.chime.baseDb) }],
  });

  // When the model could not slow the name down, buy the same emphasis with
  // more silence on either side of it.
  const nameSlowed = (present.find((segment) => segment.id === 'name')?.speed ?? 1) < 1;
  const extraSilence = nameSlowed ? 0 : TIMING.unslowedNameExtraSilence;

  if (has('intro')) t = say('intro', t) + TIMING.gapAfterIntro;
  if (has('awardLine')) t = say('awardLine', t) + TIMING.gapBeforeName + extraSilence;

  if (has('name')) t = say('name', t) + TIMING.gapAfterName + extraSilence;
  if (has('citation')) t = say('citation', t) + TIMING.gapAfterCitation;

  // Prize reveal: riser swells, the prize word lands just inside its tail.
  let applauseAt: number;
  if (has('prize')) {
    const riserAt = t;
    beds.push({
      bed: 'riser',
      at: riserAt,
      duration: TIMING.riserLength,
      loop: false,
      envelope: [{ t: 0, gain: dbToGain(BEDS.riser.baseDb) }],
    });
    const prizeAt = riserAt + TIMING.riserLength - TIMING.prizeOverlapsRiser;
    t = say('prize', prizeAt);
    applauseAt = t + TIMING.gapBeforeApplause;
  } else {
    applauseAt = t;
  }

  const closingAt = applauseAt + TIMING.applauseSolo;
  const closingEnd = has('closing') ? say('closing', closingAt) : closingAt;

  const duration = closingEnd + TIMING.tailSwell + TIMING.tailFade;

  // Applause runs from the reveal to the end of the piece. It is not faded down
  // for the closing line -- the duck bus does that -- so it naturally swells
  // back up the moment the speaking stops.
  const applauseGain = dbToGain(BEDS.applause.baseDb);
  const applauseLength = duration - applauseAt;
  beds.push({
    bed: 'applause',
    at: applauseAt,
    duration: applauseLength,
    loop: true,
    envelope: [
      { t: 0, gain: 0 },
      { t: TIMING.applauseOnset, gain: dbToGain(BEDS.applause.baseDb + TIMING.applauseSurgeDb) },
      { t: TIMING.applauseSettle, gain: applauseGain },
      {
        t: Math.max(TIMING.applauseSettle, applauseLength - TIMING.tailFade),
        gain: applauseGain,
      },
      { t: applauseLength, gain: 0 },
    ],
  });

  const ambienceGain = dbToGain(BEDS.ambience.baseDb);
  const ambienceLength = duration - TIMING.ambienceIn;
  beds.push({
    bed: 'ambience',
    at: TIMING.ambienceIn,
    duration: ambienceLength,
    loop: true,
    envelope: [
      { t: 0, gain: 0 },
      { t: TIMING.ambienceFade, gain: ambienceGain },
      { t: Math.max(TIMING.ambienceFade, ambienceLength - TIMING.tailFade), gain: ambienceGain },
      { t: ambienceLength, gain: 0 },
    ],
  });

  return { speech, beds, duckAutomation: planDucking(speech), duration };
}

/**
 * Builds the sidechain envelope that pulls the beds down underneath speech.
 *
 * Adjacent clips are merged into one region first: without that, the two-tenths
 * of a second between "awarded to" and the student's name would let the crowd
 * surge back up and then immediately drop again, which sounds like a fault.
 */
function planDucking(speech: SpeechCue[]): Array<{ t: number; gain: number }> {
  if (speech.length === 0) return [{ t: 0, gain: 1 }];

  const ducked = dbToGain(TIMING.duckDb);
  const bridge = TIMING.duckAttack + TIMING.duckRelease;

  const sorted = [...speech].sort((a, b) => a.at - b.at);
  const regions: Array<{ start: number; end: number }> = [];
  for (const cue of sorted) {
    const last = regions.at(-1);
    if (last && cue.at - last.end < bridge) {
      last.end = Math.max(last.end, cue.at + cue.duration);
    } else {
      regions.push({ start: cue.at, end: cue.at + cue.duration });
    }
  }

  const points: Array<{ t: number; gain: number }> = [{ t: 0, gain: 1 }];
  for (const region of regions) {
    const duckStart = Math.max(0, region.start - TIMING.duckAttack);
    points.push({ t: duckStart, gain: 1 });
    points.push({ t: region.start, gain: ducked });
    points.push({ t: region.end, gain: ducked });
    points.push({ t: region.end + TIMING.duckRelease, gain: 1 });
  }
  return points;
}
