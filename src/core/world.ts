import { Dir, FIELD_COLS, FIELD_ROWS, type SpriteImage } from "../contracts";
import type { AssetBundle, LevelMap } from "../assets/types";
import { CgaScreen } from "./cga";
import { SpriteLayer, SLOT_BAG, SLOT_BONUS, SLOT_DIGGER, SLOT_FIREBALL, SLOT_MONSTER } from "./sprites";
import { Field } from "./field";
import { Rng } from "./rng";
import { Cmd, SoundOut, Tune } from "./sound";
import { Keyboard } from "./keyboard";
import { DiggerLogic } from "./digger";
import { Monsters } from "./monsters";
import { Bags } from "./bags";
import { Scores, type HighScoreStorage } from "./scores";

/**
 * Game flows are generators. They yield whenever the original lets time pass:
 * the yielded number is the fraction of a frame period (1 = a whole frame,
 * 3 = a third, used while the level is being drawn).
 */
export type Flow<T = void> = Generator<number, T, void>;
export const WHOLE_FRAME = 1;
export const THIRD_FRAME = 3;

/** Replay of a recorded game (used by the tests to run Digger Remastered recordings). */
export interface PlaybackSource {
  readonly players: 1 | 2;
  readonly startLevel: number;
  readonly bonusScore: number;
  readonly levels?: readonly LevelMap[];
  /** Random seed stored at the start of each life. */
  nextSeed(): number;
  /** Controls of the next frame, or null when the recording ends. */
  nextControl(): { dir: Dir; fire: boolean } | null;
  /** A life ended (the recording has a separator there). */
  endOfLife(): void;
}

export interface WorldOptions {
  storage?: HighScoreStorage;
  /**
   * Colours of the title screen. "original" (the default) is what the 1983 game
   * shows: CGA palette 1 at high intensity - white text, light magenta boxes,
   * light cyan scores (assets/original/screenshots). "reference" leaves the
   * palette as it is, which is what the Remastered reference does in CGA mode
   * (its own title screen is a VGA picture, so it never switches the palette);
   * the differential tests select it so that the comparison stays literal.
   */
  titlePalette?: "original" | "reference";
  externalSoundTiming?: boolean;
  seed?: () => number;
  startLevel?: number;
  playback?: PlaybackSource;
}

/** Everything the simulation shares: screen, sprites, level state and the game's objects. */
export class World {
  readonly screen: CgaScreen;
  readonly sprites: SpriteLayer;
  readonly field = new Field();
  readonly rng = new Rng();
  readonly snd: SoundOut;
  readonly keys: Keyboard;
  readonly digger: DiggerLogic;
  readonly monsters: Monsters;
  readonly bags: Bags;
  readonly scores: Scores;
  readonly levels: readonly LevelMap[];
  readonly playback: PlaybackSource | null;
  private readonly seed: () => number;
  /** The empty digger image the digger sprite starts with each life (drawn for one frame). */
  readonly blankDigger: SpriteImage;

  nPlayers = 1;
  curPlayer = 0;
  /** See WorldOptions.titlePalette. */
  readonly originalTitlePalette: boolean;
  startLevel: number;
  readonly level = [0, 0];
  readonly levDone = [false, false];
  penalty = 0;
  allDead = false;
  levNotDrawn = false;
  inGame = false;
  levelOnScreen = false;
  paused = false;
  framePeriodUs = 80000;

  bonusVisible = false;
  bonusMode = false;
  bonusTimeLeft = 0;
  startBonusTimeLeft = 0;
  diggerVisible = false;
  /** Emeralds, one bit per player (bit 0 = player 1). */
  readonly emeralds = new Uint8Array(FIELD_COLS * FIELD_ROWS);

  /** Animation phase of the digger and fireball sprites (per digger). */
  private readonly digAnim = [0, 0];
  private readonly digAnimStep = [1, 1];
  private readonly fireAnim = [0, 0];

  constructor(
    readonly assets: AssetBundle,
    opts: WorldOptions,
  ) {
    this.screen = new CgaScreen(assets);
    this.sprites = new SpriteLayer(this.screen);
    this.snd = new SoundOut(opts.externalSoundTiming === true);
    this.keys = new Keyboard({
      speedUp: () => {
        if (this.framePeriodUs > 10000) this.framePeriodUs -= 10000;
      },
      slowDown: () => {
        this.framePeriodUs += 10000;
      },
      toggleMusic: () => this.snd.post(Cmd.MusicToggle),
      toggleSound: () => this.snd.post(Cmd.SoundToggle),
    });
    this.originalTitlePalette = opts.titlePalette !== "reference";
    this.playback = opts.playback ?? null;
    this.levels = this.playback?.levels ?? assets.levels;
    this.seed = opts.seed ?? (() => 0);
    this.startLevel = this.playback?.startLevel ?? opts.startLevel ?? 1;
    this.digger = new DiggerLogic(this);
    this.monsters = new Monsters(this);
    this.bags = new Bags(this);
    this.scores = new Scores(this, opts.storage ?? null);
    if (this.playback) this.scores.bonusScore = this.playback.bonusScore;
    const bonus = assets.sprites.bonus;
    this.blankDigger = { w: bonus.w, h: bonus.h, color: new Uint8Array(bonus.w * bonus.h), opaque: bonus.opaque };
  }

