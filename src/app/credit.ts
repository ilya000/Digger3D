import type { AssetBundle } from "../assets/types";
import type { Palette } from "../contracts";

/**
 * Our own line in the corner of the 3D window, in the same letters as the
 * original's "© Windmill Software 1983".
 *
 * That line is not a font: it is drawn into the title picture itself, so the
 * glyphs are cut straight out of it by the columns they occupy there (the rows
 * are always 184..199, the baseline at 199). The alphabet it gives us is only
 * "© W i n d m l S o f t w a r e 1 9 8 3", so the letters and digits our line
 * needs and the picture does not have are drawn here in the same style: two
 * pixel stems, the same serifs, capitals from row 186, x-height from row 190.
 */

/** Columns of each glyph inside the original's copyright line. */
const IN_TITLE: Readonly<Record<string, readonly [number, number]>> = {
  "©": [14, 28], W: [37, 53], i: [56, 61], n: [65, 78], d: [82, 94],
  m: [97, 118], l: [131, 136], S: [161, 172], o: [176, 185], f: [189, 197],
  t: [200, 207], w: [210, 226], a: [230, 239], r: [243, 252], e: [256, 264],
  "1": [282, 287], "9": [290, 295], "8": [298, 303], "3": [306, 311],
};

const TITLE_TOP = 184;
const TITLE_BOTTOM = 199;
const SCREEN_W = 320;

/** Glyphs the original's line does not contain, drawn in its style.
 *  Row 0 is screen row 184; the baseline (row 199) is index 15. */
const DRAWN: Readonly<Record<string, readonly string[]>> = {
  I: [
    "......", "......", "######", "..##..", "..##..", "..##..", "..##..", "..##..",
    "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "######",
  ],
  O: [
    "............", "............", "...######...", ".###....###.", "##........##", "##........##",
    "##........##", "##........##", "##........##", "##........##", "##........##", "##........##",
    "##........##", "##........##", ".###....###.", "...######...",
  ],
  s: [
    ".........", ".........", ".........", ".........", ".........", ".........",
    "..####..#", ".##...###", "##.....##", "##.......", ".####....", "...####..",
    "......##.", "#......##", "##....##.", ".#####...",
  ],
  p: [
    "..........", "..........", "..........", "..........", "..........", "..........",
    "#######...", "..###..##.", "..##....##", "..##....##", "..##....##", "..##....##",
    "..##....##", "..###..##.", "..#####...", "..##......", "..##......", "######....",
  ],
  v: [
    "...........", "...........", "...........", "...........", "...........", "...........",
    "#####..####", "..##....##.", "..##....#..", "...##..#...", "...##..#...", "....####...",
    "....###....", ".....##....", ".....#.....", ".....#.....",
  ],
  y: [
    "...........", "...........", "...........", "...........", "...........", "...........",
    "#####..####", "..##....##.", "..##....#..", "...##..#...", "...##..#...", "....####...",
    "....###....", ".....##....", ".....##....", ".....##....", ".....##....", "##...##....",
    ".#####.....",
  ],
  "0": [
    "......", "......", "......", "......", "......", "......", "......", "......", "......",
    ".####.", "##..##", "##..##", "##..##", "##..##", "##..##", ".####.",
  ],
  "2": [
    "......", "......", "......", "......", "......", "......", "......", "......", "......",
    ".####.", "##..##", "....##", "...##.", "..##..", ".##...", "######",
  ],
  "6": [
    "......", "......", "......", "......", "......", "......", "......", "......", "......",
    "..###.", ".##...", "##....", "#####.", "##..##", "##..##", ".####.",
  ],
};

/** Gaps of the original's line: between letters, and between words. */
const LETTER_GAP = 3;
const WORD_GAP = 11;
/** Room below the baseline for the descenders of y and p. */
const DESCENT = 4;

interface Glyph {
  w: number;
  h: number;
  /** 1 where the glyph has ink. Row 0 is screen row 184. */
  on: Uint8Array;
}

function fromTitle(title: Uint8Array, [x0, x1]: readonly [number, number]): Glyph {
  const w = x1 - x0 + 1;
  const h = TITLE_BOTTOM - TITLE_TOP + 1;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) on[y * w + x] = title[(TITLE_TOP + y) * SCREEN_W + x0 + x] ? 1 : 0;
  return { w, h, on };
}

function fromArt(rows: readonly string[]): Glyph {
  const w = Math.max(...rows.map((r) => r.length));
  const on = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) on[y * w + x] = row[x] === "#" ? 1 : 0;
  });
  return { w, h: rows.length, on };
}

export class Credit {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly width: number;
  private readonly height: number;
  /** Where each glyph of the line sits, left to right. */
  private readonly placed: { g: Glyph; x: number }[];
  private readonly canvas: HTMLCanvasElement;
  private palette: Palette | null = null;
  private shown = false;

  constructor(
    canvas: HTMLCanvasElement,
    assets: AssetBundle,
    text = "© Ilya Osipov 2026",
  ) {
    const cache = new Map<string, Glyph>();
    const glyph = (ch: string): Glyph | null => {
      if (cache.has(ch)) return cache.get(ch)!;
      const range = IN_TITLE[ch];
      const g = range ? fromTitle(assets.title, range) : DRAWN[ch] ? fromArt(DRAWN[ch]) : null;
      if (g) cache.set(ch, g);
      return g;
    };
    let x = 0;
    const placed: { g: Glyph; x: number }[] = [];
    for (const ch of text) {
      if (ch === " ") {
        x += WORD_GAP;
        continue;
      }
      const g = glyph(ch);
      if (!g) continue;
      placed.push({ g, x });
      x += g.w + LETTER_GAP;
    }
    this.width = Math.max(1, x - LETTER_GAP);
    this.height = TITLE_BOTTOM - TITLE_TOP + 1 + DESCENT;
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.width = `${(this.width / SCREEN_W) * 100}%`;
    this.ctx = canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(this.width, this.height);
    this.placed = placed;
    this.canvas = canvas;
  }

  /** Shows or hides the line and repaints it when the palette changes. */
  update(palette: Palette, visible: boolean): void {
    if (visible !== this.shown) {
      this.shown = visible;
      this.canvas.hidden = !visible;
    }
    if (!visible || palette === this.palette) return;
    this.palette = palette;
    this.paint(palette);
  }

  private paint(palette: Palette): void {
    const out = this.image.data;
    out.fill(0);
    const [r, g, b] = palette[3]; // the colour the original writes its line in
    for (const { g: glyph, x: at } of this.placed)
      for (let y = 0; y < glyph.h; y++)
        for (let x = 0; x < glyph.w; x++) {
          if (!glyph.on[y * glyph.w + x]) continue;
          const px = at + x;
          if (px < 0 || px >= this.width || y >= this.height) continue;
          const o = (y * this.width + px) * 4;
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] = 255;
        }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
