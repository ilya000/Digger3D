// Sample-accurate synthesis: the sound machine ticks every
// round(sampleRate / 72.8) samples and the speaker model produces every
// sample in between. Used by the AudioWorklet and by `renderOffline`.

import { TICK_HZ } from "./data";
import { SoundMachine, type SoundCommand, type Waitable } from "./machine";
import { OutputStage, PcSpeaker, type OutputMode } from "./speaker";

export interface SynthOptions {
  /** "raw" (default) = pure square wave; "sdl-filter" = SDL backend filter. */
  output?: OutputMode;
  /** Output gain applied after the output stage (default 1). */
  gain?: number;
}

/** Samples per sound interrupt at a given sample rate. */
export const samplesPerTick = (sampleRate: number) => Math.round(sampleRate / TICK_HZ);

export class PcSpeakerSynth {
  readonly speaker: PcSpeaker;
  readonly machine: SoundMachine;
  gain: number;
  /** Called right before each tick with the tick's index. */
  beforeTick: ((tick: number) => void) | null = null;
  private stage: OutputStage;
  private readonly perTick: number;
  private untilTick: number;

  constructor(readonly sampleRate: number, options: SynthOptions = {}) {
    this.speaker = new PcSpeaker(sampleRate);
    this.machine = new SoundMachine(this.speaker);
    this.stage = new OutputStage(options.output ?? "raw", sampleRate);
    this.gain = options.gain ?? 1;
    this.perTick = samplesPerTick(sampleRate);
    // the interrupt fires at the end of each tick period
    this.untilTick = this.perTick - 1;
  }

  get output(): OutputMode {
    return this.stage.mode;
  }

  setOutput(mode: OutputMode): void {
    if (mode !== this.stage.mode) this.stage = new OutputStage(mode, this.sampleRate);
  }

  post(cmd: SoundCommand): void {
    this.machine.post(cmd);
  }

  /** Fills out[offset .. offset+count). */
  render(out: Float32Array, offset = 0, count = out.length - offset): void {
    const end = offset + count;
    for (let i = offset; i < end; i++) {
      if (this.untilTick === 0) {
        this.beforeTick?.(this.machine.ticks);
        this.machine.tick();
        this.untilTick = this.perTick;
      }
      this.untilTick--;
      out[i] = this.stage.process(this.speaker.next()) * this.gain;
    }
  }
}

/** One scripted command: posted right before tick `tick` runs. */
export interface ScriptEntry {
  tick: number;
  event: SoundCommand;
}

export interface OfflineOptions extends SynthOptions {
  /** Receives completion of the level-done jingle / dirge melody. */
  onFinished?: (what: Waitable, tick: number) => void;
}

/**
 * Renders a script offline with exactly the code the AudioWorklet runs.
 * Samples are in [-1, 1); with output "raw" and gain 1, `sample * 32768` is
 * the reference's int16 value.
 */
export function renderOffline(
  script: readonly ScriptEntry[],
  sampleRate: number,
  seconds: number,
  options: OfflineOptions = {},
): Float32Array {
  const synth = new PcSpeakerSynth(sampleRate, options);
  const sorted = script.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || a.i - b.i);
  let next = 0;
  synth.beforeTick = (tick) => {
    while (next < sorted.length && sorted[next]!.e.tick <= tick) synth.post(sorted[next++]!.e.event);
  };
  if (options.onFinished) synth.machine.onFinished = options.onFinished;
  const out = new Float32Array(Math.round(seconds * sampleRate));
  synth.render(out);
  return out;
}
