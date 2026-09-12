// AudioWorklet processor: runs the PC-speaker synthesis on the audio thread,
// sample-accurately. Loaded by engine.ts via `?worker&url`.

import type { SoundCommand } from "./machine";
import type { OutputMode } from "./speaker";
import { PcSpeakerSynth, type SynthOptions } from "./synth";

// AudioWorkletGlobalScope (not part of TypeScript's DOM lib)
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

export const PROCESSOR_NAME = "digger-pc-speaker";

/** Messages from the engine to the processor. */
export type WorkletMessage =
  | { type: "cmd"; cmd: SoundCommand }
  | { type: "output"; mode: OutputMode }
  | { type: "gain"; value: number };

class PcSpeakerProcessor extends AudioWorkletProcessor {
  private readonly synth: PcSpeakerSynth;

  constructor(options: { processorOptions?: SynthOptions }) {
    super(options);
    this.synth = new PcSpeakerSynth(sampleRate, options.processorOptions ?? {});
    this.port.onmessage = (e: MessageEvent<WorkletMessage>) => {
      const m = e.data;
      if (m.type === "cmd") this.synth.post(m.cmd);
      else if (m.type === "output") this.synth.setOutput(m.mode);
      else if (m.type === "gain") this.synth.gain = m.value;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (out && out.length > 0) {
      this.synth.render(out[0]!);
      for (let c = 1; c < out.length; c++) out[c]!.set(out[0]!);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PcSpeakerProcessor);
