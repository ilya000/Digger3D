// The sound effects of the original Digger as little per-tick programs.
//
// Every sound interrupt (72.8 Hz) each active effect advances one step and may
// ask for a channel-2 divisor for this tick. Effects are consulted in a fixed
// order and the last one that asks wins the speaker for the tick, so the order
// is the original's priority (lowest first). An effect that loses keeps
// running silently. On ticks where no effect asks, the music gets the
// speaker, which is how the original lets effects and music interleave.
//
// Timings and divisors are those of the original (reverse engineered in
// vendor/digger/sound_backend.c); the code structure here is our own.

import { EMERALD_SCALE, FIREBALLS } from "./data";

export interface EffectContext {
  /** The original's sound-side random generator: 0 <= r < n. */
  rand(n: number): number;
  /** Stop the music (used by the death sound). */
  musicOff(): void;
}

/** Returns a channel-2 divisor for this tick, or undefined for "nothing". */
export interface Effect {
  tick(ctx: EffectContext): number | undefined;
  stop(arg?: number): void;
}

const int16 = (v: number) => (v << 16) >> 16;

/** "emerald": a single tick at divisor 1000. */
export class EmeraldClick implements Effect {
  private pending = false;
  start(): void {
    this.pending = true;
  }
  stop(): void {
    this.pending = false;
  }
  tick(): number | undefined {
    if (!this.pending) return undefined;
    this.pending = false;
    return 1000;
  }
}

/** "emeraldStreak": the scale note for streak position n, pulsed 2 ticks in
 *  every 8 for 7 pulses. */
export class EmeraldStreak implements Effect {
  private step = -1;
  private divisor = 0;
  start(n = 0): void {
    this.divisor = EMERALD_SCALE[((Math.trunc(n) % 8) + 8) % 8]!;
    this.step = 0;
  }
  stop(): void {
    this.step = -1;
  }
  tick(): number | undefined {
    if (this.step < 0) return undefined;
    if (this.step >= 7 * 8) {
      this.step = -1;
      return undefined;
    }
    const s = this.step++;
    return s % 8 < 2 ? this.divisor : undefined;
  }
}

/** "bagWobble": four one-tick knocks per 64-tick cycle. The cycle position
 *  survives `start` and is reset only by `stop`. */
export class BagWobble implements Effect {
  private on = false;
  private pos = 0;
  private static readonly KNOCKS: Readonly<Record<number, number>> = { 0: 2000, 16: 2500, 32: 3000, 48: 2500 };
  start(): void {
    this.on = true;
  }
  stop(): void {
    this.on = false;
    this.pos = 0;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    this.pos = (this.pos + 1) & 63;
    return BagWobble.KNOCKS[this.pos];
  }
}

/** "diggerDeath": divisor 19000 down to 10000 in 10 ticks, then back up by
 *  500 per tick until past 30000. Stops the music on its first tick. */
export class DiggerDeath implements Effect {
  private step = -1;
  private divisor = 20000;
  start(): void {
    this.step = 0;
    this.divisor = 20000;
  }
  stop(): void {
    this.step = -1;
  }
  tick(ctx: EffectContext): number | undefined {
    if (this.step < 0) return undefined;
    this.step++;
    if (this.step === 1) ctx.musicOff();
    this.divisor = this.step <= 10 ? 20000 - this.step * 1000 : this.divisor + 500;
    const d = this.divisor;
    if (d > 30000) this.step = -1;
    return d;
  }
}

/** "bagBreak": 3 ticks of a very low tone. */
export class BagBreak implements Effect {
  private left = 0;
  private on = false;
  private divisor = 0;
  start(): void {
    this.left = 3;
    this.divisor = Math.max(this.divisor, 15000);
    this.on = true;
  }
  stop(): void {
    this.on = false;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    if (this.left === 0) {
      this.on = false;
      return undefined;
    }
    this.left--;
    return this.divisor;
  }
}

/** "gold": 31 ticks alternating a falling and a rising sweep. */
export class Gold implements Effect {
  private on = false;
  private left = 0;
  private rising = 0;
  private falling = 0;
  private useRising = false;
  start(): void {
    this.rising = 500;
    this.falling = 4000;
    this.left = 30;
    this.useRising = false;
    this.on = true;
  }
  stop(): void {
    this.on = false;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    if (this.left > 0) this.left--;
    else this.on = false;
    const d = this.useRising ? this.rising : this.falling;
    this.useRising = !this.useRising;
    this.rising += this.rising >> 4;
    this.falling -= this.falling >> 4;
    return d;
  }
}

/** Picks the next fireball among those that sound this tick, round-robin. */
class RoundRobin {
  private next = 0;
  pick(wants: readonly boolean[]): number {
    for (;;) {
      const n = this.next;
      this.next = (this.next + 1) % FIREBALLS;
      if (wants[n]) return n;
    }
  }
}

const fireballIndex = (arg: number | undefined) => {
  const n = Math.trunc(arg ?? 0);
  return n >= 0 && n < FIREBALLS ? n : 0;
};

