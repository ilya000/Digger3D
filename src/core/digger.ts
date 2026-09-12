import { Dir } from "../contracts";
import { reverse, X_MAX, X_MIN, Y_MAX, Y_MIN } from "./field";
import { Kind, SLOT_DIGGER, SLOT_FIREBALL, SLOT_MONSTER, type Hits } from "./sprites";
import { Cmd, Tune } from "./sound";
import { int16, type World } from "./world";

/** Stages of the death sequence. */
export const enum Death {
  /** Crushed under a falling bag, riding it down. */
  Bag = 1,
  /** Turned over, then the tombstone rises. */
  Grave = 2,
  /** Hit by a monster (becomes Arc next frame). */
  Monster = 3,
  /** Waiting with the tombstone shown. */
  Tombstone = 4,
  /** Jumping up after a monster hit. */
  Arc = 5,
  Done = 6,
}

/** Height of the jump after a monster hit, frame by frame. */
const DEATH_ARC = [3, 5, 6, 6, 5, 3, 0];

export interface Fireball {
  x: number;
  y: number;
  dir: Dir;
  /** 0 flying, 1-3 explosion stages, 4 finished. */
  expsn: number;
}

/** One player's digger. */
export class DiggerState {
  x = 0;
  y = 0;
  /** Direction faced (starts as Right, like the cleared state of the original). */
  dir: Dir = Dir.Right;
  alive = false;
  canFire = false;
  /** Cell and offset inside it (updated after each move). */
  h = 0;
  v = 0;
  rx = 0;
  ry = 0;
  /** Direction of travel this frame (None when standing). */
  mdir: Dir = Dir.Right;
  /** Frames left of being held back by a bag it pushes. */
  bagtime = 0;
  rechargeTime = 0;
  deathStage = 0;
  deathBag = 0;
  deathAni = 0;
  deathTime = 0;
  /** Frames within which the next emerald continues the octave. */
  emeraldTime = 0;
  emeraldRun = 0;
  /** Multiplier of the next monster eaten in bonus mode. */
  msc = 0;
  lives = 0;
  notFiring = false;
  dead = false;
  /** Ticket of the dirge the game waits for (0 = none). */
  deathMusic = 0;
  /** Frames since this digger was hit (for the 3D view). */
  deathFrames = 0;
  fire: Fireball = { x: 0, y: 0, dir: Dir.Right, expsn: 0 };

  reset(): void {
    Object.assign(this, new DiggerState());
  }
}

/** The digger: movement, digging, emeralds, fire, bags pushing, death and lives. */
export class DiggerLogic {
  readonly state = [new DiggerState(), new DiggerState()];

  constructor(private readonly w: World) {}

  private get cur(): number {
    return this.w.curPlayer;
  }

  lives(n: number): number {
    return this.state[n].lives;
  }

  initLives(): void {
    for (const d of this.state) d.reset();
    for (let i = 0; i < this.w.nPlayers; i++) this.state[i].lives = 3;
  }

  /** Lives left of the player whose turn it is. */
  allLives(): number {
    return this.state[this.cur].lives;
  }

  addLife(n: number): void {
    this.state[n].lives++;
    this.w.snd.post(Cmd.ExtraLife);
  }

  decLife(n: number): void {
    this.state[n].lives--;
  }

  isAlive(): boolean {
    return this.state[this.cur].alive;
  }

  alive(n: number): boolean {
    return this.state[n].alive;
  }

  /** Puts the current player's digger at the start position (start of a life). */
  init(): void {
    const w = this.w;
    w.startBonusTimeLeft = 0;
    w.bonusTimeLeft = 0;
    const n = this.cur;
    const d = this.state[n];
    if (d.lives === 0) {
      d.dead = true;
      d.deathStage = Death.Done;
      d.deathMusic = 0;
      d.alive = false;
      d.bagtime = 0;
      d.notFiring = true;
      d.rechargeTime = 0;
      d.emeraldTime = 0;
      d.fire.expsn = 0;
      w.sprites.erase(SLOT_DIGGER);
      w.sprites.erase(SLOT_FIREBALL);
    } else {
      d.v = 9;
      d.mdir = Dir.Left;
      d.h = 7;
      d.rx = 0;
      d.ry = 0;
      d.bagtime = 0;
      d.dead = false;
      d.deathStage = Death.Bag;
      d.deathMusic = 0;
      d.deathFrames = 0;
      d.x = d.h * 20 + 12;
      d.y = d.v * 18 + 18;
      d.dir = n === 0 ? Dir.Right : Dir.Left;
      d.alive = true;
      d.canFire = true;
      w.sprites.place(SLOT_DIGGER, d.x, d.y);
      d.notFiring = true;
      d.emeraldTime = 0;
      d.fire = { x: 0, y: 0, dir: Dir.Right, expsn: 0 };
      d.fire.dir = 0 as Dir;
      d.rechargeTime = 0;
      d.emeraldRun = 0;
      d.msc = 1;
    }
    w.diggerVisible = true;
    w.bonusVisible = false;
    w.bonusMode = false;
  }

