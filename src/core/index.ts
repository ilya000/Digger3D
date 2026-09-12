import type { GameView, InputSource, Screen, SoundEvent } from "../contracts";
import type { AssetBundle } from "../assets/types";
import { mainProgram } from "./program";
import { ViewBuilder } from "./view";
import { World, type Flow, type PlaybackSource, type WorldOptions } from "./world";
import type { HighScoreEntry, HighScoreStorage } from "./scores";

export type { PlaybackSource } from "./world";
export type { HighScoreEntry, HighScoreStorage } from "./scores";
export type { SoundName } from "./soundNames";
export { SOUND_NAMES } from "./soundNames";
export { KEYS } from "./keyboard";

export interface GameOptions extends WorldOptions {
  /**
   * Who decides when the sounds the game waits for (level jingle, dirge) end:
   * "internal" (default) models the original's timing, "external" waits for
   * `Game.soundFinished` from the sound engine.
   */
  soundTiming?: "internal" | "external";
  /** Testing hook: called whenever the game lets time pass (see Game.step). */
  onTimePoint?: (t: number, mult: number) => void;
  /** Testing: keep a compact log of the sound commands. */
  traceSound?: boolean;
}

export interface Game {
  /** Advances the simulation by exactly one frame period. */
  step(input: InputSource): void;
  readonly screen: Screen;
  readonly view: GameView;
  drainSoundEvents(): SoundEvent[];
  /** Length of one frame in milliseconds (the speed keys change it). */
  readonly framePeriodMs: number;
  /** The sound engine reports that a sound the game waits for has finished. */
  soundFinished(which: "levelDone" | "dirge"): void;
  /**
   * Re-reads the high-score table from storage and, if the title screen is on,
   * redraws it - a table shared with other players changes by itself.
   */
  refreshHighScores(): void;
  /** Internal state, for tests and debugging. */
  inspect(): CoreState;
}

/** Snapshot of the simulation used by the tests to compare against the reference. */
export interface CoreState {
  inGame: boolean;
  curPlayer: number;
  level: readonly [number, number];
  score: readonly [number, number];
  lives: readonly [number, number];
  randv: number;
  palette: number;
  intensity: number;
  digger: {
    x: number;
    y: number;
    dir: number;
    mdir: number;
    alive: boolean;
    deathStage: number;
    deathTime: number;
    deathAni: number;
    bagtime: number;
    rechargeTime: number;
    notFiring: boolean;
    emeraldRun: number;
    emeraldTime: number;
    msc: number;
    canFire: boolean;
  };
  fire: { x: number; y: number; dir: number; expsn: number } | null;
  bonus: { visible: boolean; mode: boolean; timeLeft: number; startTimeLeft: number };
  monsters: {
    next: number;
    total: number;
    nextTime: number;
    unbonus: boolean;
    slots: ({ x: number; y: number; dir: number; faces: number; nobbin: boolean; alive: boolean; hnt: number; t: number; stime: number; death: number } | null)[];
  };
  bags: {
    pushCount: number;
    goldTime: number;
    list: ({ x: number; y: number; dir: number; wobbling: boolean; wt: number; gt: number; fallh: number; unfallen: boolean } | null)[];
  };
  field: Uint16Array;
  emeralds: Uint8Array;
  pixels: Uint8Array;
  sound: string[];
}

class DiggerGame implements Game {
  private readonly world: World;
  private readonly flow: Flow;
  private readonly viewBuilder: ViewBuilder;
  private budget = 0;
  private waiting = false;
  private finished = false;
  private frame = 0;
  private timePoint = 0;

  constructor(
    assets: AssetBundle,
    private readonly opts: GameOptions,
  ) {
    this.world = new World(assets, { ...opts, externalSoundTiming: opts.soundTiming === "external" });
    if (opts.traceSound) this.world.snd.traceLog = [];
    this.viewBuilder = new ViewBuilder(this.world);
    // Power-up: clear screen, palette 0, start the sound device (one tick).
    this.world.screen.clear();
    this.world.screen.setPalette(0);
    this.world.snd.start();
    this.flow = mainProgram(this.world);
    this.viewBuilder.update(0);
  }

