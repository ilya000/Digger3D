import { KEYS } from "../core";
import type { InputSource } from "../contracts";

/**
 * The browser keyboard as the core's `InputSource`.
 *
 * The game's own keys are the original's (src/core/keyboard.ts): the cursor
 * keys, F1 to fire, Space to pause, F7/F9 music and sound, F10 to leave a game,
 * + / - for the speed, N for one/two players, letters and digits for the
 * high-score initials.
 *
 * The function keys are hard to press in a browser - F1 opens its help, and on
 * a Mac the whole F row belongs to the system unless fn is held - so every one
 * of them has an alias: shift (or enter) fires, and Alt + letter stands for the
 * rest. Alt is never part of the game's own keys, so the letters themselves are
 * still free for the high-score initials.
 */
const ALIASES: Readonly<Record<string, string>> = {
  ShiftLeft: KEYS.fire,
  ShiftRight: KEYS.fire,
  ControlLeft: KEYS.fire,
  ControlRight: KEYS.fire,
  MetaLeft: KEYS.fire,
  MetaRight: KEYS.fire,
  Enter: KEYS.fire,
  NumpadEnter: KEYS.fire,
  Equal: KEYS.faster,
  Minus: KEYS.slower,
};

/** Command is held: macOS swallows the key-up of every other key. */
const META = new Set(["MetaLeft", "MetaRight"]);

/** Aliases that need Alt (Option on a Mac) held down. */
const ALT_ALIASES: Readonly<Record<string, string>> = {
  KeyF: KEYS.fire,
  KeyM: KEYS.music,
  KeyS: KEYS.sound,
  KeyQ: KEYS.exit,
  KeyP: KEYS.pause,
  KeyN: KEYS.players,
};

function translate(e: KeyboardEvent): string {
  if (e.altKey) return ALT_ALIASES[e.code] ?? e.code;
  return ALIASES[e.code] ?? e.code;
}

/** Keys whose browser default (scrolling, help, menus) must not happen. */
const SWALLOW = new Set<string>([
  KEYS.left,
  KEYS.right,
  KEYS.up,
  KEYS.down,
  KEYS.fire,
  KEYS.pause,
  KEYS.music,
  KEYS.sound,
  KEYS.exit,
  KEYS.faster,
  KEYS.slower,
  "Backspace",
  ...Object.keys(ALIASES),
  ...Object.keys(ALT_ALIASES),
]);

export interface KeyboardOptions {
  /** Keys the page itself uses; the game never sees them. */
  ignore?: (e: KeyboardEvent) => boolean;
  target?: EventTarget;
}

export class BrowserKeyboard implements InputSource {
  /** Held keys, already translated to the core's codes. */
  private readonly down = new Set<string>();
  private readonly queue: string[] = [];
  private readonly ignore: (e: KeyboardEvent) => boolean;

  constructor(options: KeyboardOptions = {}) {
    this.ignore = options.ignore ?? (() => false);
    const target = options.target ?? window;
    target.addEventListener("keydown", (e) => this.onDown(e as KeyboardEvent));
    target.addEventListener("keyup", (e) => this.onUp(e as KeyboardEvent));
    target.addEventListener("blur", () => this.reset());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  nextKey(): string | null {
    return this.queue.shift() ?? null;
  }

  /** Everything is released (the window lost the keyboard). */
  reset(): void {
    this.down.clear();
  }

  /** A control of the page itself (a touch button) holds a key down. */
  press(code: string): void {
    this.down.add(code);
    this.queue.push(code);
  }

  release(code: string): void {
    this.down.delete(code);
  }

  private onDown(e: KeyboardEvent): void {
    if (this.ignore(e)) return;
    const code = translate(e);
    if (SWALLOW.has(e.code) || SWALLOW.has(code)) e.preventDefault();
    this.down.add(code);
    // Auto-repeat is the browser's, not the game's: the key press itself counts once.
    if (!e.repeat) this.queue.push(code);
  }

  private onUp(e: KeyboardEvent): void {
    if (this.ignore(e)) return;
    if (META.has(e.code)) {
      // while Command was held the browser reported no key-up at all, so any
      // key could be stuck; auto-repeat puts a key that is really held back
      this.down.clear();
      return;
    }
    // releasing Alt first would leave the key held: drop both readings
    this.down.delete(ALIASES[e.code] ?? e.code);
    this.down.delete(ALT_ALIASES[e.code] ?? e.code);
  }
}
