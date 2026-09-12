// The names the core uses in SoundEvent.sound.
//
// The vocabulary of sound effects is owned by the sound module, which documents
// every effect and is verified against the original (src/sound/names.ts); the
// core only re-exports it, so that there is one list and the two modules cannot
// drift apart. Nothing of the sound engine itself is imported here.
export { SOUND_NAMES, isSoundName, type SoundName } from "../sound/names";
