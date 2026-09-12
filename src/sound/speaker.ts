// Model of the PC speaker as the original Digger drives it, sample by sample.
//
// Hardware being modelled:
//   * PIT channel 2 feeds the speaker directly: a square wave at
//     PIT_HZ / divisor. Sound effects use it.
//   * PIT channel 0 fires the sound interrupt; for music the original
//     reprograms it to the note frequency and pulses the speaker from the
//     interrupt, the pulse width acting as a volume control. As in the
//     reference emulator this is a square wave at PIT_HZ / divisor whose
//     amplitude is (pulse - 1) / 49.
//   * The speaker is connected either to channel 2 (effects) or to the
//     channel-0 pulses (music), never both: effects pre-empt music.
//   * Level-done trick: channel 0 and channel 2 are tuned a few divisor
//     steps apart; their interaction is heard as channel 0 switched on and
//     off at the difference frequency (a beat gate).
//
// Phase is tracked exactly with an integer accumulator (phase = acc / rate),
// so a re-tuned voice continues from its current phase, like the hardware.

import { PIT_HZ, PIT_MAX_DIVISOR, T2_IDLE } from "./data";

/** Full-scale square level before mixing (the reference's int16 scale). */
const FULL = 32767;

class Voice {
  enabled = false;
  /** true: a gate that silences the speaker during its second half-period */
  gate = false;
  muted = false;
  freq = 0;
  hi = 0;
  lo = 0;
  acc = 0;

  restart(): void {
    this.acc = 0;
  }

  /** Enables/re-tunes the voice. A voice that was off restarts at phase 0. */
  set(freq: number, hi: number, lo: number, gate: boolean): void {
    if (freq <= 0 || (!gate && hi <= 0)) {
      this.enabled = false;
      return;
    }
    if (!this.enabled) this.restart();
    this.enabled = true;
    this.gate = gate;
    this.freq = freq;
    this.hi = hi;
    this.lo = lo;
  }

  off(): void {
    this.enabled = false;
    this.gate = false;
  }
}

export type SpeakerSource = "effects" | "music" | "none";

export class PcSpeaker {
  private readonly t0 = new Voice();
  private readonly t2 = new Voice();
  private t0Divisor = PIT_MAX_DIVISOR;

  constructor(readonly sampleRate: number) {
    this.t0.muted = true;
  }

  /** Channel 0 = music pulses at PIT_HZ/divisor with pulse width 1..50. */
  setTimer0(divisor: number, pulse: number): void {
    this.t0Divisor = divisor;
    if (divisor > T2_IDLE && divisor < PIT_MAX_DIVISOR) {
      const level = Math.trunc(((pulse - 1) / 49) * FULL);
      this.t0.set(Math.floor(PIT_HZ / divisor), level, -level, false);
    } else {
      this.t0.off();
    }
  }

  /** Channel 2 = plain tone at PIT_HZ/divisor (or off when out of range). */
  setTimer2(divisor: number): void {
    if (divisor > T2_IDLE && divisor < PIT_MAX_DIVISOR) {
      this.t2.set(Math.floor(PIT_HZ / divisor), FULL, -FULL, false);
    } else {
      this.t2.off();
    }
  }

  /** Channel 2 tuned against channel 0: the speaker hears channel 0 gated
   *  at the difference frequency. Also connects channel 2. */
  setTimer2Beat(divisor: number): void {
    if (divisor > T2_IDLE && divisor < PIT_MAX_DIVISOR) {
      const beat = Math.floor(PIT_HZ / divisor) - Math.floor(PIT_HZ / this.t0Divisor);
      const restart = !this.t2.enabled || this.t2.muted;
      this.t2.set(beat, FULL, 0, true);
      this.t2.muted = false;
      if (restart) this.t2.restart();
    } else {
      this.t2.off();
    }
  }

  /** Connects the speaker to one source (the other is disconnected). */
  connect(source: SpeakerSource): void {
    this.t0.muted = source !== "music";
    this.t2.muted = source !== "effects";
  }

  /** Disconnects everything (pause / sound off). */
  disconnect(): void {
    this.t0.muted = true;
    this.t2.muted = true;
  }

  /** Next raw sample in the reference's int16 scale (±16383 at full level). */
  next(): number {
    const rate = this.sampleRate;
    let sum = 0;
    let gated = false;
    for (const v of [this.t0, this.t2]) {
      if (!v.enabled) continue;
      if (!v.muted) {
        // exact phase: [0, 1/2) is the high half
        const firstHalf = v.acc * 2 < rate;
        if (v.gate) {
          if (!firstHalf) gated = true;
        } else {
          sum += firstHalf ? v.hi : v.lo;
        }
      }
      v.acc += v.freq;
      if (v.acc >= rate) v.acc %= rate;
    }
    // two voices share the output range, like the reference's 2-band mixer
    return gated ? 0 : Math.trunc(sum / 2);
  }
}

/** How raw speaker samples become output samples. */
export type OutputMode =
  /** The pure square wave (reference builds with NO_SND_FILTER: the
   *  GNUmakefile / CI / release builds). Default. */
  | "raw"
  /** The SDL backend's speaker filter (CMake build): 1 kHz high-pass and
   *  4 kHz low-pass with heavy overdrive, i.e. clicky clipped edges. */
  | "sdl-filter";

/** First-order IIR section designed with the bilinear transform. */
class OnePole {
  private x1 = 0;
  private y1 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly a1: number;

  constructor(kind: "lowpass" | "highpass", cutoff: number, rate: number) {
    const k = Math.tan((Math.PI * cutoff) / rate);
    const n = 1 / (1 + k);
    this.a1 = n * (k - 1);
    if (kind === "lowpass") {
      this.b0 = n * k;
      this.b1 = this.b0;
    } else {
      this.b0 = n;
      this.b1 = -n;
    }
  }

  step(x: number): number {
    const y = x * this.b0 + this.x1 * this.b1 - this.y1 * this.a1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** Converts raw speaker samples to [-1, 1) floats. */
export class OutputStage {
  private readonly hp: OnePole | null;
  private readonly lp: OnePole | null;

  constructor(readonly mode: OutputMode, rate: number) {
    this.hp = mode === "sdl-filter" ? new OnePole("highpass", 1000, rate) : null;
    this.lp = mode === "sdl-filter" ? new OnePole("lowpass", 4000, rate) : null;
  }

  process(raw: number): number {
    if (!this.hp || !this.lp) return raw / 32768;
    // the SDL backend treats samples as if they were unsigned 8-bit
    const x = this.hp.step((raw - 127) * 128);
    const y = this.lp.step(x);
    let r = y < 0 ? -Math.round(-y) : Math.round(y); // C round(): half away from 0
    if (r > 32767) r = 32767;
    else if (r < -32768) r = -32768;
    return r / 32768;
  }
}