  /** Takes the digger off the screen at the end of a life. */
  eraseAll(): void {
    this.w.sprites.erase(SLOT_DIGGER);
    this.w.diggerVisible = false;
  }

  private drawDig(n: number): void {
    const d = this.state[n];
    this.w.drawDiggerSprite(0, d.dir, d.x, d.y, d.canFire);
  }

  /** The digger's part of a frame. */
  doDiggers(): void {
    const w = this.w;
    const n = this.cur;
    const d = this.state[n];
    w.keys.readControls();
    if (d.fire.expsn !== 0) this.drawExplosion(n);
    else this.updateFire(n);
    if (w.diggerVisible) {
      if (d.alive) {
        if (d.bagtime !== 0) {
          const t = d.dir;
          d.dir = d.mdir;
          this.drawDig(n);
          d.dir = t;
          w.incPenalty();
          d.bagtime--;
        } else this.updateDigger(n);
      } else this.die(n);
    }
    if (d.emeraldTime > 0) d.emeraldTime--;
    if (!d.alive) d.deathFrames++;
    w.updateBonusMode();
  }

  /** The direction the player asks for this frame (or the recording's). */
  private readDirection(): Dir {
    const w = this.w;
    let dir = w.keys.direction;
    if (w.playback) {
      const c = w.playback.nextControl();
      if (c === null) w.keys.escape = true;
      else {
        dir = c.dir;
        w.keys.fireFlag = c.fire;
      }
    }
    return dir;
  }

  private putFireball(n: number): void {
    const f = this.state[n].fire;
    this.w.sprites.place(SLOT_FIREBALL, f.x, f.y);
    this.w.snd.post(Cmd.FireOn, 0);
  }

  private animateFireball(n: number): void {
    const f = this.state[n].fire;
    this.w.drawFireSprite(0, f.x, f.y, f.expsn);
    if (f.expsn > 0) {
      if (f.expsn === 1) this.w.snd.post(Cmd.Explode, 0);
      f.expsn++;
    }
  }

  private removeFireball(n: number): void {
    const f = this.state[n].fire;
    this.w.sprites.erase(SLOT_FIREBALL);
    if (f.expsn > 1) this.w.snd.post(Cmd.FireOff, 0);
    f.expsn = 0;
  }

  private explode(n: number): void {
    this.state[n].fire.expsn = 1;
  }

  private drawExplosion(n: number): void {
    if (this.state[n].fire.expsn < 4) {
      this.animateFireball(n);
      this.w.incPenalty();
    } else this.killFire(n);
  }

  killFire(n: number): void {
    const d = this.state[n];
    if (!d.notFiring) {
      d.notFiring = true;
      this.removeFireball(n);
    }
  }

