import { Dir, FIELD_COLS, FIELD_ROWS } from "../contracts";
import type { LevelMap } from "../assets/types";

/** Screen position of cell (0, 0): sprites of objects in that cell are drawn here. */
export const CELL_X0 = 12;
export const CELL_Y0 = 18;
export const CELL_W = 20;
export const CELL_H = 18;
/** Extreme object positions. */
export const X_MIN = 12;
export const X_MAX = 292;
export const Y_MIN = 18;
export const Y_MAX = 180;

/*
 * Cell flags (16 bits, a set bit means "still earth"):
 *   bits 0-4   the five 4-pixel horizontal steps through the cell
 *   bits 6-11  the six 3-pixel vertical steps through the cell
 *   bit 13     the cell has not been entered at all
 * A fresh level starts with every bit set; pre-dug tunnels clear some.
 */
export const H_BITS = 0x1f;
export const V_BITS = 0xfc0;
export const UNTOUCHED = 0x2000;
/** All step bits except bit 5: used by bags to test "nothing dug below". */
export const SOLID = 0xfdf;

/**
 * The tunnel map of the level being played, plus the saved maps of both
 * players (in the 2-player game each player has his own level in progress).
 */
export class Field {
  readonly cells = new Uint16Array(FIELD_COLS * FIELD_ROWS);
  private readonly saved = [new Uint16Array(FIELD_COLS * FIELD_ROWS), new Uint16Array(FIELD_COLS * FIELD_ROWS)];

  /** Flags of a cell; addressed linearly like the original (no bounds wrap-around checks). */
  get(col: number, row: number): number {
    const v = this.cells[row * FIELD_COLS + col];
    return v === undefined ? 0xffff : v;
  }

  private and(index: number, mask: number): void {
    if (index >= 0 && index < this.cells.length) this.cells[index] &= mask;
  }

  /** Builds the initial map of a level for a player from its plan characters. */
  build(charAt: (x: number, y: number) => string, player: number): void {
    for (let x = 0; x < FIELD_COLS; x++)
      for (let y = 0; y < FIELD_ROWS; y++) {
        let f = 0xffff;
        const c = charAt(x, y);
        if (c === "S" || c === "V") f &= 0xd03f;
        if (c === "S" || c === "H") f &= 0xdfe0;
        this.cells[y * FIELD_COLS + x] = f;
        this.saved[player][y * FIELD_COLS + x] = f;
      }
  }

  /** Makes the saved map of a player current. */
  restore(player: number): void {
    this.cells.set(this.saved[player]);
  }

  /** Remembers the current map as the player's. */
  store(player: number): void {
    this.saved[player].set(this.cells);
  }

  /**
   * Digs the next step for an object at pixel position (x, y) moving in `dir`
   * (the step it is about to enter). Clears the untouched bit once all steps of
   * that axis are dug.
   */
  eat(x: number, y: number, dir: Dir): void {
    let h = Math.trunc((x - 12) / 20);
    let xr = Math.trunc(((x - 12) % 20) / 4);
    let v = Math.trunc((y - 18) / 18);
    let yr = Math.trunc(((y - 18) % 18) / 3);
    switch (dir) {
      case Dir.Right: {
        h++;
        const i = v * FIELD_COLS + h;
        this.and(i, ~(1 << xr) & 0xffff);
        if ((this.cells[i] & H_BITS) === 0) this.and(i, 0xdfff);
        break;
      }
      case Dir.Up: {
        yr--;
        if (yr < 0) {
          yr += 6;
          v--;
        }
        const i = v * FIELD_COLS + h;
        this.and(i, ~(1 << (6 + yr)) & 0xffff);
        if ((this.cells[i] & V_BITS) === 0) this.and(i, 0xdfff);
        break;
      }
      case Dir.Left: {
        xr--;
        if (xr < 0) {
          xr += 5;
          h--;
        }
        const i = v * FIELD_COLS + h;
        this.and(i, ~(1 << xr) & 0xffff);
        if ((this.cells[i] & H_BITS) === 0) this.and(i, 0xdfff);
        break;
      }
      case Dir.Down: {
        v++;
        const i = v * FIELD_COLS + h;
        this.and(i, ~(1 << (6 + yr)) & 0xffff);
        if ((this.cells[i] & V_BITS) === 0) this.and(i, 0xdfff);
        break;
      }
      default:
        break;
    }
  }
}

/** Cell under a pixel position (x from 12, y from 18) and the offset into it. */
export function cellOf(x: number, y: number): { col: number; row: number; dx: number; dy: number } {
  return {
    col: Math.trunc((x - CELL_X0) / CELL_W),
    row: Math.trunc((y - CELL_Y0) / CELL_H),
    dx: (x - CELL_X0) % CELL_W,
    dy: (y - CELL_Y0) % CELL_H,
  };
}

export function reverse(dir: Dir): Dir {
  switch (dir) {
    case Dir.Right:
      return Dir.Left;
    case Dir.Left:
      return Dir.Right;
    case Dir.Up:
      return Dir.Down;
    case Dir.Down:
      return Dir.Up;
    default:
      return dir;
  }
}
