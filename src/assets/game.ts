import { corrections } from "./corrections.ts";
import { remasteredAssets } from "./fromRemastered.ts";
import type { AssetBundle, Glyph, SpriteSet } from "./types.ts";

/**
 * The data the game runs on: the Digger Remastered data (GPL v2) with the few
 * places where it differs from the 1983 original put back - a stray pixel in the
 * fireball and explosion frames, the masks of the spare-life icons, the title
 * picture and the colon that the original's font does not have.
 *
 * Every correction is listed in docs/ASSETS.md and carried as plain numbers in
 * corrections.ts, so what was changed can be read off, which is what the GPL
 * asks of a modified work. `tools/extract` rebuilds the same bundle straight
 * from a copy of DIGGER.COM, and the assets test compares the two.
 */
export function gameAssets(): AssetBundle {
  const sprites = structuredClone(remasteredAssets.sprites) as unknown as Record<string, unknown>;
  for (const [path, patch] of Object.entries(corrections.sprites)) {
    const keys = path.split(".");
    let parent = sprites as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) parent = parent[keys[i]] as Record<string, unknown>;
    const img = parent[keys[keys.length - 1]] as { w: number; h: number; color: Uint8Array; opaque: Uint8Array };
    const color = Uint8Array.from(img.color);
    const opaque = Uint8Array.from(img.opaque);
    for (let i = 0; i < patch.length; i += 3) {
      color[patch[i]] = patch[i + 1];
      opaque[patch[i]] = patch[i + 2];
    }
    parent[keys[keys.length - 1]] = { w: img.w, h: img.h, color, opaque };
  }

  const title = Uint8Array.from(remasteredAssets.title);
  for (let i = 0; i < corrections.title.length; i += 2) title[corrections.title[i]] = corrections.title[i + 1];

  const font: Record<string, Glyph> = {};
  for (const [ch, glyph] of Object.entries(remasteredAssets.font)) {
    if (corrections.fontRemove.includes(ch)) continue;
    const patch = corrections.font[ch];
    if (!patch) {
      font[ch] = glyph;
      continue;
    }
    const pixels = Uint8Array.from(glyph.pixels);
    for (let i = 0; i < patch.length; i += 2) pixels[patch[i]] = patch[i + 1];
    font[ch] = { w: glyph.w, h: glyph.h, pixels };
  }

  return {
    source: "remastered+corrections",
    palettes: remasteredAssets.palettes,
    sprites: sprites as unknown as SpriteSet,
    font,
    title,
    levels: remasteredAssets.levels,
  };
}
