// 3D art generated from the game's own sprites (src/assets/game.ts): the same
// pixels the 2D screen draws, turned into voxel models.
import type { Palette, SpriteImage } from "../contracts";
import type { AssetBundle } from "../assets/types";
import type { Art3D } from "./View3D";
import type { PixelArt } from "./voxel";

/** Driver's eye in the right-facing digger sprite: the white cabin window. */
const CABIN = { x: 6, y: 3 };

/** A sprite in the colours of a CGA palette; transparent pixels become null. */
export function spriteArt(img: SpriteImage, pal: Palette, opaqueOnly = true): PixelArt {
  const rgb: PixelArt["rgb"] = [];
  for (let i = 0; i < img.w * img.h; i++) rgb.push(!opaqueOnly || img.opaque[i] ? pal[img.color[i]] : null);
  return { w: img.w, h: img.h, rgb };
}

/** Builds the 3D view's art for a level plan (1..8) under the given CGA palette. */
export function originalArt(assets: AssetBundle, pal: Palette, levelPlan: number): Art3D {
  const s = assets.sprites;
  const each = (imgs: readonly SpriteImage[]) => imgs.map((i) => spriteArt(i, pal));
  return {
    // the earth tile of this level plan, drawn with its black pixels as well
    dirt: spriteArt(s.earth[levelPlan - 1], pal, false),
    digger: each(s.digger.right),
    cabin: CABIN,
    nobbin: each(s.nobbin),
    nobbinDead: spriteArt(s.nobbinDead, pal),
    hobbin: each(s.hobbinRight),
    hobbinDead: spriteArt(s.hobbinRightDead, pal),
    grave: each(s.digger.grave),
    bag: spriteArt(s.bag, pal),
    gold: spriteArt(s.gold[2], pal),
    emerald: spriteArt(s.emerald, pal),
    fireball: spriteArt(s.fireball[0], pal),
    bonus: spriteArt(s.bonus, pal),
  };
}
