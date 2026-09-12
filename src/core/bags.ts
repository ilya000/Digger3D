import { Dir } from "../contracts";
import { reverse, SOLID, X_MAX, X_MIN, Y_MAX, Y_MIN } from "./field";
import { Kind, SLOT_BAG, type Hits } from "./sprites";
import { Cmd } from "./sound";
import { Death } from "./digger";
import type { Flow, World } from "./world";

export class Bag {
  exist = false;
  x = 0;
  y = 0;
  h = 0;
  v = 0;
  xr = 0;
  yr = 0;
  /** Direction of movement (None at rest). */
  dir: Dir = Dir.None;
  /** Wobble countdown before falling. */
  wt = 0;
  /** Frames since breaking into gold (0 = still a bag). */
  gt = 0;
  /** Cells fallen. */
  fallh = 0;
  wobbling = false;
  /** Has not fallen yet (the first fall cuts a square hole). */
  unfallen = false;

  copyFrom(o: Bag): void {
    Object.assign(this, o);
  }
}

/** Wobble images: leaning left, upright, leaning right, upright. */
const WOBBLE = [2, 0, 1, 0];

/** Gold bags: wobbling, falling, breaking into gold, being pushed. */
export class Bags {
  readonly bags = [0, 1, 2, 3, 4, 5, 6].map(() => new Bag());
  private readonly saved = [0, 1].map(() => [0, 1, 2, 3, 4, 5, 6].map(() => new Bag()));
  pushCount = 0;
  goldTime = 0;

  constructor(private readonly w: World) {}

  init(): void {
    const w = this.w;
    this.pushCount = 0;
    this.goldTime = 150 - w.levof10() * 10;
    for (const b of this.bags) b.copyFrom(new Bag());
    let n = 0;
    for (let x = 0; x < 15; x++)
      for (let y = 0; y < 10; y++)
        if (w.levelChar(x, y) === "B" && n < this.bags.length) {
          const b = this.bags[n++];
          b.exist = true;
          b.gt = 0;
          b.fallh = 0;
          b.dir = Dir.None;
          b.wobbling = false;
          b.wt = 15;
          b.unfallen = true;
          b.x = x * 20 + 12;
          b.y = y * 18 + 18;
          b.h = x;
          b.v = y;
          b.xr = 0;
          b.yr = 0;
        }
    this.saved[w.curPlayer].forEach((s, i) => s.copyFrom(this.bags[i]));
  }

