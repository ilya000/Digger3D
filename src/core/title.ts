import { Dir } from "../contracts";
import { MonsterBody } from "./monsters";
import { SLOT_BAG, SLOT_DIGGER, SLOT_FIREBALL, SLOT_MONSTER } from "./sprites";
import type { World } from "./world";

/** One step of the attract animation on the title screen. */
interface Action {
  /** Frame (or first and last frame of a range) at which it happens. */
  at: number;
  to?: number;
  run: (t: TitleAnimation, frame: number) => void;
}

const NOBBIN = 0;
const HOBBIN = 1;

/**
 * The attract sequence of the title screen: a Nobbin, a Hobbin and the Digger
 * walk in from the right and are named, then gold, an emerald and the bonus
 * appear and the Digger shoots the monsters. One cycle is 287 frames.
 */
export class TitleAnimation {
  private nobbin: MonsterBody | null = null;
  private hobbin: MonsterBody | null = null;
  private digger = { x: 0, y: 0, dir: Dir.Left, canFire: true, active: false, spawn: -1 };
  private bullet = { x: 0, y: 0, dir: Dir.Up, expsn: 0, active: false, spawn: -1 };
  private nobbinSpawn = -1;
  private hobbinSpawn = -1;

  private readonly script: Action[] = [
    { at: 0, run: (t) => t.clearText() },
    { at: 50, run: (t, f) => t.spawnMonster(NOBBIN, 292, 63, f) },
    { at: 51, to: 77, run: (t) => t.moveMonster(NOBBIN, -4, 0) },
    { at: 78, run: (t) => t.turnMonster(NOBBIN, Dir.Right) },
    { at: 83, run: (t) => t.w.text("NOBBIN", 216, 64, 2) },
    { at: 90, run: (t, f) => t.spawnMonster(HOBBIN, 292, 82, f) },
    { at: 91, to: 117, run: (t) => t.moveMonster(HOBBIN, -4, 0) },
    { at: 100, run: (t) => t.mutate(HOBBIN) },
    { at: 118, run: (t) => t.turnMonster(HOBBIN, Dir.Right) },
    { at: 123, run: (t) => t.w.text("HOBBIN", 216, 83, 2) },
    { at: 130, run: (t, f) => t.spawnDigger(292, 101, Dir.Left, f) },
    { at: 131, to: 157, run: (t) => t.moveDigger(-4, 0) },
    { at: 163, run: (t) => t.w.text("DIGGER", 216, 102, 2) },
    { at: 166, run: (t) => t.turnDigger(Dir.Right) },
    { at: 228, run: (t) => t.turnDigger(Dir.Up) },
    { at: 178, run: (t) => t.drawGold(184, 120) },
    { at: 183, run: (t) => t.w.text("GOLD", 216, 121, 2) },
    { at: 198, run: (t) => t.w.drawEmerald(184, 141) },
    { at: 203, run: (t) => t.w.text("EMERALD", 216, 140, 2) },
    { at: 218, run: (t) => t.w.drawBonusSprite(184, 158) },
    { at: 223, run: (t) => t.w.text("BONUS", 216, 159, 2) },
    { at: 232, run: (t) => t.discharge() },
    { at: 232, run: (t, f) => t.fireBullet(f) },
    { at: 233, to: 237, run: (t) => t.moveBullet(0, -4) },
    { at: 237, run: (t) => t.killMonster(HOBBIN) },
    { at: 238, run: (t) => t.explodeBullet() },
    { at: 243, run: (t) => t.removeBullet() },
    { at: 247, run: (t) => t.recharge() },
    { at: 251, run: (t) => t.discharge() },
    { at: 251, run: (t, f) => t.fireBullet(f) },
    { at: 252, to: 260, run: (t) => t.moveBullet(0, -4) },
    { at: 260, run: (t) => t.killMonster(NOBBIN) },
    { at: 261, run: (t) => t.explodeBullet() },
    { at: 266, run: (t) => t.removeBullet() },
    { at: 270, run: (t) => t.recharge() },
    { at: 274, run: (t) => t.turnDigger(Dir.Right) },
  ];

  static readonly LAST_FRAME = 286;

  constructor(readonly w: World) {}

