import { SCREEN_H, SCREEN_W, type Screen } from "../contracts";

/** Shows the core's indexed 320x200 CGA frame on a canvas, only when it changed. */
export class Screen2D {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private lastVersion = -1;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    this.ctx = canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(SCREEN_W, SCREEN_H);
  }

  draw(screen: Screen): void {
    if (screen.version === this.lastVersion) return;
    this.lastVersion = screen.version;
    const px = screen.pixels;
    const pal = screen.palette;
    const out = this.image.data;
    for (let i = 0, o = 0; i < px.length; i++, o += 4) {
      const c = pal[px[i]];
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}
