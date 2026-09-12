// Public API of the sound module. See README.md.
export { createSoundEngine, type SoundEngine, type SoundEngineOptions } from "./engine";
export { SOUND_NAMES, isSoundName, type SoundName } from "./names";
export { renderOffline, PcSpeakerSynth, type ScriptEntry, type OfflineOptions, type SynthOptions } from "./synth";
export { SoundMachine, type SoundCommand, type EnableCommand, type Waitable } from "./machine";
export type { OutputMode } from "./speaker";
export type { TuneName } from "./data";
