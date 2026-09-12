import { Dir } from "../contracts";
import { reverse, X_MAX, X_MIN, Y_MAX, Y_MIN } from "./field";
import { Kind, SLOT_MONSTER, type Hits } from "./sprites";
import { Cmd } from "./sound";
import { Death } from "./digger";
import type { World } from "./world";

/**
 * A monster's body on the screen: position, Nobbin/Hobbin form, alive or
 * dying, and its sprite. Also used by the title-screen animation.
 */
export class MonsterBody {
  nobbin: boolean;
  alive = true;
  /** Squashed by a bag and dying. */
  zombie = false;
  x: number;
  y: number;
  /** Direction the (Hobbin) sprite faces: left or right. */
  dir: Dir;
  private anim = 0;
  private animStep = 1;

  constructor(
    private readonly w: World,
    readonly id: number,
    nobbin: boolean,
    dir: Dir,
    x: number,
    y: number,
  ) {
    this.nobbin = nobbin;
    this.dir = dir;
    this.x = x;
    this.y = y;
  }

  private get slot(): number {
    return SLOT_MONSTER + this.id;
  }

  private chooseImage(): void {
    const s = this.w.assets.sprites;
    const sp = this.w.sprites;
    if (this.alive) {
      if (this.nobbin) sp.setNext(this.slot, s.nobbin[this.anim]);
      else if (this.dir === Dir.Right) sp.setNext(this.slot, s.hobbinRight[this.anim]);
      else if (this.dir === Dir.Left) sp.setNext(this.slot, s.hobbinLeft[this.anim]);
    } else if (this.zombie) {
      if (this.nobbin) sp.setNext(this.slot, s.nobbinDead);
      else if (this.dir === Dir.Right) sp.setNext(this.slot, s.hobbinRightDead);
      else if (this.dir === Dir.Left) sp.setNext(this.slot, s.hobbinLeftDead);
    }
  }

  put(): void {
    this.chooseImage();
    this.w.sprites.place(this.slot, this.x, this.y);
  }

  /** Nobbin <-> Hobbin. */
  mutate(): void {
    this.nobbin = !this.nobbin;
    this.chooseImage();
    this.w.sprites.draw(this.slot, this.x, this.y);
  }

  damage(): void {
    this.zombie = true;
    this.alive = false;
    this.chooseImage();
    this.w.sprites.draw(this.slot, this.x, this.y);
  }

  kill(): void {
    this.alive = false;
    this.zombie = false;
    this.w.sprites.erase(this.slot);
  }

  animate(): void {
    if (this.alive) {
      this.anim += this.animStep;
      if (this.anim === 2 || this.anim === 0) this.animStep = -this.animStep;
      if (this.anim > 2) this.anim = 2;
      if (this.anim < 0) this.anim = 0;
      this.chooseImage();
      this.w.sprites.draw(this.slot, this.x, this.y);
    } else if (this.zombie) {
      this.chooseImage();
      this.w.sprites.draw(this.slot, this.x, this.y);
    }
  }
}

/** A monster slot: AI state around a body. */
export class Monster {
  active = false;
  body: MonsterBody | null = null;
  /** Cell and offset inside it. */
  h = 0;
  v = 0;
  xr = 0;
  yr = 0;
  /** Direction of travel (Right in the cleared state, like the original). */
  dir: Dir = Dir.Right;
  /** Frames to wait before moving again. */
  t = 0;
  /** Hobbin counter: crossings (as Nobbin) or time spent (as Hobbin). */
  hnt = 0;
  death = 0;
  bag = 0;
  dtime = 0;
  /** Frames after appearing before it starts to move. */
  stime = 0;
  chase = 0;

  reset(): void {
    Object.assign(this, new Monster());
  }
}

