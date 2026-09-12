// The data the game ships is the Digger Remastered data with the corrections in
// src/assets/corrections.ts applied (see docs/ASSETS.md). This checks that the
// result is the 1983 data exactly, by comparing it with what tools/extract reads
// out of a copy of DIGGER.COM.
//
// That copy is not part of the repository, so these tests run only where it is
// present: put the original next to `assets/original/Digger83/digger.com` and
// run `node tools/extract/extract.ts` to produce `src/assets/original.ts`.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AssetBundle } from "../../src/assets/types";
import { gameAssets } from "../../src/assets/game";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EXTRACTED = resolve(ROOT, "src/assets/original.ts");
const BUNDLE = pathToFileURL(resolve(ROOT, "tools/extract/fromOriginal.ts")).href;
const have = existsSync(EXTRACTED);

/** Every place the two bundles differ, as "path: how many values". */
function differences(mine: AssetBundle, original: AssetBundle): string[] {
  const out: string[] = [];
  const count = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
    let n = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
    return n;
  };
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (a == null || b == null) {
      if (a !== b) out.push(`${path}: missing on one side`);
      return;
    }
    if (Array.isArray(a)) {
      a.forEach((v, i) => walk(v, (b as unknown[])[i], `${path}[${i}]`));
      return;
    }
    const img = a as { color?: Uint8Array; opaque?: Uint8Array; pixels?: Uint8Array };
    const other = b as typeof img;
    if (img.color && img.opaque) {
      const n = count(img.color, other.color!) + count(img.opaque, other.opaque!);
      if (n) out.push(`${path}: ${n}`);
      return;
    }
    if (img.pixels) {
      const n = count(img.pixels, other.pixels!);
      if (n) out.push(`${path}: ${n}`);
      return;
    }
    if (typeof a === "object")
      for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
  };
  walk(mine.sprites, original.sprites, "sprites");
  const keys = (x: AssetBundle) => Object.keys(x.font).sort().join(",");
  if (keys(mine) !== keys(original)) out.push(`font: different glyphs (${keys(mine)} / ${keys(original)})`);
  for (const ch of Object.keys(mine.font)) if (ch in original.font) walk(mine.font[ch], original.font[ch], `font[${JSON.stringify(ch)}]`);
  const titleDiff = count(mine.title, original.title);
  if (titleDiff) out.push(`title: ${titleDiff}`);
  return out;
}

describe.skipIf(!have)("the data we ship is the 1983 data", () => {
  it("comes from the expected file", async () => {
    const { ORIGINAL_SHA256 } = (await import(/* @vite-ignore */ pathToFileURL(EXTRACTED).href)) as { ORIGINAL_SHA256: string };
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "tools/extract/manifest.json"), "utf8"));
    expect(ORIGINAL_SHA256).toBe(manifest.source.sha256);
  });

  it("matches the original sprite for sprite, glyph for glyph, pixel for pixel", async () => {
    const { originalBundle } = (await import(/* @vite-ignore */ BUNDLE)) as { originalBundle: () => AssetBundle };
    expect(differences(gameAssets(), originalBundle())).toEqual([]);
  });

  it("has the original's level maps and palettes", async () => {
    const { originalBundle } = (await import(/* @vite-ignore */ BUNDLE)) as { originalBundle: () => AssetBundle };
    const original = originalBundle();
    const mine = gameAssets();
    expect(mine.levels).toEqual(original.levels);
    expect(mine.palettes).toEqual(original.palettes);
  });

  it("has no colon, as the original's font has none", () => {
    expect(gameAssets().font[":"]).toBeUndefined();
  });
});
