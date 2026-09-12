import type { SpriteImage } from "../contracts";
import type { CgaScreen } from "./cga";

/**
 * Sprite slots, in the fixed order of the original. The order matters: overlapping
 * sprites are restored and redrawn in slot order, and collision lists are
 * reported in slot order.
 */
export const SLOT_BONUS = 0;
export const SLOT_BAG = 1; // 7 bags: 1..7
export const SLOT_MONSTER = 8; // 6 monsters: 8..13
export const SLOT_FIREBALL = 14; // 2 fireballs: 14..15
export const SLOT_DIGGER = 16; // 2 diggers: 16..17
const SLOTS = 18;
/** Pseudo slot used for drawing into the background (tunnels, emeralds). */
const GROUND = SLOTS;

/** Kinds of sprites, for collision lists. */
export const enum Kind {
  Bonus = 0,
  Bag = 1,
  Monster = 2,
  Fireball = 3,
  Digger = 4,
}
const KIND_RANGES: readonly (readonly [number, number])[] = [
  [SLOT_BONUS, SLOT_BAG],
  [SLOT_BAG, SLOT_MONSTER],
  [SLOT_MONSTER, SLOT_FIREBALL],
  [SLOT_FIREBALL, SLOT_DIGGER],
  [SLOT_DIGGER, SLOTS],
];

/** Sprites a drawn sprite overlaps, per kind, as slot numbers in slot order. */
export type Hits = readonly [number[], number[], number[], number[], number[]];

export function noHits(): Hits {
  return [[], [], [], [], []];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class SpriteSlot implements Rect {
  on = false;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  img: SpriteImage | null = null;
  next: SpriteImage | null = null;
  /** Screen contents under the sprite, saved when it was drawn. */
  readonly under = new Uint8Array(256);
}

function overlap(a: Rect, b: Rect): boolean {
  if (a.x >= b.x) {
    if (a.x > b.x + b.w - 1) return false;
  } else if (b.x > a.x + a.w - 1) return false;
  if (a.y >= b.y) return a.y <= b.y + b.h - 1;
  return b.y <= a.y + a.h - 1;
}

/**
 * The sprite layer: sprites are drawn straight into the screen, remembering what
 * was underneath. Moving or erasing a sprite first takes every overlapping sprite
 * (transitively) off the screen and puts them back afterwards, exactly like the
 * original, including its quirks (restoration in slot order, the image of the
 * next draw being chosen in advance, stale saved backgrounds).
 */
export class SpriteLayer {
  private readonly slots: SpriteSlot[] = [];
  private readonly ground: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly redraw = new Uint8Array(SLOTS + 1);
  private readonly visited = new Uint8Array(SLOTS + 1);
  /** Overlaps found by the most recent `draw` (some game code reads them later). */
  lastHits: Hits = noHits();

  constructor(private readonly screen: CgaScreen) {
    for (let i = 0; i < SLOTS; i++) this.slots.push(new SpriteSlot());
  }

  isOn(n: number): boolean {
    return this.slots[n].on;
  }

  /** Assigns an image and hides the sprite (without restoring the screen). */
  create(n: number, img: SpriteImage): void {
    const s = this.slots[n];
    s.img = img;
    s.next = img;
    s.w = img.w;
    s.h = img.h;
    s.on = false;
  }

  /** Chooses the image used by the next `draw`/`place` of the sprite. */
  setNext(n: number, img: SpriteImage): void {
    this.slots[n].next = img;
  }

  /** Puts a sprite on the screen at a new place (it is assumed not to be shown). */
  place(n: number, x: number, y: number): void {
    const s = this.slots[n];
    s.x = x & ~3;
    s.y = y;
    s.img = s.next;
    s.w = s.img!.w;
    s.h = s.img!.h;
    this.clearFlags();
    this.mark(n, s);
    this.restoreMarked();
    this.screen.save(s.x, s.y, s.w, s.h, s.under);
    s.on = true;
    this.redraw[n] = 1;
    this.drawMarked();
  }

  erase(n: number): void {
    const s = this.slots[n];
    if (!s.on) return;
    this.screen.restore(s.x, s.y, s.w, s.h, s.under);
    s.on = false;
    this.clearFlags();
    this.mark(n, s);
    this.drawMarked();
  }

  /** Moves/redraws a sprite with its next image and returns what it overlaps. */
  draw(n: number, x: number, y: number): Hits {
    x &= ~3;
    const s = this.slots[n];
    const next = s.next!;
    this.clearFlags();
    this.mark(n, s);
    this.visited.fill(0);
    this.mark(n, { x, y, w: next.w, h: next.h });
    this.redraw[n] = 1;
    this.restoreMarked();
    s.on = true;
    s.x = x;
    s.y = y;
    s.img = next;
    s.w = next.w;
    s.h = next.h;
    this.screen.save(s.x, s.y, s.w, s.h, s.under);
    this.drawMarked();
    this.lastHits = this.hitsOf(n);
    return this.lastHits;
  }

  /** Forgets the collision result (the original does this for undrawable frames). */
  clearHits(): void {
    this.lastHits = noHits();
  }

  /**
   * Changes the background under the sprites: overlapping sprites are lifted,
   * the image is blitted into the ground, then the sprites are put back.
   */
  drawGround(x: number, y: number, img: SpriteImage, cut: boolean): void {
    const g = this.ground;
    g.x = x;
    g.y = y;
    g.w = img.w;
    g.h = img.h;
    this.clearFlags();
    this.mark(GROUND, g);
    this.restoreMarked();
    this.screen.blitGround(x & ~3, y, img, cut);
    for (let i = 0; i < SLOTS; i++) {
      if (!this.redraw[i]) continue;
      const s = this.slots[i];
      this.screen.save(s.x, s.y, s.w, s.h, s.under);
    }
    this.drawMarked();
  }

  private clearFlags(): void {
    this.redraw.fill(0);
    this.visited.fill(0);
  }

  /** Flags every shown sprite overlapping `rect` (and, transitively, theirs). */
  private mark(n: number, rect: Rect): void {
    if (this.visited[n]) return;
    this.visited[n] = 1;
    for (let i = 0; i < SLOTS; i++) {
      const s = this.slots[i];
      if (s.on && i !== n && overlap(s, rect)) {
        this.redraw[i] = 1;
        this.mark(i, s);
      }
    }
  }

  private restoreMarked(): void {
    for (let i = 0; i < SLOTS; i++) {
      if (!this.redraw[i]) continue;
      const s = this.slots[i];
      this.screen.restore(s.x, s.y, s.w, s.h, s.under);
    }
  }

  private drawMarked(): void {
    for (let i = 0; i < SLOTS; i++) {
      if (!this.redraw[i]) continue;
      const s = this.slots[i];
      this.screen.blit(s.x, s.y, s.img!);
    }
  }

  private hitsOf(n: number): Hits {
    const hits = noHits();
    const s = this.slots[n];
    for (let k = 0; k < KIND_RANGES.length; k++) {
      const [from, to] = KIND_RANGES[k];
      for (let i = from; i < to; i++) {
        const o = this.slots[i];
        if (o.on && i !== n && overlap(s, o)) hits[k].push(i);
      }
    }
    return hits;
  }
}