/** Nobbins and Hobbins: spawning, chasing, mutation, dying. */
export class Monsters {
  readonly slots = [0, 1, 2, 3, 4, 5].map(() => new Monster());
  nextMonster = 0;
  totalMonsters = 0;
  private maxOnScreen = 0;
  nextMonTime = 0;
  private gapTime = 0;
  private chase = 0;
  unbonusFlag = false;
  /** Set when a monster ate gold (no time penalty for pushing it). */
  private gotGold = false;

  constructor(private readonly w: World) {}

  init(): void {
    for (const m of this.slots) m.reset();
    const l = this.w.levof10();
    this.nextMonster = 0;
    this.chase = 0;
    this.gapTime = 45 - (l << 1);
    this.totalMonsters = l + 5;
    this.maxOnScreen = l === 1 ? 3 : l <= 7 ? 4 : 5;
    this.nextMonTime = 10;
    this.unbonusFlag = true;
  }

  erase(): void {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].active) this.w.sprites.erase(SLOT_MONSTER + i);
  }

  onScreen(): number {
    let n = 0;
    for (const m of this.slots) if (m.active) n++;
    return n;
  }

  /** Monsters still to be dealt with on this level. */
  left(): number {
    return this.onScreen() + this.totalMonsters - this.nextMonster;
  }

  /** Workload penalty: slows the monsters down when the frame had much to draw. */
  incTime(n: number): void {
    if (n > 6) n = 6;
    for (let m = 1; m < n; m++) this.slots[m].t++;
  }

  gold(): void {
    this.gotGold = true;
  }

  doMonsters(): void {
    const w = this.w;
    if (this.nextMonTime > 0) this.nextMonTime--;
    else {
      if (this.nextMonster < this.totalMonsters && this.onScreen() < this.maxOnScreen && w.digger.isAlive() && !w.bonusMode)
        this.create();
      if (this.unbonusFlag && this.nextMonster === this.totalMonsters && this.nextMonTime === 0 && w.digger.isAlive()) {
        this.unbonusFlag = false;
        w.createBonus();
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      const m = this.slots[i];
      if (!m.active) continue;
      const body = m.body!;
      if (m.hnt > 10 - w.levof10() && body.nobbin) {
        body.mutate();
        m.hnt = 0;
      }
      if (body.alive) {
        if (m.t === 0) {
          this.ai(i);
          if (w.rng.next(15 - w.levof10()) === 0 && body.nobbin && body.alive) this.ai(i);
        } else m.t--;
      } else this.dying(i);
    }
  }

  private create(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const m = this.slots[i];
      if (m.active) continue;
      m.active = true;
      m.t = 0;
      m.hnt = 0;
      m.h = 14;
      m.v = 0;
      m.xr = 0;
      m.yr = 0;
      m.dir = Dir.Left;
      m.chase = this.chase + this.w.curPlayer;
      m.body = new MonsterBody(this.w, i, true, Dir.Left, 292, 18);
      this.chase = 0;
      this.nextMonster++;
      this.nextMonTime = this.gapTime;
      m.stime = 5;
      m.body.put();
      break;
    }
  }

  /** Can a Nobbin go from cell (x, y) in `dir`? */
  private fieldClear(dir: Dir, x: number, y: number): boolean {
    const f = this.w.field;
    switch (dir) {
      case Dir.Right:
        return x < 14 && (f.get(x + 1, y) & 0x2000) === 0 && ((f.get(x + 1, y) & 1) === 0 || (f.get(x, y) & 0x10) === 0);
      case Dir.Up:
        return y > 0 && (f.get(x, y - 1) & 0x2000) === 0 && ((f.get(x, y - 1) & 0x800) === 0 || (f.get(x, y) & 0x40) === 0);
      case Dir.Left:
        return x > 0 && (f.get(x - 1, y) & 0x2000) === 0 && ((f.get(x - 1, y) & 0x10) === 0 || (f.get(x, y) & 1) === 0);
      case Dir.Down:
        return y < 9 && (f.get(x, y + 1) & 0x2000) === 0 && ((f.get(x, y + 1) & 0x40) === 0 || (f.get(x, y) & 0x800) === 0);
      default:
        return false;
    }
  }

  private ai(mon: number): void {
    const w = this.w;
    const m = this.slots[mon];
    const body = m.body!;
    const ox = body.x;
    const oy = body.y;
    let x = body.x;
    let y = body.y;
    if (m.xr === 0 && m.yr === 0) {
      // A Hobbin turns back into a Nobbin after a while.
      if (m.hnt > 30 + (w.levof10() << 1) && !body.nobbin) {
        m.hnt = 0;
        body.mutate();
      }
      const dig = w.digger.state[w.digger.alive(m.chase) ? m.chase : w.curPlayer];
      let p1: Dir, p2: Dir, p3: Dir, p4: Dir;
      if (Math.abs(dig.y - y) > Math.abs(dig.x - x)) {
        if (dig.y < y) [p1, p4] = [Dir.Up, Dir.Down];
        else [p1, p4] = [Dir.Down, Dir.Up];
        if (dig.x < x) [p2, p3] = [Dir.Left, Dir.Right];
        else [p2, p3] = [Dir.Right, Dir.Left];
      } else {
        if (dig.x < x) [p1, p4] = [Dir.Left, Dir.Right];
        else [p1, p4] = [Dir.Right, Dir.Left];
        if (dig.y < y) [p2, p3] = [Dir.Up, Dir.Down];
        else [p2, p3] = [Dir.Down, Dir.Up];
      }
      // In bonus mode they run away.
      if (w.bonusMode) {
        [p1, p4] = [p4, p1];
        [p2, p3] = [p3, p2];
      }
      // Reversing is the last resort.
      let dir = reverse(m.dir);
      if (dir === p1) [p1, p2, p3, p4] = [p2, p3, p4, dir];
      if (dir === p2) [p2, p3, p4] = [p3, p4, dir];
      if (dir === p3) [p3, p4] = [p4, dir];
      // Some randomness on the early levels.
      if (w.rng.next(w.levof10() + 5) === 1 && w.levof10() < 6) [p1, p3] = [p3, p1];
      if (this.fieldClear(p1, m.h, m.v)) dir = p1;
      else if (this.fieldClear(p2, m.h, m.v)) dir = p2;
      else if (this.fieldClear(p3, m.h, m.v)) dir = p3;
      else if (this.fieldClear(p4, m.h, m.v)) dir = p4;
      // Hobbins dig: they go where they want.
      if (!body.nobbin) dir = p1;
      if (m.dir !== dir) m.t++;
      m.dir = dir;
    }
    if (
      (x === X_MAX && m.dir === Dir.Right) ||
      (x === X_MIN && m.dir === Dir.Left) ||
      (y === Y_MAX && m.dir === Dir.Down) ||
      (y === Y_MIN && m.dir === Dir.Up)
    )
      m.dir = Dir.None;
    if (m.dir === Dir.Left || m.dir === Dir.Right) body.dir = m.dir;
    const hobbin = !body.nobbin;
    if (hobbin) w.eatField(x, y, m.dir);
    let moved = true;
    switch (m.dir) {
      case Dir.Right:
        if (hobbin) w.rightBlob(x, y);
        x += 4;
        break;
      case Dir.Up:
        if (hobbin) w.topBlob(x, y);
        y -= 3;
        break;
      case Dir.Left:
        if (hobbin) w.leftBlob(x, y);
        x -= 4;
        break;
      case Dir.Down:
        if (hobbin) w.bottomBlob(x, y);
        y += 3;
        break;
      default:
        moved = false;
    }
    if (hobbin) w.hitEmerald(Math.trunc((x - 12) / 20), Math.trunc((y - 18) / 18), (x - 12) % 20, (y - 18) % 18, m.dir);
    if (!w.digger.isAlive() && moved) {
      x = ox;
      y = oy;
      moved = false;
    }
    if (m.stime !== 0) {
      m.stime--;
      if (moved) {
        x = ox;
        y = oy;
        moved = false;
      }
    }
    if (!body.nobbin && m.hnt < 100) m.hnt++;
    if (moved) {
      body.x = x;
      body.y = y;
    }
    let push = true;
    body.animate();
    const hits = w.sprites.lastHits;
    w.incPenalty();
    if (hits[Kind.Monster].length) {
      m.t++;
      for (const slot of hits[Kind.Monster]) {
        const other = this.slots[slot - SLOT_MONSTER];
        if (m.dir === other.dir && other.stime === 0 && m.stime === 0) other.dir = reverse(other.dir);
        w.incPenalty();
      }
    }
    let bagHit = false;
    for (const b of hits[Kind.Bag])
      if (w.bags.exists(b - 1)) {
        bagHit = true;
        break;
      }
    if (bagHit) {
      m.t++;
      this.gotGold = false;
      if (m.dir === Dir.Right || m.dir === Dir.Left) {
        push = w.bags.pushAll(m.dir, hits);
        m.t++;
      } else if (!w.bags.pushVertical(hits)) push = false;
      if (this.gotGold) m.t = 0;
      if (!body.nobbin && m.hnt > 1) w.bags.removeAll(hits);
    }
    if (body.nobbin && hits[Kind.Monster].length && w.digger.isAlive()) m.hnt++;
    if (!push) {
      if (moved) {
        x = ox;
        y = oy;
        body.x = x;
        body.y = y;
        moved = false;
      }
      body.animate();
      w.incPenalty();
      if (body.nobbin) m.hnt++;
      if ((m.dir === Dir.Up || m.dir === Dir.Down) && body.nobbin) m.dir = reverse(m.dir);
    }
    if (hits[Kind.Digger].length && w.digger.isAlive()) {
      if (w.bonusMode) {
        this.kill(mon);
        for (const slot of hits[Kind.Digger]) {
          const n = w.digger.indexOf(slot);
          if (w.digger.alive(n)) w.digger.eatMonster(n);
        }
        w.snd.post(Cmd.EatMonster);
      } else
        for (const slot of hits[Kind.Digger]) {
          const n = w.digger.indexOf(slot);
          if (w.digger.alive(n)) w.digger.kill(n, Death.Monster, 0);
        }
    }
    m.h = Math.trunc((x - 12) / 20);
    m.v = Math.trunc((y - 18) / 18);
    m.xr = (x - 12) % 20;
    m.yr = (y - 18) % 18;
  }

  private dying(mon: number): void {
    const w = this.w;
    const m = this.slots[mon];
    const body = m.body!;
    switch (m.death) {
      case 1:
        if (w.bags.y(m.bag) + 6 > body.y) body.y = w.bags.y(m.bag);
        body.animate();
        w.incPenalty();
        if (w.bags.dir(m.bag) === -1) {
          m.dtime = 1;
          m.death = 4;
        }
        break;
      case 4:
        if (m.dtime !== 0) m.dtime--;
        else {
          this.kill(mon);
          w.scores.kill(w.curPlayer);
        }
        break;
      default:
        break;
    }
  }

  /** A falling bag scares monsters going up in its column. */
  scared(h: number): void {
    for (const m of this.slots) if (h === m.h && m.dir === Dir.Up) m.dir = Dir.Down;
  }

  kill(mon: number): void {
    const m = this.slots[mon];
    if (m.active) {
      m.active = false;
      m.body!.kill();
      if (this.w.bonusMode) this.totalMonsters++;
    }
  }

  /** Monsters hit by falling bag `bag` (at or below its top) start dying under it. */
  squash(bag: number, hits: Hits): void {
    for (const slot of hits[Kind.Monster]) {
      const m = this.slots[slot - SLOT_MONSTER];
      if (m.body!.y >= this.w.bags.y(bag)) {
        m.body!.damage();
        m.death = 1;
        m.bag = bag;
      }
    }
  }

  killAll(hits: Hits): number {
    let n = 0;
    for (const slot of hits[Kind.Monster]) {
      this.kill(slot - SLOT_MONSTER);
      n++;
    }
    return n;
  }
}