  // ------------------------------------------------------------------ time

  /** A game frame: wait, read the keyboard, advance the frame counter. */
  *newFrame(): Flow {
    yield WHOLE_FRAME;
    this.keys.poll();
    if (this.digger.anyDeathMusicPending()) return;
    this.keys.advanceFire();
  }

  /** The short pause between the cells drawn when a level appears. */
  *redrawDelay(): Flow {
    yield THIRD_FRAME;
  }

  /** Waits for a key press and returns its code. */
  *waitKey(): Flow<string> {
    while (!this.keys.hasKey()) yield WHOLE_FRAME;
    return this.keys.takeKey()!;
  }

  newSeed(): number {
    return this.playback ? this.playback.nextSeed() : this.seed();
  }

  // ------------------------------------------------------------------ level

  /** Difficulty level: the level number, capped at 10. */
  levof10(): number {
    const l = this.level[this.curPlayer];
    return l > 10 ? 10 : l;
  }

  /** Map used for the current level: 1-8, then 6,7,8 and 5-8 repeating. */
  levelPlan(): number {
    const l = this.level[this.curPlayer];
    return l > 8 ? (l & 3) + 5 : l;
  }

  levelChar(x: number, y: number): string {
    const map = this.levels[this.levelPlan() - 1];
    // Level 0 happens for the second player of a one-player game, which the
    // original also sets up (with an empty map) before the game begins.
    return map === undefined ? " " : map[y][x];
  }

  incPenalty(): void {
    this.penalty++;
  }

  /** An object digs the next step of the tunnel (counts towards the frame's workload). */
  eatField(x: number, y: number, dir: Dir): void {
    this.penalty++;
    this.field.eat(x, y, dir);
  }

  initLevel(): void {
    this.levDone[this.curPlayer] = false;
    this.field.build((x, y) => this.levelChar(x, y), this.curPlayer);
    this.makeEmeralds();
    this.bags.init();
    this.levNotDrawn = true;
  }

  checkLevelDone(): void {
    this.levDone[this.curPlayer] = (this.countEmeralds() === 0 || this.monsters.left() === 0) && this.digger.isAlive();
  }

  // ------------------------------------------------------------------ sprites

  /** Sets up the sprite slots at the start of a screen (creatembspr). */
  createSprites(): void {
    const s = this.assets.sprites;
    for (let i = 0; i < 7; i++) this.sprites.create(SLOT_BAG + i, s.bag);
    for (let i = 0; i < 6; i++) this.sprites.create(SLOT_MONSTER + i, s.nobbin[2]);
    this.resetDiggerAnims();
    for (let i = 0; i < 2; i++) this.sprites.create(SLOT_DIGGER + i, this.blankDigger);
    this.sprites.create(SLOT_BONUS, s.bonus);
    for (let i = 0; i < 2; i++) this.sprites.create(SLOT_FIREBALL + i, s.fireball[0]);
  }

  /** Resets the images the sprites start with (start of a life on a drawn screen). */
  initSprites(): void {
    const s = this.assets.sprites;
    for (let i = 0; i < 7; i++) this.sprites.setNext(SLOT_BAG + i, s.bag);
    for (let i = 0; i < 6; i++) this.sprites.setNext(SLOT_MONSTER + i, s.nobbin[2]);
    this.resetDiggerAnims();
    for (let i = 0; i < 2; i++) this.sprites.setNext(SLOT_DIGGER + i, this.blankDigger);
    this.sprites.setNext(SLOT_BONUS, s.bonus);
    for (let i = 0; i < 2; i++) this.sprites.setNext(SLOT_FIREBALL + i, s.fireball[0]);
  }

  private resetDiggerAnims(): void {
    this.digAnim[0] = this.digAnim[1] = 0;
    this.digAnimStep[0] = this.digAnimStep[1] = 1;
    this.fireAnim[0] = this.fireAnim[1] = 0;
  }