  /** Shows the current player's bags (a level appearing). */
  *drawAll(): Flow {
    const w = this.w;
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      b.copyFrom(this.saved[w.curPlayer][i]);
      if (b.exist) {
        w.sprites.place(SLOT_BAG + i, b.x, b.y);
        yield* w.redrawDelay();
      }
    }
  }

  /** End of a life: bags that were not at rest vanish; the rest is remembered. */
  cleanup(): void {
    const w = this.w;
    w.snd.post(Cmd.FallOff);
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      if (b.exist && ((b.h === 7 && b.v === 9) || b.xr !== 0 || b.yr !== 0 || b.gt !== 0 || b.fallh !== 0 || b.wobbling)) {
        b.exist = false;
        w.sprites.erase(SLOT_BAG + i);
      }
      this.saved[w.curPlayer][i].copyFrom(b);
    }
  }

  exists(bag: number): boolean {
    return this.bags[bag].exist;
  }

  y(bag: number): number {
    return this.bags[bag].y;
  }

  /** Movement of a bag, -1 if it is gone. */
  dir(bag: number): number {
    const b = this.bags[bag];
    return b.exist ? b.dir : -1;
  }

  /** Bags that are wobbling or breaking (the end of a life waits for them). */
  movingCount(): number {
    let n = 0;
    for (const b of this.bags) if (b.exist && b.gt < 10 && (b.gt !== 0 || b.wobbling)) n++;
    return n;
  }

  doBags(): void {
    const w = this.w;
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      if (!b.exist) continue;
      if (b.gt !== 0) {
        if (b.gt === 1) {
          w.snd.post(Cmd.Break);
          w.drawBagSprite(i, 4, b.x, b.y);
          w.incPenalty();
        }
        if (b.gt === 3) {
          w.drawBagSprite(i, 5, b.x, b.y);
          w.incPenalty();
        }
        if (b.gt === 5) {
          w.drawBagSprite(i, 6, b.x, b.y);
          w.incPenalty();
        }
        b.gt++;
        if (b.gt === this.goldTime) this.remove(i);
        else if (b.v < 9 && b.gt < this.goldTime - 10 && (w.field.get(b.h, b.v + 1) & 0x2000) === 0) b.gt = this.goldTime - 10;
      } else this.update(i);
    }
    let fallOff = true;
    let wobbleOff = true;
    for (const b of this.bags) {
      if (b.dir === Dir.Down && b.exist) fallOff = false;
      if (b.dir !== Dir.Down && b.wobbling && b.exist) wobbleOff = false;
    }
    if (fallOff) w.snd.post(Cmd.FallOff);
    if (wobbleOff) w.snd.post(Cmd.WobbleOff);
  }

  private update(i: number): void {
    const w = this.w;
    const b = this.bags[i];
    const { x, y, h, v, xr, yr } = b;
    switch (b.dir) {
      case Dir.None:
        if (y < 180 && xr === 0) {
          if (b.wobbling) {
            if (b.wt === 0) {
              b.dir = Dir.Down;
              w.snd.post(Cmd.FallOn);
              break;
            }
            b.wt--;
            const wbl = b.wt % 8;
            if (!(wbl & 1)) {
              w.drawBagSprite(i, WOBBLE[wbl >> 1], x, y);
              w.incPenalty();
              w.snd.post(Cmd.WobbleOn);
            }
          } else if ((w.field.get(h, v + 1) & SOLID) !== SOLID && !w.digger.underBag(h, v + 1)) b.wobbling = true;
        } else {
          b.wt = 15;
          b.wobbling = false;
        }
        break;
      case Dir.Right:
      case Dir.Left:
        if (xr === 0) {
          if (y < 180 && (w.field.get(h, v + 1) & SOLID) !== SOLID) {
            b.dir = Dir.Down;
            b.wt = 0;
            w.snd.post(Cmd.FallOn);
          } else this.hitGround(i);
        }
        break;
      case Dir.Down:
        if (yr === 0) b.fallh++;
        if (y >= 180) this.hitGround(i);
        else if ((w.field.get(h, v + 1) & SOLID) === SOLID && yr === 0) this.hitGround(i);
        w.monsters.scared(b.h);
        break;
      default:
        break;
    }
    if (b.dir !== Dir.None) {
      if (b.dir !== Dir.Down && this.pushCount !== 0) this.pushCount--;
      else this.push(i, b.dir);
    }
  }

  private hitGround(i: number): void {
    const w = this.w;
    const b = this.bags[i];
    if (b.dir === Dir.Down && b.fallh > 1) b.gt = 1;
    else b.fallh = 0;
    b.dir = Dir.None;
    b.wt = 15;
    b.wobbling = false;
    w.drawBagSprite(i, 0, b.x, b.y);
    const hits = w.sprites.lastHits;
    w.incPenalty();
    for (const s of hits[Kind.Bag]) this.remove(s - SLOT_BAG);
  }

  /** Moves bag `i` one step in `dir`; false if it could not move. */
  private push(i: number, dir: Dir): boolean {
    const w = this.w;
    const b = this.bags[i];
    const ox = b.x;
    const oy = b.y;
    let x = ox;
    let y = oy;
    if (b.gt !== 0) {
      this.getGold(i);
      return true;
    }
    if (b.dir === Dir.Down && (dir === Dir.Right || dir === Dir.Left)) {
      // Pushing a falling bag sideways does not move it.
      w.drawBagSprite(i, 3, x, y);
      const hits = w.sprites.lastHits;
      w.incPenalty();
      this.crush(i, y, hits);
      return true;
    }
    let push = !(
      (x === X_MAX && dir === Dir.Right) ||
      (x === X_MIN && dir === Dir.Left) ||
      (y === Y_MAX && dir === Dir.Down) ||
      (y === Y_MIN && dir === Dir.Up)
    );
    if (!push) return false;
    switch (dir) {
      case Dir.Right:
        x += 4;
        break;
      case Dir.Left:
        x -= 4;
        break;
      case Dir.Down:
        if (b.unfallen) {
          b.unfallen = false;
          w.squareBlob(x, y);
          w.topBlob(x, y + 21);
        } else w.furryBlob(x, y);
        w.eatField(x, y, dir);
        w.killEmerald(b.h, b.v);
        y += 6;
        break;
      default:
        break;
    }
    switch (dir) {
      case Dir.Down: {
        w.drawBagSprite(i, 3, x, y);
        const hits = w.sprites.lastHits;
        w.incPenalty();
        this.crush(i, y, hits);
        break;
      }
      case Dir.Right:
      case Dir.Left: {
        b.wt = 15;
        b.wobbling = false;
        w.drawBagSprite(i, 0, x, y);
        const hits = w.sprites.lastHits;
        w.incPenalty();
        this.pushCount = 1;
        if (hits[Kind.Bag].length && !this.pushAll(dir, hits)) {
          x = ox;
          y = oy;
          w.drawBagSprite(i, 0, ox, oy);
          w.incPenalty();
          push = false;
        }
        let diggerHit = false;
        for (const s of hits[Kind.Digger]) if (w.digger.alive(w.digger.indexOf(s))) diggerHit = true;
        if (diggerHit || hits[Kind.Monster].length) {
          x = ox;
          y = oy;
          w.drawBagSprite(i, 0, ox, oy);
          w.incPenalty();
          push = false;
        }
        break;
      }
      default:
        break;
    }
    b.dir = push ? dir : reverse(dir);
    b.x = x;
    b.y = y;
    b.h = Math.trunc((x - 12) / 20);
    b.v = Math.trunc((y - 18) / 18);
    b.xr = (x - 12) % 20;
    b.yr = (y - 18) % 18;
    return push;
  }

  /** A falling bag lands on the digger / monsters below its top edge. */
  private crush(i: number, y: number, hits: Hits): void {
    const w = this.w;
    for (const s of hits[Kind.Digger]) {
      const n = w.digger.indexOf(s);
      if (w.digger.state[n].y >= y) w.digger.kill(n, Death.Bag, i);
    }
    if (hits[Kind.Monster].length) w.monsters.squash(i, hits);
  }

  /** Pushes every bag in `hits` sideways; false if any could not move. */
  pushAll(dir: Dir, hits: Hits): boolean {
    let push = true;
    for (const s of hits[Kind.Bag]) if (!this.push(s - SLOT_BAG, dir)) push = false;
    return push;
  }

  /** Something runs into bags vertically: gold is collected, bags block. */
  pushVertical(hits: Hits): boolean {
    let push = true;
    for (const s of hits[Kind.Bag]) {
      if (this.bags[s - SLOT_BAG].gt !== 0) this.getGold(s - SLOT_BAG);
      else push = false;
    }
    return push;
  }

  remove(i: number): void {
    const b = this.bags[i];
    if (b.exist) {
      b.exist = false;
      this.w.sprites.erase(SLOT_BAG + i);
    }
  }

  removeAll(hits: Hits): void {
    for (const s of hits[Kind.Bag]) this.remove(s - SLOT_BAG);
  }

  private getGold(i: number): void {
    const w = this.w;
    const b = this.bags[i];
    let byMonster = true;
    w.drawBagSprite(i, 6, b.x, b.y);
    w.incPenalty();
    const hits = w.sprites.lastHits;
    for (const s of hits[Kind.Digger]) {
      const n = w.digger.indexOf(s);
      if (w.digger.alive(n)) {
        w.scores.gold(n);
        w.snd.post(Cmd.Gold);
        w.digger.resetBagTime(n);
        byMonster = false;
      }
    }
    if (byMonster) w.monsters.gold();
    this.remove(i);
  }
}
