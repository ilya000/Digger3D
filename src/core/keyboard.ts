import { Dir, type InputSource } from "../contracts";

/** KeyboardEvent.code of the original's keys. */
export const KEYS = {
  right: "ArrowRight",
  up: "ArrowUp",
  left: "ArrowLeft",
  down: "ArrowDown",
  fire: "F1",
  faster: "NumpadAdd",
  slower: "NumpadSubtract",
  music: "F7",
  sound: "F9",
  exit: "F10",
  pause: "Space",
  players: "KeyN",
} as const;

/** What a key press means besides "a key was pressed". */
const enum Special {
  None,
  Faster,
  Slower,
  Music,
  Sound,
  Exit,
  Pause,
  Players,
  /** Keys of Digger Remastered extras (cheat, save recording): no effect here. */
  Inert,
}

function special(code: string): Special {
  switch (code) {
    case "KeyT":
    case "F8":
      return Special.Inert;
    case KEYS.faster:
      return Special.Faster;
    case KEYS.slower:
      return Special.Slower;
    case KEYS.music:
      return Special.Music;
    case KEYS.sound:
      return Special.Sound;
    case KEYS.exit:
      return Special.Exit;
    case KEYS.pause:
      return Special.Pause;
    case KEYS.players:
      return Special.Players;
    default:
      return Special.None;
  }
}

export interface KeyboardHost {
  /** Speed keys: shorten / lengthen the frame period. */
  speedUp(): void;
  slowDown(): void;
  toggleMusic(): void;
  toggleSound(): void;
}

/**
 * The player's keyboard as the game sees it: held cursor keys, key presses
 * latched between polls, and a buffer of key-down events. Reproduces how the
 * original turns this into a movement direction (the most recently pressed of
 * the held cursor keys wins) and a fire request.
 */
export class Keyboard {
  private input: InputSource | null = null;
  private readonly buffer: string[] = [];

  /** Presses seen by `poll` since the controls were last read. */
  private latchRight = false;
  private latchUp = false;
  private latchLeft = false;
  private latchDown = false;
  private latchFire = false;

  private wasUp = false;
  private wasDown = false;
  private wasLeft = false;
  private wasRight = false;
  private dynamicDir: Dir = Dir.None;
  private staticDir: Dir = Dir.None;
  private keyDir: Dir = Dir.None;

  /** Fire as read from the keys, and as used by the game (one frame later). */
  fireFlag = false;
  private fireActive = false;

  startRequested = false;
  escape = false;
  pauseRequested = false;
  playersChange = false;

  constructor(private readonly host: KeyboardHost) {}

  /** Time passes: new key-down events arrive from the input source. */
  pump(input: InputSource): void {
    this.input = input;
    for (let k = input.nextKey(); k !== null; k = input.nextKey()) this.buffer.push(k);
  }

  private held(code: string): boolean {
    return this.input !== null && this.input.isDown(code);
  }

  hasKey(): boolean {
    return this.buffer.length > 0;
  }

  takeKey(): string | null {
    return this.buffer.shift() ?? null;
  }

  /** Polls the keyboard (once per frame): latches held keys, handles the buffered presses. */
  poll(): void {
    if (this.held(KEYS.left)) this.latchLeft = true;
    if (this.held(KEYS.right)) this.latchRight = true;
    if (this.held(KEYS.up)) this.latchUp = true;
    if (this.held(KEYS.down)) this.latchDown = true;
    if (this.held(KEYS.fire)) this.latchFire = true;
    // The meaning of the last special key sticks for the rest of this poll, as in the original.
    let action = Special.None;
    while (this.buffer.length > 0) {
      const code = this.buffer.shift()!;
      const s = special(code);
      if (s !== Special.None) action = s;
      switch (action) {
        case Special.Faster:
          this.host.speedUp();
          break;
        case Special.Slower:
          this.host.slowDown();
          break;
        case Special.Music:
          this.host.toggleMusic();
          break;
        case Special.Sound:
          this.host.toggleSound();
          break;
        case Special.Exit:
          this.escape = true;
          break;
        case Special.Pause:
          this.pauseRequested = true;
          break;
        case Special.Players:
          this.playersChange = true;
          break;
        default:
          break;
      }
      if (!this.playersChange) this.startRequested = true;
    }
  }

  /** Discards pending presses (start of a life). */
  flush(): void {
    this.buffer.length = 0;
    this.latchLeft = this.latchRight = this.latchUp = this.latchDown = this.latchFire = false;
  }

  resetDirections(): void {
    this.fireFlag = false;
    this.fireActive = false;
    this.dynamicDir = this.staticDir = this.keyDir = Dir.None;
    this.wasUp = this.wasDown = this.wasLeft = this.wasRight = false;
  }

  /** The fire request read in the previous frame becomes effective. */
  advanceFire(): void {
    this.fireActive = this.fireFlag;
  }

  get fire(): boolean {
    return this.fireActive;
  }

  clearFireLatch(): void {
    this.latchFire = false;
  }

  /** Reads the controls for this frame. */
  readControls(): void {
    const u = this.latchUp || this.held(KEYS.up);
    const d = this.latchDown || this.held(KEYS.down);
    const l = this.latchLeft || this.held(KEYS.left);
    const r = this.latchRight || this.held(KEYS.right);
    if (u) this.latchUp = false;
    if (d) this.latchDown = false;
    if (l) this.latchLeft = false;
    if (r) this.latchRight = false;
    if (this.held(KEYS.fire) || this.latchFire) {
      this.fireFlag = true;
      this.latchFire = false;
    } else this.fireFlag = false;

    if (u && !this.wasUp) this.staticDir = this.dynamicDir = Dir.Up;
    if (d && !this.wasDown) this.staticDir = this.dynamicDir = Dir.Down;
    if (l && !this.wasLeft) this.staticDir = this.dynamicDir = Dir.Left;
    if (r && !this.wasRight) this.staticDir = this.dynamicDir = Dir.Right;
    if (
      (this.wasUp && !u && this.dynamicDir === Dir.Up) ||
      (this.wasDown && !d && this.dynamicDir === Dir.Down) ||
      (this.wasLeft && !l && this.dynamicDir === Dir.Left) ||
      (this.wasRight && !r && this.dynamicDir === Dir.Right)
    ) {
      this.dynamicDir = Dir.None;
      if (u) this.dynamicDir = this.staticDir = Dir.Up;
      if (d) this.dynamicDir = this.staticDir = Dir.Down;
      if (l) this.dynamicDir = this.staticDir = Dir.Left;
      if (r) this.dynamicDir = this.staticDir = Dir.Right;
    }
    this.wasUp = u;
    this.wasDown = d;
    this.wasLeft = l;
    this.wasRight = r;
    this.keyDir = this.staticDir;
    if (this.dynamicDir !== Dir.None) this.keyDir = this.dynamicDir;
    this.staticDir = Dir.None;
  }

  get direction(): Dir {
    return this.keyDir;
  }

  /** Consumes the "start the game" request (any key on the title screen). */
  takeStart(): boolean {
    if (!this.startRequested) return false;
    this.startRequested = false;
    return true;
  }
}

/** Character typed for high-score initials, or 8 (backspace/delete), or null. */
export function initialOf(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (code === "Backspace" || code === "Delete") return 8;
  return null;
}
