import type { AssetBundle } from "../assets/types";
import type { Palette } from "../contracts";

/**
 * Our own line in the corner of the 3D window, in the letters of the original:
 * the © is cut out of the title picture (the "© Windmill Software 1983" line is
 * part of that picture, not of any font) and the text is the game's own 12 x 12
 * font. That font has capitals, digits, "." and "_" only - no brackets and no
 * lower case - so the line reads "© ILYAOS 2026".
 */
const COPYRIGHT = { x: 14, y: 185, w: 18, h: 15 };
const TEXT = "ILYAOS 2026";
const GAP = 6;
const CHAR_W = 12;
/** The width the original works in; the line is scaled to the 3D pane by it. */
const SCREEN_W = 320;

export class Credit {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly width: number;
  private palette: Palette | null = null;
  private shown = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: AssetBundle,
  ) {
    this.width = COPYRIGHT.w + GAP + TEXT.length * CHAR_W;
    canvas.width = this.width;
    canvas.height = COPYRIGHT.h;
    canvas.style.width = `${(this.width / SCREEN_W) * 100}%`;
    this.ctx = canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(this.width, COPYRIGHT.h);
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
    const put = (x: number, y: number, c: number): void => {
      if (c === 0 || x < 0 || x >= this.width || y < 0 || y >= COPYRIGHT.h) return;
      const o = (y * this.width + x) * 4;
      const rgb = palette[c];
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = 255;
    };
    const title = this.assets.title;
    for (let y = 0; y < COPYRIGHT.h; y++)
      for (let x = 0; x < COPYRIGHT.w; x++) put(x, y, title[(COPYRIGHT.y + y) * SCREEN_W + COPYRIGHT.x + x]);
    // the glyphs are 12 rows; sit them on the baseline of the ©
    const top = COPYRIGHT.h - 12;
    let x0 = COPYRIGHT.w + GAP;
    for (const ch of TEXT) {
      const g = this.assets.font[ch];
      if (g) for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) put(x0 + x, top + y, g.pixels[y * g.w + x]);
      x0 += CHAR_W;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