  /**
   * Draws digger `n` facing `t` (a direction, or 10-15 for the death images).
   * Anything else draws nothing and clears the collision result.
   */
  drawDiggerSprite(n: number, t: number, x: number, y: number, canFire: boolean): void {
    this.digAnim[n] += this.digAnimStep[n];
    if (this.digAnim[n] === 2 || this.digAnim[n] === 0) this.digAnimStep[n] = -this.digAnimStep[n];
    if (this.digAnim[n] > 2) this.digAnim[n] = 2;
    if (this.digAnim[n] < 0) this.digAnim[n] = 0;
    const d = this.assets.sprites.digger;
    let img: SpriteImage | null = null;
    const a = this.digAnim[n];
    switch (t) {
      case Dir.Right:
        img = (canFire ? d.right : d.rightReloading)[a];
        break;
      case Dir.Up:
        img = (canFire ? d.up : d.upReloading)[a];
        break;
      case Dir.Left:
        img = (canFire ? d.left : d.leftReloading)[a];
        break;
      case Dir.Down:
        img = (canFire ? d.down : d.downReloading)[a];
        break;
      default:
        if (t >= 10 && t <= 15) img = t === 15 ? d.dead : d.grave[14 - t];
    }
    if (img === null) {
      this.sprites.clearHits();
      return;
    }
    this.sprites.setNext(SLOT_DIGGER + n, img);
    this.sprites.draw(SLOT_DIGGER + n, x, y);
  }

  /** Draws fireball `n`: flying (stage 0, animated) or exploding (stages 1-3). */
  drawFireSprite(n: number, x: number, y: number, stage: number): void {
    const s = this.assets.sprites;
    let img: SpriteImage;
    if (stage === 0) {
      this.fireAnim[n]++;
      if (this.fireAnim[n] > 2) this.fireAnim[n] = 0;
      img = s.fireball[this.fireAnim[n]];
    } else img = s.explosion[stage - 1];
    this.sprites.setNext(SLOT_FIREBALL + n, img);
    this.sprites.draw(SLOT_FIREBALL + n, x, y);
  }

  /** Bag images: 0 rest, 1 leaning right, 2 leaning left, 3 falling, 4-6 breaking. */
  drawBagSprite(bag: number, t: number, x: number, y: number): void {
    const s = this.assets.sprites;
    const img = [s.bag, s.bagRight, s.bagLeft, s.bagFalling, s.gold[0], s.gold[1], s.gold[2]][t];
    this.sprites.setNext(SLOT_BAG + bag, img);
    this.sprites.draw(SLOT_BAG + bag, x, y);
  }

  drawBonusSprite(x: number, y: number): void {
    this.sprites.setNext(SLOT_BONUS, this.assets.sprites.bonus);
    this.sprites.place(SLOT_BONUS, x, y);
  }

  // ------------------------------------------------------------------ ground

  private ground(x: number, y: number, img: SpriteImage, cut: boolean): void {
    this.sprites.drawGround(x, y, img, cut);
  }

  /** Tunnel cuts relative to an object at (x, y). */
  rightBlob(x: number, y: number): void {
    this.ground(x + 16, y - 1, this.assets.sprites.blobs.right, true);
  }
  leftBlob(x: number, y: number): void {
    this.ground(x - 8, y - 1, this.assets.sprites.blobs.left, true);
  }
  topBlob(x: number, y: number): void {
    this.ground(x - 4, y - 6, this.assets.sprites.blobs.top, true);
  }
  bottomBlob(x: number, y: number): void {
    this.ground(x - 4, y + 15, this.assets.sprites.blobs.bottom, true);
  }
  furryBlob(x: number, y: number): void {
    this.ground(x - 4, y + 15, this.assets.sprites.blobs.furry, true);
  }
  squareBlob(x: number, y: number): void {
    this.ground(x - 4, y + 17, this.assets.sprites.blobs.square, true);
  }
  drawEmerald(x: number, y: number): void {
    this.ground(x, y, this.assets.sprites.emerald, false);
  }
  eraseEmerald(x: number, y: number): void {
    this.ground(x, y, this.assets.sprites.emeraldHole, true);
  }

  /** Fills the playfield with the level's earth pattern. */
  drawBackground(plan: number): void {
    const tile = this.assets.sprites.earth[plan - 1];
    for (let y = 14; y < 200; y += 4) for (let x = 0; x < 320; x += 20) this.screen.blitGround(x, y, tile, false);
  }

