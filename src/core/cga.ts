import { SCREEN_H, SCREEN_W, type Palette, type Screen, type SpriteImage } from "../contracts";
import type { AssetBundle, Glyph } from "../assets/types";

/** First screen row of the playfield (earth starts here; above is the score line). */
export const FIELD_TOP = 14;

/**
 * The CGA 320x200 4-colour screen. Pixels are CGA colour indices. Implements the
 * primitive operations of the original's video driver: masked image blits, block
 * save/restore, byte reads, text and palette selection.
 *
 * Besides the pixels it keeps the per-pixel "dug" mask for the 3D view: pixels
 * that the game turned black by cutting earth (tunnel blobs, eaten emeralds).
 */
export class CgaScreen implements Screen {
  readonly pixels = new Uint8Array(SCREEN_W * SCREEN_H);
  readonly dug = new Uint8Array(SCREEN_W * SCREEN_H);
  private pal = 0;
  private inten = 0;
  private ver = 0;
  private dugVer = 0;
  private readonly glyphs: Map<string, Glyph>;

  constructor(private readonly assets: AssetBundle) {
    this.glyphs = new Map(Object.entries(assets.font));
  }

  get version(): number {
    return this.ver;
  }

  get dugVersion(): number {
    return this.dugVer;
  }

  get palette(): Palette {
    const set = this.inten === 1 ? this.assets.palettes.intense : this.assets.palettes.normal;
    return set[this.pal & 1];
  }

  get paletteIndex(): number {
    return this.pal;
  }

  get intensity(): number {
    return this.inten;
  }

  /** Any change of pixels must end with this (cheap; the app re-uploads lazily). */
  touch(): void {
    this.ver++;
  }

  clear(): void {
    this.pixels.fill(0);
    this.dug.fill(0);
    this.dugVer++;
    this.ver++;
  }

  setPalette(p: number): void {
    if (this.pal !== p) {
      this.pal = p;
      this.ver++;
    }
  }

  setIntensity(i: number): void {
    if (this.inten !== i) {
      this.inten = i;
      this.ver++;
    }
  }

  showTitle(): void {
    this.pixels.set(this.assets.title);
    this.dug.fill(0);
    this.dugVer++;
    this.ver++;
  }

  /** Masked blit: opaque pixels replace the screen, transparent ones keep it. */
  blit(x: number, y: number, img: SpriteImage): void {
    const px = this.pixels;
    for (let r = 0; r < img.h; r++) {
      const sy = y + r;
      if (sy < 0 || sy >= SCREEN_H) continue;
      for (let c = 0; c < img.w; c++) {
        const sx = x + c;
        if (sx < 0 || sx >= SCREEN_W) continue;
        const i = r * img.w + c;
        if (img.opaque[i]) px[sy * SCREEN_W + sx] = img.color[i];
      }
    }
    this.ver++;
  }

  /**
   * Blit that changes the playfield itself and updates the dug mask:
   * `cut` images (colour 0) mark their opaque pixels dug, others clear them.
   */
  blitGround(x: number, y: number, img: SpriteImage, cut: boolean): void {
    this.blit(x, y, img);
    const dug = this.dug;
    const v = cut ? 1 : 0;
    for (let r = 0; r < img.h; r++) {
      const sy = y + r;
      if (sy < FIELD_TOP || sy >= SCREEN_H) continue;
      for (let c = 0; c < img.w; c++) {
        const sx = x + c;
        if (sx < 0 || sx >= SCREEN_W) continue;
        if (img.opaque[r * img.w + c]) dug[sy * SCREEN_W + sx] = v;
      }
    }
    this.dugVer++;
  }

  /** Saves a w x h pixel block (outside pixels read as 0). */
  save(x: number, y: number, w: number, h: number, into: Uint8Array): void {
    const px = this.pixels;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const sx = x + c;
        const sy = y + r;
        into[r * w + c] = sx >= 0 && sx < SCREEN_W && sy >= 0 && sy < SCREEN_H ? px[sy * SCREEN_W + sx] : 0;
      }
  }

  restore(x: number, y: number, w: number, h: number, from: Uint8Array): void {
    const px = this.pixels;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const sx = x + c;
        const sy = y + r;
        if (sx >= 0 && sx < SCREEN_W && sy >= 0 && sy < SCREEN_H) px[sy * SCREEN_W + sx] = from[r * w + c];
      }
    this.ver++;
  }

  /** The video byte holding pixel (x, y): 4 pixels, 2 bits each, leftmost in bits 7-6. */
  readByte(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return 0xff;
    const i = y * SCREEN_W + (x & ~3);
    const px = this.pixels;
    return (px[i] << 6) | (px[i + 1] << 4) | (px[i + 2] << 2) | px[i + 3];
  }

  /** True if the character has a glyph (others are skipped by text output). */
  hasGlyph(ch: string): boolean {
    return this.glyphs.has(ch.toUpperCase());
  }

  /** Draws a 12x12 character cell in colour `c` (overwrites the whole cell). */
  writeChar(x: number, y: number, ch: string, c: number): void {
    const g = this.glyphs.get(ch.toUpperCase());
    if (!g) return;
    const px = this.pixels;
    const mask = c & 3;
    for (let r = 0; r < g.h; r++)
      for (let col = 0; col < g.w; col++) {
        const sx = x + col;
        const sy = y + r;
        if (sx >= 0 && sx < SCREEN_W && sy >= 0 && sy < SCREEN_H) px[sy * SCREEN_W + sx] = g.pixels[r * g.w + col] & mask;
      }
    this.ver++;
  }
}
