// Asset interface of the Digger core.
//
// Everything the simulation and the 2D renderer need from the 1983 DIGGER
// program is described here. The bundle the game runs on is built by
// `src/assets/game.ts` from the Digger Remastered data
// (`src/assets/fromRemastered.ts`) plus the corrections in
// `src/assets/corrections.ts`; `tools/extract` can produce the same bundle
// straight from a copy of DIGGER.COM, which is how the corrections are checked.
// Core code depends only on these types.
//
// Pixel data is CGA: one colour index 0..3 per pixel, row-major.

import type { Palette, SpriteImage } from "../contracts.ts";

/**
 * A 12x12 character of the game font. `pixels` holds CGA values; text is drawn
 * by overwriting the 12x12 cell with `pixel & colourMask` where the mask is the
 * text colour replicated into every pixel (so colour 3 shows the glyph as-is).
 */
export interface Glyph {
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8Array;
}

/** Digger (the player's vehicle). Three animation frames per direction. */
export interface DiggerSprites {
  /** Weapon loaded (fire available). */
  readonly right: readonly SpriteImage[];
  readonly up: readonly SpriteImage[];
  readonly left: readonly SpriteImage[];
  readonly down: readonly SpriteImage[];
  /** Weapon recharging (drawn while the fireball cannot be fired). */
  readonly rightReloading: readonly SpriteImage[];
  readonly upReloading: readonly SpriteImage[];
  readonly leftReloading: readonly SpriteImage[];
  readonly downReloading: readonly SpriteImage[];
  /** Digger turned over after being hit. */
  readonly dead: SpriteImage;
  /** Tombstone rising out of the ground, 5 stages (index 0 = lowest). */
  readonly grave: readonly SpriteImage[];
}

/** Earth-removal shapes: colour 0 where opaque, i.e. they cut black holes. */
export interface BlobSprites {
  /** 8x18, cut ahead of a Digger moving right. */
  readonly right: SpriteImage;
  /** 8x18, cut ahead of a Digger moving left. */
  readonly left: SpriteImage;
  /** 24x6, cut above a Digger moving up. */
  readonly top: SpriteImage;
  /** 24x6, cut below a Digger moving down. */
  readonly bottom: SpriteImage;
  /** 24x6, cut under a bag when it starts to fall. */
  readonly square: SpriteImage;
  /** 24x8, cut under a falling bag. */
  readonly furry: SpriteImage;
}

export interface SpriteSet {
  readonly digger: DiggerSprites;
  /** Gold bag at rest. */
  readonly bag: SpriteImage;
  /** Wobbling bag leaning left / right. */
  readonly bagLeft: SpriteImage;
  readonly bagRight: SpriteImage;
  /** Falling bag. */
  readonly bagFalling: SpriteImage;
  /** Bag breaking open into gold, 3 stages. */
  readonly gold: readonly SpriteImage[];
  /** Nobbin, 3 animation frames, and squashed/dying Nobbin. */
  readonly nobbin: readonly SpriteImage[];
  readonly nobbinDead: SpriteImage;
  /** Hobbin facing right / left, 3 frames each, and the dying images. */
  readonly hobbinRight: readonly SpriteImage[];
  readonly hobbinRightDead: SpriteImage;
  readonly hobbinLeft: readonly SpriteImage[];
  /** 16x14 (one row shorter than the others, as in the original). */
  readonly hobbinLeftDead: SpriteImage;
  /** The bonus cherry. */
  readonly bonus: SpriteImage;
  /** Fireball in flight, 3 frames; explosion, 3 stages. 8x8. */
  readonly fireball: readonly SpriteImage[];
  readonly explosion: readonly SpriteImage[];
  /** Emerald (16x10) and the shape that removes it (cuts to black). */
  readonly emerald: SpriteImage;
  readonly emeraldHole: SpriteImage;
  /** 20x4 earth tiles, one per level plan 1..8 (index 0 = plan 1). */
  readonly earth: readonly SpriteImage[];
  readonly blobs: BlobSprites;
  /** Spare-life icons in the top line (16x12): player 1, player 2, empty. */
  readonly life: SpriteImage;
  readonly lifePlayer2: SpriteImage;
  readonly lifeEmpty: SpriteImage;
}

export interface CgaPalettes {
  /** CGA palette 0 / palette 1, low intensity. */
  readonly normal: readonly [Palette, Palette];
  /** CGA palette 0 / palette 1, high intensity (bonus mode flashes). */
  readonly intense: readonly [Palette, Palette];
}

/**
 * A level plan: 10 rows of 15 characters.
 * 'S' = start of pre-dug tunnels (both ways), 'V' = vertical tunnel,
 * 'H' = horizontal tunnel, 'C' = emerald, 'B' = gold bag, ' ' = earth.
 */
export type LevelMap = readonly string[];

export interface AssetBundle {
  /** Where the data came from, e.g. "remastered+corrections" or "original". */
  readonly source: string;
  readonly palettes: CgaPalettes;
  readonly sprites: SpriteSet;
  /** Glyphs keyed by upper-case character: 'A'-'Z', '0'-'9', ':', '.', '_', ' '. */
  readonly font: Readonly<Record<string, Glyph>>;
  /** Title picture, 320x200 CGA pixels. */
  readonly title: Uint8Array;
  /** The 8 level plans in order. */
  readonly levels: readonly LevelMap[];
}
