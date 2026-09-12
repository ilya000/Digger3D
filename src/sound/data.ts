// Numeric facts of the original Digger (Windmill Software, 1983) sound: PIT
// constants, the note tables of the three tunes, the level-done jingle, the
// emerald scale and the per-tune envelope/tempo settings.
//
// Source of the values: the Digger Remastered reverse engineering of the
// original program, vendor/digger/sound_backend.c (tables `bonusjingle`,
// `backgjingle`, `dirge`, `newlevjingle`, `emfreqs`, `music_select_tune`),
// vendor/digger/newsnd.c (PIT_FREQ) and vendor/digger/sound_backend.c
// `initsound` (timer 0 at 0x4000 => 72.8 Hz sound interrupt).
// All pitches are 8253/8254 PIT divisors: frequency = PIT_HZ / divisor.

/** Input clock of the 8253/8254 PIT. The reference uses 0x1234dd. */
export const PIT_HZ = 0x1234dd;

/** Rate of the sound "interrupt" that sequences all effects and music:
 *  timer 0 reprogrammed to divisor 0x4000 => PIT_HZ / 0x4000 = 72.8 Hz.
 *  The reference rounds `sampleRate / 72.8` to whole samples per tick. */
export const TICK_HZ = 72.8;

/** Divisor meaning "no note" (timer 0 left at its idle value). */
export const REST = 0x7d00;
/** Divisor meaning "channel 2 idle": any value <= this is not a tone. */
export const T2_IDLE = 40;
/** Divisors at or above this are outside what the emulated PIT plays. */
export const PIT_MAX_DIVISOR = 0x4000;
/** timer 0 is never run faster than this divisor while playing music. */
export const MUSIC_MIN_DIVISOR = 1000;
/** The music pulse width ("volume") runs 1..50. */
export const PULSE_MAX = 50;

/** A tune: [divisor, length in tempo units] per note; REST = silence. */
export type Tune = readonly (readonly [number, number])[];

/** Bonus-mode tune (William Tell overture). */
export const BONUS_TUNE: Tune = pairs([
  0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
   0xd59,4, 0xbe4,4, 0xa98,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
  0x11d1,4, 0xd59,2, 0xa98,2, 0xbe4,4, 0xe24,4,0x11d1,4,0x11d1,2,0x11d1,2,
  0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2, 0xd59,4, 0xbe4,4,
   0xa98,4, 0xd59,2, 0xa98,2, 0x8e8,10,0xa00,2, 0xa98,2, 0xbe4,2, 0xd59,4,
   0xa98,4, 0xd59,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,
  0x11d1,2,0x11d1,2, 0xd59,4, 0xbe4,4, 0xa98,4,0x11d1,2,0x11d1,2,0x11d1,4,
  0x11d1,2,0x11d1,2,0x11d1,4, 0xd59,2, 0xa98,2, 0xbe4,4, 0xe24,4,0x11d1,4,
  0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
   0xd59,4, 0xbe4,4, 0xa98,4, 0xd59,2, 0xa98,2, 0x8e8,10,0xa00,2, 0xa98,2,
   0xbe4,2, 0xd59,4, 0xa98,4, 0xd59,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2,
   0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4,
   0xa98,4, 0x7f0,4, 0xa98,4, 0xbe4,4, 0xd59,4, 0xe24,4, 0xfdf,4, 0xa98,2,
   0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4,
   0x7f0,4, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4, 0x8e8,4, 0x970,4, 0x8e8,4,
   0x970,4, 0x8e8,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4,
   0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4,
   0xa98,4, 0xbe4,4, 0xd59,4, 0xe24,4, 0xfdf,4, 0xa98,2, 0xa98,2, 0xa98,4,
   0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4,
   0x7f0,4, 0xa98,4, 0x7f0,4, 0x8e8,4, 0x970,4, 0x8e8,4, 0x970,4, 0x8e8,4,
]);