  step(frame: number): void {
    if (frame === 0) this.reset();
    for (const a of this.script) if (frame >= a.at && frame <= (a.to ?? a.at)) a.run(this, frame);
    if (this.nobbin && frame > this.nobbinSpawn) this.nobbin.animate();
    if (this.hobbin && frame > this.hobbinSpawn) this.hobbin.animate();
    if (this.digger.active && frame > this.digger.spawn)
      this.w.drawDiggerSprite(0, this.digger.dir, this.digger.x, this.digger.y, this.digger.canFire);
    if (this.bullet.active && frame > this.bullet.spawn && this.bullet.expsn < 4) {
      this.w.drawFireSprite(0, this.bullet.x, this.bullet.y, this.bullet.expsn);
      if (this.bullet.expsn > 0) this.bullet.expsn++;
    }
  }

  /** Takes the animated objects off the screen. */
  reset(): void {
    this.removeBullet();
    if (this.digger.active) {
      this.w.sprites.erase(SLOT_DIGGER);
      this.digger.active = false;
    }
    if (this.nobbin) {
      this.w.sprites.erase(SLOT_MONSTER);
      this.nobbin = null;
    }
    if (this.hobbin) {
      this.w.sprites.erase(SLOT_MONSTER + 1);
      this.hobbin = null;
    }
    this.nobbinSpawn = -1;
    this.hobbinSpawn = -1;
    this.digger.spawn = -1;
    this.bullet.spawn = -1;
  }

  private body(id: number): MonsterBody | null {
    return id === NOBBIN ? this.nobbin : this.hobbin;
  }

  private clearText(): void {
    for (let y = 54; y < 174; y += 12) this.w.eraseText(12, 164, y, 0);
  }

  private spawnMonster(id: number, x: number, y: number, frame: number): void {
    if (this.body(id)) return;
    const m = new MonsterBody(this.w, id, true, Dir.Left, x, y);
    if (id === NOBBIN) {
      this.nobbin = m;
      this.nobbinSpawn = frame;
    } else {
      this.hobbin = m;
      this.hobbinSpawn = frame;
    }
    m.put();
  }

  private moveMonster(id: number, dx: number, dy: number): void {
    const m = this.body(id);
    if (!m) return;
    m.x += dx;
    m.y += dy;
  }

  private turnMonster(id: number, dir: Dir): void {
    const m = this.body(id);
    if (m) m.dir = dir;
  }

  private mutate(id: number): void {
    this.body(id)?.mutate();
  }

  private killMonster(id: number): void {
    this.body(id)?.kill();
  }

  private spawnDigger(x: number, y: number, dir: Dir, frame: number): void {
    this.digger = { x, y, dir, canFire: true, active: true, spawn: frame };
    this.w.sprites.place(SLOT_DIGGER, x, y);
  }

  private moveDigger(dx: number, dy: number): void {
    if (!this.digger.active) return;
    this.digger.x += dx;
    this.digger.y += dy;
  }

  private turnDigger(dir: Dir): void {
    if (this.digger.active) this.digger.dir = dir;
  }

  private discharge(): void {
    if (this.digger.active && this.digger.canFire) this.digger.canFire = false;
  }

  private recharge(): void {
    if (this.digger.active && !this.digger.canFire) this.digger.canFire = true;
  }

  private fireBullet(frame: number): void {
    if (!this.digger.active) return;
    this.removeBullet();
    this.bullet = { x: this.digger.x + 4, y: this.digger.y, dir: Dir.Up, expsn: 0, active: true, spawn: frame };
    this.w.sprites.place(SLOT_FIREBALL, this.bullet.x, this.bullet.y);
  }

  private moveBullet(dx: number, dy: number): void {
    if (!this.bullet.active || this.bullet.expsn !== 0) return;
    this.bullet.x += dx;
    this.bullet.y += dy;
  }

  private explodeBullet(): void {
    if (this.bullet.active && this.bullet.expsn === 0) this.bullet.expsn = 1;
  }

  private removeBullet(): void {
    if (!this.bullet.active) return;
    this.w.sprites.erase(SLOT_FIREBALL);
    this.bullet.expsn = 0;
    this.bullet.active = false;
    this.bullet.spawn = -1;
  }

  private drawGold(x: number, y: number): void {
    this.w.sprites.place(SLOT_BAG, x, y);
    this.w.drawBagSprite(0, 0, x, y);
  }
}
