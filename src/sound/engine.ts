// Main-thread sound engine.
//
// * The audio itself is synthesised in an AudioWorklet (worklet.ts).
// * A silent copy of the same sound machine runs on the main thread,
//   advanced by the game loop through `advance(seconds)`. It answers
//   `isBusy("levelDone" | "dirge")`, so waiting for jingles is deterministic
//   and identical with or without audio (tests, muted tab, no unlock yet).

import type { SoundEvent } from "../contracts";
import { SoundMachine, type SoundCommand, type Waitable } from "./machine";
import type { OutputMode } from "./speaker";
import { samplesPerTick } from "./synth";
import type { WorkletMessage } from "./worklet";

export interface SoundEngineOptions {
  /** "raw" (default): pure PIT square wave; "sdl-filter": the SDL backend's filter. */
  output?: OutputMode;
  /** Output gain 0..1 (default 0.6). */
  volume?: number;
  /** AudioContext sample rate to request (default 44100, the reference's). */
  sampleRate?: number;
}

export interface SoundEngine {
  /** Feed one event from the core. Takes effect at the next sound tick. */
  handle(ev: SoundEvent): void;
  /** Create/resume the AudioContext. Call from a user gesture. Resolves
   *  immediately (without audio) where Web Audio is unavailable. */
  unlock(): Promise<void>;
  setSoundEnabled(on: boolean): void;
  setMusicEnabled(on: boolean): void;
  readonly soundEnabled: boolean;
  readonly musicEnabled: boolean;
  /** Advance sound time by `seconds` (call once per game frame with the
   *  frame's duration, e.g. 0.08 s). Drives `isBusy`. */
  advance(seconds: number): void;
  /** True while the game should keep waiting: "levelDone" = the level-done
   *  jingle is still playing; "dirge" = the death dirge melody is not over. */
  isBusy(what: Waitable): boolean;
  setVolume(volume: number): void;
  setOutput(mode: OutputMode): void;
  /** True once the AudioContext is running. */
  readonly audible: boolean;
  dispose(): void;
}

/** Nominal rate of the main-thread mirror clock. */
const MIRROR_RATE = 44100;

export function createSoundEngine(options: SoundEngineOptions = {}): SoundEngine {
  return new Engine(options);
}

class Engine implements SoundEngine {
  private readonly mirror = new SoundMachine();
  private readonly perTick = samplesPerTick(MIRROR_RATE);
  private elapsed = 0; // mirror samples
  private nextTickAt = this.perTick - 1;
  private output: OutputMode;
  private volume: number;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private unlocking: Promise<void> | null = null;

  constructor(private readonly options: SoundEngineOptions) {
    this.output = options.output ?? "raw";
    this.volume = options.volume ?? 0.6;
  }

  handle(ev: SoundEvent): void {
    this.send(ev);
  }

  setSoundEnabled(on: boolean): void {
    this.send({ kind: "enable", what: "sound", on });
  }

  setMusicEnabled(on: boolean): void {
    this.send({ kind: "enable", what: "music", on });
  }

  get soundEnabled(): boolean {
    return this.mirror.soundEnabled;
  }

  get musicEnabled(): boolean {
    return this.mirror.musicEnabled;
  }

  advance(seconds: number): void {
    if (!(seconds > 0)) return;
    this.elapsed += seconds * MIRROR_RATE;
    while (this.elapsed >= this.nextTickAt) {
      this.mirror.tick();
      this.nextTickAt += this.perTick;
    }
  }

  isBusy(what: Waitable): boolean {
    return this.mirror.isBusy(what);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(Math.max(volume, 0), 1);
    this.postToWorklet({ type: "gain", value: this.volume });
  }

  setOutput(mode: OutputMode): void {
    this.output = mode;
    this.postToWorklet({ type: "output", mode });
  }

  get audible(): boolean {
    return this.ctx?.state === "running";
  }

  unlock(): Promise<void> {
    if (typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") {
      return Promise.resolve();
    }
    if (this.ctx) return this.ctx.resume();
    this.unlocking ??= this.startAudio();
    return this.unlocking;
  }

  dispose(): void {
    this.node?.disconnect();
    void this.ctx?.close();
    this.node = null;
    this.ctx = null;
  }

  private async startAudio(): Promise<void> {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: this.options.sampleRate ?? 44100, latencyHint: "interactive" });
    } catch {
      ctx = new AudioContext({ latencyHint: "interactive" });
    }
    const { default: url } = await import("./worklet.ts?worker&url");
    await ctx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(ctx, "digger-pc-speaker", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { output: this.output, gain: this.volume },
    });
    node.connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
    // bring the fresh synthesiser up to the game's current state
    this.postToWorklet({ type: "cmd", cmd: { kind: "enable", what: "sound", on: this.mirror.soundEnabled } });
    this.postToWorklet({ type: "cmd", cmd: { kind: "enable", what: "music", on: this.mirror.musicEnabled } });
    const tune = this.mirror.tune;
    if (tune) this.postToWorklet({ type: "cmd", cmd: { kind: "music", tune } });
    await ctx.resume();
  }

  private send(cmd: SoundCommand): void {
    this.mirror.post(cmd);
    this.postToWorklet({ type: "cmd", cmd });
  }

  private postToWorklet(m: WorkletMessage): void {
    this.node?.port.postMessage(m);
  }
}