/** Main (background) tune ("Popcorn"). */
export const MAIN_TUNE: Tune = pairs([
   0xfdf,2,0x11d1,2, 0xfdf,2,0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2,
  0x11d1,2, 0xfdf,2,0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2, 0xe24,2,
   0xd59,2, 0xe24,2, 0xd59,2, 0xfdf,2, 0xe24,2, 0xfdf,2, 0xe24,2,0x11d1,2,
   0xfdf,2,0x11d1,2, 0xfdf,2,0x1400,2, 0xfdf,4, 0xfdf,2,0x11d1,2, 0xfdf,2,
  0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2,0x11d1,2, 0xfdf,2,0x1530,2,
  0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2, 0xe24,2, 0xd59,2, 0xe24,2, 0xd59,2,
   0xfdf,2, 0xe24,2, 0xfdf,2, 0xe24,2,0x11d1,2, 0xfdf,2,0x11d1,2, 0xfdf,2,
   0xe24,2, 0xd59,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,
  0x1530,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4,
   0xa98,2, 0x970,2, 0x8e8,2, 0x970,2, 0x8e8,2, 0xa98,2, 0x970,2, 0xa98,2,
   0x970,2, 0xbe4,2, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2, 0xa98,4, 0xa98,2,
   0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0xbe4,2,
   0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0x970,2, 0x8e8,2,
   0x970,2, 0x8e8,2, 0xa98,2, 0x970,2, 0xa98,2, 0x970,2, 0xbe4,2, 0xa98,2,
   0xbe4,2, 0xa98,2, 0xd59,2, 0xa98,4, 0x7f0,2, 0x8e8,2, 0xa98,2, 0xd59,2,
  0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2,
   0xd59,2,0x1530,4, 0xa98,2, 0x970,2, 0x8e8,2, 0x970,2, 0x8e8,2, 0xa98,2,
   0x970,2, 0xa98,2, 0x970,2, 0xbe4,2, 0xa98,2, 0xbe4,2, 0xd59,2, 0xbe4,2,
   0xa98,4,
]);

/** Death dirge (Chopin's funeral march): lead-in rest, melody, long rests. */
export const DIRGE_TUNE: Tune = pairs([
  0x7d00, 2,0x11d1, 6,0x11d1, 4,0x11d1, 2,0x11d1, 6, 0xefb, 4, 0xfdf, 2,
   0xfdf, 4,0x11d1, 2,0x11d1, 4,0x12e0, 2,0x11d1,12,0x7d00,16,0x7d00,16,
  0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,
  0x7d00,16,0x7d00,16,0x7d00,16,
]);

/** How a tune is performed. `tempo` = interrupt ticks per length unit;
 *  `gate`: "legato" releases one unit before the note ends, "staccato"
 *  releases after 2 units regardless of length. Envelope values are pulse
 *  widths (1..50) changed once per tick. */
export interface TuneStyle {
  readonly notes: Tune;
  readonly tempo: number;
  readonly gate: "legato" | "staccato";
  readonly peak: number;
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  /** The dirge reports "finished" when its melody reaches the long rests. */
  readonly reportsEnd: boolean;
  /** The dirge plays even with music switched off. */
  readonly forced: boolean;
}

export const TUNES = {
  bonus: { notes: BONUS_TUNE, tempo: 3, gate: "legato", peak: 50, attack: 20, decay: 10, sustain: 20, release: 4, reportsEnd: false, forced: false },
  main: { notes: MAIN_TUNE, tempo: 6, gate: "staccato", peak: 50, attack: 50, decay: 15, sustain: 8, release: 1, reportsEnd: false, forced: false },
  dirge: { notes: DIRGE_TUNE, tempo: 10, gate: "legato", peak: 50, attack: 50, decay: 5, sustain: 25, release: 1, reportsEnd: true, forced: true },
} as const satisfies Record<string, TuneStyle>;

export type TuneName = keyof typeof TUNES;

/** Level-done jingle: 11 notes, each held for 21 ticks. Played on timer 0
 *  with timer 2 tuned `LEVEL_DONE_DETUNE` divisor steps away, so the two
 *  beat against each other. */
export const LEVEL_DONE_NOTES = [0x8e8, 0x712, 0x5f2, 0x7f0, 0x6ac, 0x54c, 0x712, 0x5f2, 0x4b8, 0x474, 0x474] as const;
export const LEVEL_DONE_NOTE_TICKS = 21;
export const LEVEL_DONE_DETUNE = 35;

/** Emerald streak: C major scale C5..C6, one step per consecutive emerald. */
export const EMERALD_SCALE = [0x8e8, 0x7f0, 0x712, 0x6ac, 0x5f2, 0x54c, 0x4b8, 0x474] as const;

/** Number of fireballs (one per digger; two only in simultaneous 2-player). */
export const FIREBALLS = 2;

function pairs(flat: readonly number[]): Tune {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!]);
  return out;
}
