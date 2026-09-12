// CGA hardware facts and the decoder for the original game's sprite bytes.
import type { Palette, SpriteImage } from "../contracts.ts";

/**
 * The four colours of CGA graphics mode 4 for each palette / intensity combination
 * (colour 0 is the background, black in Digger). Standard IBM CGA RGB values.
 */
export const CGA_PALETTES: Record<"p0" | "p0i" | "p1" | "p1i", Palette> = {
  p0: [[0, 0, 0], [0, 170, 0], [170, 0, 0], [170, 85, 0]],
  p0i: [[0, 0, 0], [85, 255, 85], [255, 85, 85], [255, 255, 85]],
  p1: [[0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170]],
  p1i: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]],
};

export function cgaPalette(pal: number, inten: number): Palette {
  const key = `p${pal & 1}${inten ? "i" : ""}` as keyof typeof CGA_PALETTES;
  return CGA_PALETTES[key];
}

export function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/**
 * Decodes an original sprite: `wBytes` bytes per row (4 pixels per byte, 2 bits per
 * pixel, leftmost pixel in the top bits) and `h` rows. The original draws sprites as
 * screen = (screen AND mask) OR image, so a pixel is opaque where its mask bits are 00.
 * Without a mask the sprite is drawn as a plain block (every pixel opaque).
 */
export function decodeCgaSprite(image: Uint8Array, mask: Uint8Array | null, wBytes: number, h: number): SpriteImage {
  const w = wBytes * 4;
  const color = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let xb = 0; xb < wBytes; xb++) {
      const i = y * wBytes + xb;
      const img = image[i] ?? 0;
      const msk = mask ? (mask[i] ?? 0xff) : 0;
      for (let p = 0; p < 4; p++) {
        const shift = 6 - p * 2;
        const o = y * w + xb * 4 + p;
        color[o] = (img >> shift) & 3;
        opaque[o] = ((msk >> shift) & 3) === 0 ? 1 : 0;
      }
    }
  return { w, h, color, opaque };
}