  private updateFire(n: number): void {
    const w = this.w;
    const d = this.state[n];
    if (d.notFiring) {
      if (d.rechargeTime !== 0) {
        d.rechargeTime--;
        if (d.rechargeTime === 0) d.canFire = true;
      } else if (w.keys.fire && d.alive) {
        d.canFire = false;
        d.rechargeTime = w.levof10() * 3 + 60;
        d.notFiring = false;
        let fx = d.x;
        let fy = d.y;
        switch (d.dir) {
          case Dir.Right:
            fx += 8;
            fy += 4;
            break;
          case Dir.Up:
            fx += 4;
            break;
          case Dir.Left:
            fy += 4;
            break;
          case Dir.Down:
            fx += 4;
            fy += 8;
            break;
          default:
            break;
        }
        d.fire = { x: fx, y: fy, dir: d.dir, expsn: 0 };
        this.putFireball(n);
      }
      return;
    }
    const f = d.fire;
    const scr = w.screen;
    let pix = 0;
    switch (f.dir) {
      case Dir.Right:
        f.x += 8;
        pix = scr.readByte(f.x, f.y + 4) | scr.readByte(f.x + 4, f.y + 4);
        break;
      case Dir.Up:
        f.y -= 7;
        for (let i = 0; i < 7; i++) pix |= scr.readByte(f.x + 4, f.y + i);
        pix &= 0xc0;
        break;
      case Dir.Left:
        f.x -= 8;
        pix = scr.readByte(f.x, f.y + 4) | scr.readByte(f.x + 4, f.y + 4);
        break;
      case Dir.Down:
        f.y += 7;
        for (let i = 0; i < 7; i++) pix |= scr.readByte(f.x, f.y + i);
        pix &= 0x3;
        break;
      default:
        break;
    }
    this.animateFireball(n);
    const hits = w.sprites.lastHits;
    w.incPenalty();
    for (const m of hits[Kind.Monster]) {
      w.monsters.kill(m - SLOT_MONSTER);
      w.scores.kill(n);
      this.explode(n);
    }
    const anyHit = hits.some((h) => h.length > 0);
    if (hits[Kind.Bonus].length || hits[Kind.Bag].length || hits[Kind.Fireball].length) this.explode(n);
    switch (f.dir) {
      case Dir.Right:
        if (f.x > 296) this.explode(n);
        else if (pix !== 0 && !anyHit) {
          f.x -= 8;
          this.animateFireball(n);
          this.explode(n);
        }
        break;
      case Dir.Up:
        if (f.y < 15) this.explode(n);
        else if (pix !== 0 && !anyHit) {
          f.y += 7;
          this.animateFireball(n);
          this.explode(n);
        }
        break;
      case Dir.Left:
        if (f.x < 16) this.explode(n);
        else if (pix !== 0 && !anyHit) {
          f.x += 8;
          this.animateFireball(n);
          this.explode(n);
        }
        break;
      case Dir.Down:
        if (f.y > 183) this.explode(n);
        else if (pix !== 0 && !anyHit) {
          f.y -= 7;
          this.animateFireball(n);
          this.explode(n);
        }
        break;
      default:
        break;
    }
  }

  private updateDigger(n: number): void {
    const w = this.w;
    const d = this.state[n];
    const dir = this.readDirection();
    const want = dir === Dir.Right || dir === Dir.Up || dir === Dir.Left || dir === Dir.Down ? dir : Dir.None;
    // Turning is only possible on the grid lines of the other axis.
    if (d.rx === 0 && (want === Dir.Up || want === Dir.Down)) d.dir = d.mdir = want;
    if (d.ry === 0 && (want === Dir.Right || want === Dir.Left)) d.dir = d.mdir = want;
    d.mdir = dir === Dir.None ? Dir.None : d.dir;
    if (
      (d.x === X_MAX && d.mdir === Dir.Right) ||
      (d.x === X_MIN && d.mdir === Dir.Left) ||
      (d.y === Y_MAX && d.mdir === Dir.Down) ||
      (d.y === Y_MIN && d.mdir === Dir.Up)
    )
      d.mdir = Dir.None;
    const ox = d.x;
    const oy = d.y;
    if (d.mdir !== Dir.None) w.eatField(ox, oy, d.mdir);
    switch (d.mdir) {
      case Dir.Right:
        w.rightBlob(d.x, d.y);
        d.x += 4;
        break;
      case Dir.Up:
        w.topBlob(d.x, d.y);
        d.y -= 3;
        break;
      case Dir.Left:
        w.leftBlob(d.x, d.y);
        d.x -= 4;
        break;
      case Dir.Down:
        w.bottomBlob(d.x, d.y);
        d.y += 3;
        break;
      default:
        break;
    }
    if (
      w.hitEmerald(
        Math.trunc((d.x - 12) / 20),
        Math.trunc((d.y - 18) / 18),
        (d.x - 12) % 20,
        (d.y - 18) % 18,
        d.mdir,
      )
    ) {
      if (d.emeraldTime === 0) d.emeraldRun = 0;
      w.scores.emerald(n);
      w.snd.post(Cmd.Em);
      w.snd.post(Cmd.Emerald, d.emeraldRun);
      d.emeraldRun++;
      if (d.emeraldRun === 8) {
        d.emeraldRun = 0;
        w.scores.octave(n);
      }
      d.emeraldTime = 9;
    }
    this.drawDig(n);
    const hits = w.sprites.lastHits;
    w.incPenalty();
    let bagHit = false;
    for (const b of hits[Kind.Bag])
      if (w.bags.exists(b - 1)) {
        bagHit = true;
        break;
      }
    if (bagHit) {
      let push = true;
      if (d.mdir === Dir.Right || d.mdir === Dir.Left) {
        push = w.bags.pushAll(d.mdir, hits);
        d.bagtime++;
      } else if (!w.bags.pushVertical(hits)) push = false;
      if (!push) {
        d.x = ox;
        d.y = oy;
        d.dir = d.mdir;
        this.drawDig(n);
        w.incPenalty();
        d.dir = reverse(d.mdir);
      }
    }
    if (hits[Kind.Monster].length && w.bonusMode && d.alive)
      for (let eaten = w.monsters.killAll(hits); eaten !== 0; eaten--) {
        w.snd.post(Cmd.EatMonster);
        this.eatMonster(n);
      }
    if (hits[Kind.Bonus].length) {
      w.scores.bonus(n);
      w.initBonusMode();
    }
    d.h = Math.trunc((d.x - 12) / 20);
    d.rx = (d.x - 12) % 20;
    d.v = Math.trunc((d.y - 18) / 18);
    d.ry = (d.y - 18) % 18;
  }

