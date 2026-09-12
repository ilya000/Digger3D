import { FIELD_COLS, FIELD_ROWS, type BagState, type DiggerState, type FireballState, type GameView, type MonsterState } from "../contracts";
import { Death, type DiggerState as CoreDigger } from "./digger";
import type { World } from "./world";

/**
 * Which image of the rising tombstone is on the screen, or -1 while the digger
 * itself is shown. The core draws grave[deathAni] and then advances deathAni,
 * so the stage on the screen is one behind.
 */
function graveStage(d: CoreDigger): number {
  if (d.alive) return -1;
  if (d.deathStage === Death.Tombstone) return 4;
  if (d.deathStage === Death.Grave) return d.deathAni - 1;
  return -1;
}

/** Builds the read-only snapshot the 3D view reads, reusing its arrays. */
export class ViewBuilder {
  private readonly emeralds = new Uint8Array(FIELD_COLS * FIELD_ROWS);
  private readonly diggers: DiggerState[] = [];
  private readonly monsters: MonsterState[] = [];
  private readonly bags: BagState[] = [];
  private readonly fireballs: FireballState[] = [];
  private readonly bonus = { visible: false, x: 0, y: 0 };
  readonly view: GameView;
  private frame = 0;

  constructor(private readonly w: World) {
    this.view = {
      frame: 0,
      inLevel: false,
      level: 1,
      levelPlan: 1,
      bonusMode: false,
      tunnels: w.screen.dug,
      tunnelsVersion: 0,
      emeralds: this.emeralds,
      diggers: this.diggers,
      monsters: this.monsters,
      bags: this.bags,
      fireballs: this.fireballs,
      bonus: this.bonus,
      players: 1,
      currentPlayer: 0,
      scores: [0, 0],
      lives: [0, 0],
      paused: false,
    } as GameView;
  }

  update(frame: number): void {
    const w = this.w;
    const v = this.view as {
      -readonly [K in keyof GameView]: GameView[K];
    };
    this.frame = frame;
    v.frame = frame;
    v.inLevel = w.inGame && w.levelOnScreen;
    v.level = w.level[w.curPlayer];
    v.levelPlan = w.levelPlan();
    v.bonusMode = w.bonusMode;
    v.tunnelsVersion = w.screen.dugVersion;
    v.players = w.nPlayers;
    v.currentPlayer = w.curPlayer;
    v.scores = [w.scores.score[0], w.scores.score[1]];
    v.lives = [w.digger.lives(0), w.digger.lives(1)];
    v.paused = w.paused;

    const mask = 1 << w.curPlayer;
    for (let i = 0; i < this.emeralds.length; i++) this.emeralds[i] = w.emeralds[i] & mask ? 1 : 0;

    this.diggers.length = 0;
    if (v.inLevel && w.diggerVisible) {
      const d = w.digger.state[w.curPlayer];
      this.diggers.push({
        x: d.x,
        y: d.y,
        dir: d.dir,
        alive: d.alive,
        deathTime: d.alive ? 0 : d.deathFrames,
        graveStage: graveStage(d),
        anim: w.diggerFrame(0),
        canFire: d.canFire,
      });
    }

    this.monsters.length = 0;
    for (const m of w.monsters.slots) {
      if (!m.active || !m.body) continue;
      this.monsters.push({
        x: m.body.x,
        y: m.body.y,
        dir: m.dir,
        alive: m.body.alive,
        nobbin: m.body.nobbin,
        dying: m.body.zombie,
      });
    }

    this.bags.length = 0;
    for (const b of w.bags.bags) {
      if (!b.exist) continue;
      this.bags.push({
        x: b.x,
        y: b.y,
        wobbling: b.wobbling,
        falling: b.dir === 6,
        gold: b.gt > 0,
        goldTime: b.gt,
      });
    }

    this.fireballs.length = 0;
    const dig = w.digger.state[w.curPlayer];
    if (!dig.notFiring) this.fireballs.push({ x: dig.fire.x, y: dig.fire.y, exploding: dig.fire.expsn > 0 });

    this.bonus.visible = w.bonusVisible;
    this.bonus.x = 292;
    this.bonus.y = 18;
  }
}
