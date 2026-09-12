/**
 * The game's random number generator: a 32-bit linear congruential generator
 * (multiplier 0x15A4E35, increment 1). `next(n)` returns 0..n-1 from the low 31
 * bits of the state. The state is re-seeded at the start of every life/level.
 */
export class Rng {
  private state = 0;

  get seed(): number {
    return this.state >>> 0;
  }

  reseed(seed: number): void {
    this.state = seed | 0;
  }

  next(n: number): number {
    this.state = (Math.imul(this.state, 0x15a4e35) + 1) | 0;
    return (this.state & 0x7fffffff) % n;
  }
}