  /** Cuts the tunnels recorded in the field map (the level appearing, cell by cell). */
  *drawField(): Flow {
    const f = this.field.cells;
    for (let x = 0; x < FIELD_COLS; x++)
      for (let y = 0; y < FIELD_ROWS; y++) {
        const i = y * FIELD_COLS + x;
        if ((f[i] & 0x2000) !== 0) continue;
        const xp = x * 20 + 12;
        const yp = y * 18 + 18;
        if ((f[i] & 0xfc0) !== 0xfc0) {
          f[i] &= 0xd03f;
          this.bottomBlob(xp, yp - 15);
          this.bottomBlob(xp, yp - 12);
          this.bottomBlob(xp, yp - 9);
          this.bottomBlob(xp, yp - 6);
          this.bottomBlob(xp, yp - 3);
          this.topBlob(xp, yp + 3);
        }
        if ((f[i] & 0x1f) !== 0x1f) {
          f[i] &= 0xdfe0;
          this.rightBlob(xp - 16, yp);
          this.rightBlob(xp - 12, yp);
          this.rightBlob(xp - 8, yp);
          this.rightBlob(xp - 4, yp);
          this.leftBlob(xp + 4, yp);
        }
        if (x < 14 && (f[i + 1] & 0xfdf) !== 0xfdf) this.rightBlob(xp, yp);
        if (y < 9 && (f[i + FIELD_COLS] & 0xfdf) !== 0xfdf) this.bottomBlob(xp, yp);
        yield* this.redrawDelay();
      }
  }

  // ------------------------------------------------------------------ emeralds

  private get emMask(): number {
    return 1 << this.curPlayer;
  }

  makeEmeralds(): void {
    const m = this.emMask;
    for (let x = 0; x < FIELD_COLS; x++)
      for (let y = 0; y < FIELD_ROWS; y++) {
        const i = y * FIELD_COLS + x;
        if (this.levelChar(x, y) === "C") this.emeralds[i] |= m;
        else this.emeralds[i] &= ~m;
      }
  }

  *drawEmeralds(): Flow {
    const m = this.emMask;
    for (let x = 0; x < FIELD_COLS; x++)
      for (let y = 0; y < FIELD_ROWS; y++)
        if (this.emeralds[y * FIELD_COLS + x] & m) {
          this.drawEmerald(x * 20 + 12, y * 18 + 21);
          yield* this.redrawDelay();
        }
  }

  hasEmerald(col: number, row: number): boolean {
    return (this.emeralds[row * FIELD_COLS + col] & this.emMask) !== 0;
  }

  countEmeralds(): number {
    let n = 0;
    const m = this.emMask;
    for (let i = 0; i < this.emeralds.length; i++) if (this.emeralds[i] & m) n++;
    return n;
  }

  /**
   * An object moving in `dir` is at offset (rx, ry) of cell (x, y). Emeralds are
   * redrawn when an object gets close and eaten when it gets closer still.
   */
  hitEmerald(x: number, y: number, rx: number, ry: number, dir: Dir): boolean {
    if (dir !== Dir.Right && dir !== Dir.Up && dir !== Dir.Left && dir !== Dir.Down) return false;
    if (dir === Dir.Right && rx !== 0) x++;
    if (dir === Dir.Down && ry !== 0) y++;
    const r = dir === Dir.Right || dir === Dir.Left ? rx : ry;
    const i = y * FIELD_COLS + x;
    let hit = false;
    if (this.emeralds[i] & this.emMask) {
      if (r === EMERALD_DRAW[dir]) {
        this.drawEmerald(x * 20 + 12, y * 18 + 21);
        this.incPenalty();
      }
      if (r === EMERALD_EAT[dir]) {
        this.eraseEmerald(x * 20 + 12, y * 18 + 21);
        this.incPenalty();
        hit = true;
        this.emeralds[i] &= ~this.emMask;
      }
    }
    return hit;
  }

  /** A bag falls into the cell below (x, y): an emerald there is destroyed. */
  killEmerald(x: number, y: number): void {
    const i = (y + 1) * FIELD_COLS + x;
    if (this.emeralds[i] & this.emMask) {
      this.emeralds[i] &= ~this.emMask;
      this.eraseEmerald(x * 20 + 12, (y + 1) * 18 + 21);
    }
  }

  // ------------------------------------------------------------------ bonus

  createBonus(): void {
    this.bonusVisible = true;
    this.drawBonusSprite(292, 18);
  }

  initBonusMode(): void {
    this.bonusMode = true;
    this.eraseBonus();
    this.screen.setIntensity(1);
    this.bonusTimeLeft = 250 - this.levof10() * 20;
    this.startBonusTimeLeft = 20;
    this.digger.state[0].msc = 1;
  }

  endBonusMode(): void {
    this.bonusMode = false;
    this.screen.setIntensity(0);
  }