  get screen(): Screen {
    return this.world.screen;
  }

  get view(): GameView {
    return this.viewBuilder.view;
  }

  get framePeriodMs(): number {
    return this.world.framePeriodUs / 1000;
  }

  drainSoundEvents(): SoundEvent[] {
    return this.world.snd.drain();
  }

  soundFinished(which: "levelDone" | "dirge"): void {
    this.world.snd.externalFinished(which);
  }

  refreshHighScores(): void {
    this.world.scores.loadTable();
    if (!this.world.inGame) this.world.scores.showTable();
  }

  step(input: InputSource): void {
    this.frame++;
    this.budget += 3;
    while (this.budget > 0 && !this.finished) {
      if (this.waiting) {
        this.world.keys.pump(input);
        this.waiting = false;
      }
      const r = this.flow.next();
      if (r.done) {
        this.finished = true;
        break;
      }
      const mult = r.value;
      this.opts.onTimePoint?.(this.timePoint++, mult);
      this.world.snd.advance(this.world.framePeriodUs, mult);
      this.waiting = true;
      this.budget -= 3 / mult;
    }
    this.viewBuilder.update(this.frame);
  }

  inspect(): CoreState {
    const w = this.world;
    const d = w.digger.state[w.curPlayer];
    const sound = w.snd.traceLog ?? [];
    const state: CoreState = {
      inGame: w.inGame,
      curPlayer: w.curPlayer,
      level: [w.level[0], w.nPlayers === 2 ? w.level[1] : -1],
      score: [w.scores.score[0], w.scores.score[1]],
      lives: [w.digger.lives(0), w.digger.lives(1)],
      randv: w.rng.seed,
      palette: w.screen.paletteIndex,
      intensity: w.screen.intensity,
      digger: {
        x: d.x,
        y: d.y,
        dir: d.dir,
        mdir: d.mdir,
        alive: d.alive,
        deathStage: d.deathStage,
        deathTime: d.deathTime,
        deathAni: d.deathAni,
        bagtime: d.bagtime,
        rechargeTime: d.rechargeTime,
        notFiring: d.notFiring,
        emeraldRun: d.emeraldRun,
        emeraldTime: d.emeraldTime,
        msc: d.msc,
        canFire: d.canFire,
      },
      fire: d.notFiring ? null : { x: d.fire.x, y: d.fire.y, dir: d.fire.dir, expsn: d.fire.expsn },
      bonus: {
        visible: w.bonusVisible,
        mode: w.bonusMode,
        timeLeft: w.bonusTimeLeft,
        startTimeLeft: w.startBonusTimeLeft,
      },
      monsters: {
        next: w.monsters.nextMonster,
        total: w.monsters.totalMonsters,
        nextTime: w.monsters.nextMonTime,
        unbonus: w.monsters.unbonusFlag,
        slots: w.monsters.slots.map((m) =>
          m.active && m.body
            ? {
                x: m.body.x,
                y: m.body.y,
                dir: m.dir,
                faces: m.body.dir,
                nobbin: m.body.nobbin,
                alive: m.body.alive,
                hnt: m.hnt,
                t: m.t,
                stime: m.stime,
                death: m.death,
              }
            : null,
        ),
      },
      bags: {
        pushCount: w.bags.pushCount,
        goldTime: w.bags.goldTime,
        list: w.bags.bags.map((b) =>
          b.exist
            ? { x: b.x, y: b.y, dir: b.dir, wobbling: b.wobbling, wt: b.wt, gt: b.gt, fallh: b.fallh, unfallen: b.unfallen }
            : null,
        ),
      },
      field: w.field.cells,
      emeralds: w.emeralds,
      pixels: w.screen.pixels,
      sound: sound.slice(),
    };
    sound.length = 0;
    return state;
  }
}

/** Creates the game core. `assets` comes from src/assets (original or stand-in). */
export function createGame(assets: AssetBundle, opts: GameOptions = {}): Game {
  return new DiggerGame(assets, opts);
}

export type { HighScoreEntry as CoreHighScoreEntry, HighScoreStorage as CoreHighScoreStorage, PlaybackSource as CorePlaybackSource };
