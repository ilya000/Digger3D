// The AssetBundle built from a copy of the original DIGGER.COM, as read by
// tools/extract. The game does not ship this: it runs on the Digger Remastered
// data plus src/assets/corrections.ts (src/assets/game.ts). This bundle is what
// the corrections are generated from and checked against, so it lives with the
// extractor and outside the sources the game is built from.
import type { SpriteImage } from "../../src/contracts.ts";
import { CGA_PALETTES, decodeCgaSprite, hexBytes } from "../../src/assets/cga.ts";
import { font as rawFont, levels, sprites, titleRle } from "../../src/assets/original.ts";
import type { AssetBundle, Glyph, SpriteSet } from "../../src/assets/types.ts";

function sprite(ch: number): SpriteImage {
  const s = sprites[ch];
  if (!s) throw new Error(`sprite ${ch} is not in the original`);
  return decodeCgaSprite(hexBytes(s.data), s.mask ? hexBytes(s.mask) : null, s.w, s.h);
}

const three = (ch: number) => [sprite(ch), sprite(ch + 1), sprite(ch + 2)];

function spriteSet(): SpriteSet {
  return {
    digger: {
      right: three(1),
      rightReloading: three(4),
      up: three(7),
      upReloading: three(10),
      left: three(13),
      leftReloading: three(16),
      down: three(19),
      downReloading: three(22),
      dead: sprite(25),
      grave: [26, 27, 28, 29, 30].map(sprite),
    },
    bag: sprite(62),
    bagRight: sprite(63),
    bagLeft: sprite(64),
    bagFalling: sprite(65),
    gold: three(66),
    nobbin: three(69),
    nobbinDead: sprite(72),
    hobbinRight: three(73),
    hobbinRightDead: sprite(76),
    hobbinLeft: three(77),
    hobbinLeftDead: sprite(80),
    bonus: sprite(81),
    fireball: three(82),
    explosion: three(85),
    emerald: sprite(108),
    emeraldHole: sprite(109),
    earth: [94, 95, 96, 97, 98, 99, 100, 101].map(sprite),
    blobs: {
      right: sprite(102),
      top: sprite(103),
      left: sprite(104),
      bottom: sprite(105),
      square: sprite(106),
      furry: sprite(107),
    },
    life: sprite(110),
    lifePlayer2: sprite(111),
    lifeEmpty: sprite(112),
  };
}

const GLYPH_KEYS: Record<string, string> = { dot: ".", line: "_", space: " ", colon: ":" };

function glyphs(): Record<string, Glyph> {
  const out: Record<string, Glyph> = {};
  for (const [name, hex] of Object.entries(rawFont)) {
    const key = GLYPH_KEYS[name] ?? name;
    const img = decodeCgaSprite(hexBytes(hex), null, 3, 12);
    out[key] = { w: 12, h: 12, pixels: img.color };
  }
  return out;
}

/** Unpacks the title: RLE (FE count value, count 0 = 256) into CGA video memory. */
export function decodeTitle(rle: Uint8Array): Uint8Array {
  const vram = new Uint8Array(0x4000);
  let o = 0;
  for (let i = 0; i < rle.length && o < vram.length; ) {
    if (rle[i] === 0xfe) {
      const n = rle[i + 1] || 256;
      vram.fill(rle[i + 2], o, Math.min(vram.length, o + n));
      o += n;
      i += 3;
    } else {
      vram[o++] = rle[i++];
    }
  }
  // CGA mode 4: even rows from 0x0000, odd rows from 0x2000, 80 bytes per row
  const pixels = new Uint8Array(320 * 200);
  for (let y = 0; y < 200; y++) {
    const base = (y & 1) * 0x2000 + (y >> 1) * 80;
    for (let xb = 0; xb < 80; xb++) {
      const v = vram[base + xb];
      for (let k = 0; k < 4; k++) pixels[y * 320 + xb * 4 + k] = (v >> (6 - 2 * k)) & 3;
    }
  }
  return pixels;
}

export function originalBundle(): AssetBundle {
  return {
    source: "original",
    palettes: {
      normal: [CGA_PALETTES.p0, CGA_PALETTES.p1],
      intense: [CGA_PALETTES.p0i, CGA_PALETTES.p1i],
    },
    sprites: spriteSet(),
    font: glyphs(),
    title: decodeTitle(hexBytes(titleRle)),
    levels,
  };
}