  /** Scores a monster eaten in bonus mode; each one is worth double the previous. */
  eatMonster(n: number): void {
    const d = this.state[n];
    this.w.scores.eatMonster(n, d.msc);
    d.msc = int16(d.msc << 1);
  }

  private die(n: number): void {
    const w = this.w;
    const d = this.state[n];
    switch (d.deathStage) {
      case Death.Bag: {
        const by = w.bags.y(d.deathBag);
        if (by + 6 > d.y) d.y = by + 6;
        w.drawDiggerSprite(0, 15, d.x, d.y, false);
        w.incPenalty();
        if (w.bags.dir(d.deathBag) + 1 === 0) {
          w.snd.post(Cmd.DiggerDie);
          d.deathTime = 5;
          d.deathStage = Death.Grave;
          d.deathAni = 0;
          d.y -= 6;
        }
        break;
      }
      case Death.Grave: {
        if (d.deathTime !== 0) {
          d.deathTime--;
          break;
        }
        if (d.deathAni === 0) d.deathMusic = w.snd.musicWithAck(Tune.Dirge);
        w.drawDiggerSprite(0, 14 - d.deathAni, d.x, d.y, false);
        const hits: Hits = w.sprites.lastHits;
        w.incPenalty();
        if (d.deathAni === 0 && hits[Kind.Monster].length) w.monsters.killAll(hits);
        if (d.deathAni < 4) {
          d.deathAni++;
          d.deathTime = 2;
        } else {
          d.deathStage = Death.Tombstone;
          d.deathTime = w.snd.musicOn ? 60 : 10;
        }
        break;
      }
      case Death.Monster:
        d.deathStage = Death.Arc;
        d.deathAni = 0;
        d.deathTime = 0;
        break;
      case Death.Arc:
        if (d.deathAni >= 0 && d.deathAni <= 6) {
          w.drawDiggerSprite(0, 15, d.x, d.y - DEATH_ARC[d.deathAni], false);
          if (d.deathAni === 6 && !this.isAlive()) w.snd.post(Cmd.MusicOff);
          w.incPenalty();
          d.deathAni++;
          if (d.deathAni === 1) w.snd.post(Cmd.DiggerDie);
          if (d.deathAni === 7) {
            d.deathTime = 5;
            d.deathAni = 0;
            d.deathStage = Death.Grave;
          }
        }
        break;
      case Death.Tombstone:
        if (d.deathTime !== 0) d.deathTime--;
        else {
          if (this.deathMusicPending(n)) break;
          d.deathMusic = 0;
          d.dead = true;
          w.allDead = true;
        }
        break;
      default:
        break;
    }
  }

  /** True while the game must wait for the dirge of digger `n` to finish. */
  private deathMusicPending(n: number): boolean {
    const d = this.state[n];
    if (this.w.playback || d.deathMusic === 0) return false;
    if (this.w.snd.ackReady(d.deathMusic)) {
      d.deathMusic = 0;
      return false;
    }
    return true;
  }

  anyDeathMusicPending(): boolean {
    if (this.w.playback) return false;
    return this.deathMusicPending(this.cur);
  }

  /** Hit by a bag (stage Bag) or a monster (stage Monster). */
  kill(n: number, stage: Death, bag: number): void {
    const d = this.state[n];
    if (d.deathStage < Death.Grave || d.deathStage > Death.Tombstone) {
      d.alive = false;
      d.deathStage = stage;
      d.deathBag = bag;
    }
  }

  /** Is the digger moving vertically within cell column h, rows v-1..v? (keeps bags up) */
  underBag(h: number, v: number): boolean {
    const d = this.state[this.cur];
    if (!d.alive || (d.mdir !== Dir.Up && d.mdir !== Dir.Down)) return false;
    if (Math.trunc((d.x - 12) / 20) !== h) return false;
    const row = Math.trunc((d.y - 18) / 18);
    return row === v || row + 1 === v;
  }

  /** Digger that touches sprite slot `slot` (always the current player's). */
  indexOf(slot: number): number {
    return slot - SLOT_DIGGER + this.cur;
  }

  resetBagTime(n: number): void {
    this.state[n].bagtime = 0;
  }
}
