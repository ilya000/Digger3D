// 3D art generated from the original 1983 sprites (src/assets/original.ts).
import type { Palette } from "../contracts";
import { decodeCgaSprite, hexBytes } from "../assets/cga";
import { sprites } from "../assets/original";
import type { Art3D } from "./View3D";
import type { PixelArt } from "./voxel";

/** Sprite numbers in the original game. */
export const CH = {
  diggerRight: [1, 2, 3],
  bag: 62,
  gold: [66, 67, 68],
  nobbin: [69, 70, 71],
  nobbinDead: 72,
  hobbinRight: [73, 74, 75],
  hobbinRightDead: 76,
  /** The tombstone rising, lowest first. */
  grave: [26, 27, 28, 29, 30],
  bonus: 81,
  fire: [82, 83, 84],
  /** Background tile of level plan n (1..8) is BACK0 + n. */
  back0: 93,
  emerald: 108,
} as const;

/** Driver's eye in the right-facing digger sprite: the white cabin window. */
const CABIN = { x: 6, y: 3 };

export function spritePixels(ch: number, pal: Palette, opaqueOnly = true): PixelArt {
  const s = sprites[ch];
  if (!s) throw new Error(`sprite ${ch} is not in the original`);
  const img = decodeCgaSprite(hexBytes(s.data), s.mask ? hexBytes(s.mask) : null, s.w, s.h);
  const rgb: PixelArt["rgb"] = [];
  for (let i = 0; i < img.w * img.h; i++)
    rgb.push(!opaqueOnly || img.opaque[i] ? pal[img.color[i]] : null);
  return { w: img.w, h: img.h, rgb };
}

/** Builds the 3D view's art for a level plan (1..8) under the given CGA palette. */
export function originalArt(pal: Palette, levelPlan: number): Art3D {
  return {
    dirt: spritePixels(CH.back0 + levelPlan, pal, false),
    digger: CH.diggerRight.map((c) => spritePixels(c, pal)),
    cabin: CABIN,
    nobbin: CH.nobbin.map((c) => spritePixels(c, pal)),
    nobbinDead: spritePixels(CH.nobbinDead, pal),
    hobbin: CH.hobbinRight.map((c) => spritePixels(c, pal)),
    hobbinDead: spritePixels(CH.hobbinRightDead, pal),
    grave: CH.grave.map((c) => spritePixels(c, pal)),
    bag: spritePixels(CH.bag, pal),
    gold: spritePixels(CH.gold[2], pal),
    emerald: spritePixels(CH.emerald, pal),
    fireball: spritePixels(CH.fire[0], pal),
    bonus: spritePixels(CH.bonus, pal),
  };
}
