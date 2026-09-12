// Every sound effect of the original Digger, as used in
// `SoundEvent` ({kind:"start"|"stop", sound: SoundName, arg?}).
//
// The list mirrors the sound calls the original game makes (see the
// Remastered reference vendor/digger/sound.h). Effects marked "one-shot"
// end by themselves; `stop` on them cuts them short (the original never does
// that). Effects marked "loop" keep sounding until `stop`.
//
// Music is not in this list: it uses {kind:"music", tune:"main"|"bonus"|"dirge"|"off"}.

export type SoundName =
  /** One-shot. An emerald is eaten: short click (1 tick, divisor 1000).
   *  The original always sends this together with `emeraldStreak`. No arg. */
  | "emerald"
  /** One-shot. The note of the emerald streak: consecutive emeralds eaten
   *  quickly climb the C major scale. arg = position in the streak, 0..7
   *  (the core's per-digger emerald counter; it wraps to 0 after 8). */
  | "emeraldStreak"
  /** One-shot. The digger eats a monster in bonus mode (three chirps). No arg. */
  | "eatMonster"
  /** Loop. A fireball is flying (rising whoosh; fades out on its own after
   *  ~6 s). arg = fireball index 0|1 (= digger index; 1 only in the
   *  simultaneous two-player mode). `stop` when the fireball is removed. */
  | "fire"
  /** One-shot. A fireball explodes; also stops that fireball's `fire`.
   *  arg = fireball index 0|1. */
  | "explode"
  /** One-shot. The digger collects gold. No arg. */
  | "gold"
  /** Loop. A bag is wobbling before it falls. `stop` when no bag wobbles. No arg. */
  | "bagWobble"
  /** Loop. A bag is falling. `stop` when no bag falls any more. No arg. */
  | "bagFall"
  /** One-shot. A bag breaks open into gold. No arg. */
  | "bagBreak"
  /** One-shot. The digger dies (falling then rising tone). Also stops the
   *  music one tick later, as the original does. No arg. */
  | "diggerDeath"
  /** One-shot. Extra life. No arg. */
  | "oneUp"
  /** Loop. Bonus-mode alarm (two alternating tones): the core sends `start`
   *  while the screen flashes at the start/end of bonus mode, `stop` after. No arg. */
  | "bonus"
  /** Jingle. Level completed: stops everything and plays the level-done
   *  jingle (~3.2 s). The game waits for it: poll `engine.isBusy("levelDone")`.
   *  `stop` aborts it. No arg. */
  | "levelDone"
  /** Loop. Game paused: all sound is silenced and frozen until `stop`. No arg. */
  | "pause"
  /** Only with `stop`: stop every effect, the jingle and the music
   *  (the original's `soundstop()`). */
  | "all";

export const SOUND_NAMES: readonly SoundName[] = [
  "emerald",
  "emeraldStreak",
  "eatMonster",
  "fire",
  "explode",
  "gold",
  "bagWobble",
  "bagFall",
  "bagBreak",
  "diggerDeath",
  "oneUp",
  "bonus",
  "levelDone",
  "pause",
  "all",
];

export function isSoundName(s: string): s is SoundName {
  return (SOUND_NAMES as readonly string[]).includes(s);
}