  eraseBonus(): void {
    if (this.bonusVisible) {
      this.bonusVisible = false;
      this.sprites.erase(SLOT_BONUS);
    }
    this.screen.setIntensity(0);
  }

  /** Bonus-mode clock, run once per frame after the diggers. */
  updateBonusMode(): void {
    if (this.bonusMode && this.digger.isAlive()) {
      if (this.bonusTimeLeft !== 0) {
        this.bonusTimeLeft--;
        if (this.startBonusTimeLeft !== 0 || this.bonusTimeLeft < 20) {
          this.startBonusTimeLeft = (this.startBonusTimeLeft - 1) << 16 >> 16;
          this.screen.setIntensity(this.bonusTimeLeft & 1 ? 0 : 1);
          this.snd.post(Cmd.BonusOn);
          if (this.startBonusTimeLeft === 0) {
            this.snd.music(Tune.Bonus);
            this.snd.post(Cmd.BonusOff);
            this.screen.setIntensity(1);
          }
        }
      } else {
        this.endBonusMode();
        this.snd.post(Cmd.BonusOff);
        this.snd.music(Tune.Main);
      }
    }
    if (this.bonusMode && !this.digger.isAlive()) {
      this.endBonusMode();
      this.snd.post(Cmd.BonusOff);
      this.snd.music(Tune.Main);
    }
  }

  // ------------------------------------------------------------------ text

  /** Writes text with 12-pixel characters; characters without a glyph show as blanks. */
  text(s: string, x: number, y: number, c: number): void {
    for (const ch of s) {
      this.screen.writeChar(x, y, this.screen.hasGlyph(ch) ? ch : " ", c);
      x += 12;
    }
  }

  eraseText(n: number, x: number, y: number, c: number): void {
    this.text(" ".repeat(n), x, y, c);
  }

  clearTopLine(): void {
    this.eraseText(26, 0, 0, 3);
    this.eraseText(1, 308, 0, 3);
  }

  /** Right-aligned number in a field of `w` digits; the leftmost digit is omitted when 0. */
  writeNumber(n: number, x: number, y: number, w: number, c: number): void {
    let xp = (w - 1) * 12 + x;
    while (w > 0) {
      const d = n % 10;
      if (w > 1 || d > 0) this.screen.writeChar(xp, y, String.fromCharCode(48 + d), c);
      n = Math.trunc(n / 10);
      w--;
      xp -= 12;
    }
  }

  /** Spare-life icon: 0 player 1, 1 player 2, 2 empty. */
  private drawLife(t: number, x: number, y: number): void {
    const s = this.assets.sprites;
    this.screen.blit(x, y, [s.life, s.lifePlayer2, s.lifeEmpty][t]);
  }

  drawLives(): void {
    let n = this.digger.lives(0) - 1;
    this.eraseText(5, 96, 0, 2);
    if (n > 4) {
      this.drawLife(0, 80, 0);
      this.text(`X${n}`, 100, 0, 2);
    } else
      for (let l = 1; l < 5; l++) {
        this.drawLife(n > 0 ? 0 : 2, l * 20 + 60, 0);
        n--;
      }
    if (this.nPlayers === 2) {
      this.eraseText(5, 164, 0, 2);
      n = this.digger.lives(1) - 1;
      if (n > 4) {
        const s = `${n}X`;
        this.text(s, 220 - s.length * 12, 0, 2);
        this.drawLife(1, 224, 0);
      } else
        for (let l = 1; l < 5; l++) {
          this.drawLife(n > 0 ? 1 : 2, 244 - l * 20, 0);
          n--;
        }
    }
  }

  /** Title-screen label of the selected number of players. */
  showPlayers(): void {
    this.eraseText(10, 180, 25, 3);
    this.eraseText(12, 170, 39, 3);
    if (this.nPlayers === 1) {
      this.text("ONE", 220, 25, 3);
      this.text(" PLAYER ", 192, 39, 3);
    } else {
      this.text("TWO", 220, 25, 3);
      this.text(" PLAYERS", 184, 39, 3);
    }
  }
}

/** Offsets into a cell at which an emerald is redrawn / eaten, per direction (index = Dir). */
const EMERALD_DRAW: Record<number, number> = { [Dir.Right]: 8, [Dir.Up]: 12, [Dir.Left]: 16, [Dir.Down]: 6 };
const EMERALD_EAT: Record<number, number> = { [Dir.Right]: 12, [Dir.Up]: 9, [Dir.Left]: 12, [Dir.Down]: 9 };

/** Wraps a number to a signed 16-bit value (the original's integer width). */
export function int16(v: number): number {
  return (v << 16) >> 16;
}