/** "explode": 10 ticks of a falling divisor (rising pitch) per fireball. */
export class Explosions implements Effect {
  private readonly left = new Array<number>(FIREBALLS).fill(0);
  private readonly on = new Array<boolean>(FIREBALLS).fill(false);
  private readonly divisor = new Array<number>(FIREBALLS).fill(0);
  private readonly wants = new Array<boolean>(FIREBALLS).fill(false);
  private readonly rr = new RoundRobin();
  start(arg?: number): void {
    const n = fireballIndex(arg);
    this.divisor[n] = 1500;
    this.left[n] = 10;
    this.on[n] = true;
  }
  stop(arg?: number): void {
    if (arg === undefined) this.on.fill(false);
    else this.on[fireballIndex(arg)] = false;
  }
  tick(): number | undefined {
    let any = false;
    for (let n = 0; n < FIREBALLS; n++) {
      this.wants[n] = false;
      if (!this.on[n]) continue;
      if (this.left[n] === 0) {
        this.on[n] = false;
        continue;
      }
      this.divisor[n] -= this.divisor[n]! >> 3;
      this.left[n]--;
      this.wants[n] = any = true;
    }
    return any ? this.divisor[this.rr.pick(this.wants)] : undefined;
  }
}

/** "fire": every other tick a noisy tone whose divisor grows by 1/55 (pitch
 *  falls); ends by itself when the divisor passes 30000. */
export class Fireballs implements Effect {
  private readonly on = new Array<boolean>(FIREBALLS).fill(false);
  private readonly odd = new Array<boolean>(FIREBALLS).fill(false);
  private readonly divisor = new Array<number>(FIREBALLS).fill(0);
  private readonly wants = new Array<boolean>(FIREBALLS).fill(false);
  private readonly rr = new RoundRobin();
  start(arg?: number): void {
    const n = fireballIndex(arg);
    this.divisor[n] = 500;
    this.on[n] = true;
  }
  stop(arg?: number): void {
    const which = arg === undefined ? [...this.on.keys()] : [fireballIndex(arg)];
    for (const n of which) {
      this.on[n] = false;
      this.odd[n] = false;
    }
  }
  tick(ctx: EffectContext): number | undefined {
    let any = false;
    for (let n = 0; n < FIREBALLS; n++) {
      this.wants[n] = false;
      if (!this.on[n]) continue;
      if (!this.odd[n]) {
        this.odd[n] = true;
        continue;
      }
      this.odd[n] = false;
      this.divisor[n] += Math.trunc(this.divisor[n]! / 55);
      this.wants[n] = any = true;
      if (this.divisor[n]! > 30000) this.stop(n);
    }
    if (!any) return undefined;
    const d = this.divisor[this.rr.pick(this.wants)]!;
    return d + ctx.rand(d >> 3);
  }
}

/** "eatMonster": three 20-tick chirps (every other tick, sweeping up), each
 *  followed by one quiet tick. */
export class EatMonster implements Effect {
  private on = false;
  private chirps = 0;
  private left = 0;
  private divisor = 0;
  start(): void {
    this.left = 20;
    this.chirps = 3;
    this.divisor = 2000;
    this.on = true;
  }
  stop(): void {
    this.on = false;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    if (this.chirps === 0) {
      this.on = false;
      return undefined;
    }
    if (this.left === 0) {
      this.left = 20;
      this.chirps--;
      this.divisor = 2000;
      return undefined;
    }
    let d: number | undefined;
    if (this.left % 4 === 1) d = this.divisor;
    else if (this.left % 4 === 3) d = this.divisor - (this.divisor >> 4);
    this.left--;
    this.divisor -= this.divisor >> 4;
    return d;
  }
}

/** "bagFall": a one-tick blip every 4 ticks, 50 divisor steps lower each
 *  time (falling pitch). The 4-tick phase survives stop/start. */
export class BagFall implements Effect {
  private on = false;
  private second = false;
  private sounding = false;
  private divisor = 1000;
  start(): void {
    this.divisor = 1000;
    this.on = true;
  }
  stop(): void {
    this.on = false;
    this.second = false;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    if (!this.second) {
      this.second = true;
      return this.sounding ? this.divisor : undefined;
    }
    this.second = false;
    if (this.sounding) this.divisor = int16(this.divisor + 50);
    this.sounding = !this.sounding;
    return undefined;
  }
}

/** "oneUp": 96 ticks, 3 on / 3 off, pitch rising. */
export class OneUp implements Effect {
  private left = 0;
  start(): void {
    this.left = 96;
  }
  stop(): void {
    this.left = 0;
  }
  tick(): number | undefined {
    if (this.left <= 0) return undefined;
    const d = Math.floor(this.left / 3) % 2 !== 0 ? this.left * 4 + 600 : undefined;
    this.left--;
    return d;
  }
}

/** "bonus": siren, 6 ticks high, 2 quiet, 6 ticks low, 2 quiet. The cycle
 *  position survives `start` and is reset by `stop`. */
export class BonusSiren implements Effect {
  private on = false;
  private pos = 0;
  start(): void {
    this.on = true;
  }
  stop(): void {
    this.on = false;
    this.pos = 0;
  }
  tick(): number | undefined {
    if (!this.on) return undefined;
    this.pos = (this.pos + 1) & 15;
    if (this.pos < 6) return 0x4ce;
    if (this.pos >= 8 && this.pos < 14) return 0x5e9;
    return undefined;
  }
}

/** The original's sound random generator (a 32-bit LCG, seeded with 0). */
export class SoundRandom {
  private state = 0;
  next(n: number): number {
    this.state = (Math.imul(this.state, 0x15a4e35) + 1) | 0;
    return (this.state & 0x7fffffff) % n;
  }
}
