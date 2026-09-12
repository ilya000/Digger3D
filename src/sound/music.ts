// Tune player: steps through a note table once per sound interrupt and
// shapes each note with an attack/decay/sustain/release envelope on the
// channel-0 pulse width (the original's volume trick).

import { REST, PULSE_MAX, TUNES, type TuneName, type TuneStyle } from "./data";

/** Pulse width shared by the music and the level-done jingle (1..50). */
export interface Pulse {
  width: number;
}

export class TunePlayer {
  playing = false;
  tune: TuneName = "bonus";
  private style: TuneStyle = TUNES.bonus;
  private tempo = 3;
  private index = 0;
  private ticksLeft = 0;
  private held = 0;
  private gateAt = 0;
  private stage: "attack" | "decay" | "release" = "attack";
  private divisor = REST;

  /** Starts `tune` from its beginning. `tempoScale` stretches it (the
   *  original plays the dirge at 0.7 in simultaneous two-player mode). */
  start(tune: TuneName, tempoScale = 1): void {
    this.tune = tune;
    this.style = TUNES[tune];
    this.tempo = Math.trunc(this.style.tempo * tempoScale);
    this.index = 0;
    this.ticksLeft = 0;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
    this.index = 0;
  }

  /** Advances one tick. Returns the channel-0 divisor to sound (REST when
   *  silent) and whether the tune just reached its reported end. */
  tick(pulse: Pulse): { divisor: number; ended: boolean } {
    const s = this.style;
    let ended = false;
    if (this.ticksLeft !== 0) {
      this.ticksLeft--;
    } else {
      const [divisor, units] = s.notes[this.index]!;
      this.stage = "attack";
      this.held = 0;
      this.ticksLeft = units * this.tempo;
      this.gateAt = s.gate === "legato" ? this.ticksLeft - this.tempo : 2 * this.tempo;
      this.divisor = divisor;
      if (s.reportsEnd && this.index > 0 && divisor === REST) ended = true;
      this.index = (this.index + 1) % s.notes.length;
    }
    this.held++;
    if (this.held >= this.gateAt) this.stage = "release";

    let w = pulse.width;
    switch (this.stage) {
      case "attack":
        if (w + s.attack >= s.peak) {
          this.stage = "decay";
          w = s.peak;
        } else w += s.attack;
        break;
      case "decay":
        w = w - s.decay <= s.sustain ? s.sustain : w - s.decay;
        break;
      case "release":
        w = w - s.release <= 1 ? 1 : w - s.release;
        break;
    }
    pulse.width = Math.min(w, PULSE_MAX);
    return { divisor: w === 1 ? REST : this.divisor, ended };
  }
}
