// Contracts between the modules of Digger 3D (see docs/ARCHITECTURE.md).
//
//   core   -> produces Screen (2D, original CGA), GameView (for 3D), SoundEvent stream
//   sound  -> consumes SoundEvent
//   view3d -> consumes GameView + original sprites
//   app    -> wires everything, owns real time and the keyboard

/** The playfield: 15 x 10 cells of 20 x 18 pixels on the 320 x 200 CGA screen. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;
export const FIELD_COLS = 15;
export const FIELD_ROWS = 10;

export const enum Dir {
  None = -1,
  Right = 0,
  Up = 2,
  Left = 4,
  Down = 6,
}

/** Decoded original sprite. */
export interface SpriteImage {
  readonly w: number;
  readonly h: number;
  /** CGA colour (0..3) per pixel, row-major. */
  readonly color: Uint8Array;
  /** 1 where opaque, 0 where transparent. */
  readonly opaque: Uint8Array;
}

/** A CGA palette: four RGB colours. */
export type Palette = readonly (readonly [number, number, number])[];

/** The 2D output: 320x200, one CGA colour index (0..3) per pixel. */
export interface Screen {
  readonly pixels: Uint8Array;
  /** The palette currently selected by the game (the original switches palettes). */
  readonly palette: Palette;
  /** Bumped whenever pixels or palette change. */
  readonly version: number;
}

export interface DiggerState {
  x: number;
  y: number;
  dir: Dir;
  alive: boolean;
  /** Frames into the death sequence (0 while alive). */
  deathTime: number;
  /** Stage of the tombstone rising out of the ground (0..4), -1 while there is none. */
  graveStage: number;
  canFire: boolean;
}

export interface MonsterState {
  x: number;
  y: number;
  dir: Dir;
  alive: boolean;
  nobbin: boolean;
  dying: boolean;
}

export interface BagState {
  x: number;
  y: number;
  wobbling: boolean;
  falling: boolean;
  /** Broke open into gold. */
  gold: boolean;
  goldTime: number;
}

export interface FireballState {
  x: number;
  y: number;
  exploding: boolean;
}

/** Read-only snapshot for the 3D view. Coordinates are screen pixels (320x200). */
export interface GameView {
  readonly frame: number;
  readonly inLevel: boolean;
  readonly level: number;
  /** Which of the 8 level maps this level uses (the earth tile follows it). */
  readonly levelPlan: number;
  readonly bonusMode: boolean;
  /** 1 where the earth has been dug away, per screen pixel (SCREEN_W*SCREEN_H). */
  readonly tunnels: Uint8Array;
  /** Bumped when `tunnels` changes. */
  readonly tunnelsVersion: number;
  /** Emerald present per cell, index col + row*FIELD_COLS. */
  readonly emeralds: Uint8Array;
  readonly diggers: readonly DiggerState[];
  readonly monsters: readonly MonsterState[];
  readonly bags: readonly BagState[];
  readonly fireballs: readonly FireballState[];
  readonly bonus: { readonly visible: boolean; readonly x: number; readonly y: number };
  // Added by the core; always filled by src/core, optional so that other
  // producers of a GameView (e.g. development mocks) keep working.
  /** 1 or 2 (two players take turns). */
  readonly players?: number;
  /** Whose turn it is: 0 or 1. */
  readonly currentPlayer?: number;
  /** Score of each player. */
  readonly scores?: readonly number[];
  /** Lives left of each player. */
  readonly lives?: readonly number[];
  /** The game is waiting on the pause screen. */
  readonly paused?: boolean;
}

/**
 * Sound effects and tunes of the original game, triggered by the core and
 * consumed by src/sound. `sound` is a `SoundName` (src/sound/names.ts, which
 * documents every effect); it is typed as a string here so that the two modules
 * stay independent of each other.
 */
export type SoundEvent =
  | { kind: "start"; sound: string; arg?: number }
  | { kind: "stop"; sound: string; arg?: number }
  | { kind: "music"; tune: "main" | "bonus" | "dirge" | "off" }
  /** The game's own sound (F9) / music (F7) switch was toggled. */
  | { kind: "enable"; what: "sound" | "music"; on: boolean }
  /** The sound device itself is stopped / started (the original switches it
   *  off while the high-score initials are typed). */
  | { kind: "speaker"; on: boolean };

export interface InputSource {
  isDown(code: string): boolean;
  nextKey(): string | null;
}
