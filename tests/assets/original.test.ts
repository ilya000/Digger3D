// The data extracted from the original DIGGER.COM must equal what Digger Remastered
// took from it, apart from the few places where Remastered changed the original.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { originalBundle } from "../../src/assets/fromOriginal";
import { ORIGINAL_SHA256 } from "../../src/assets/original";
import { standinAssets } from "../../src/assets/standin";

type Tree = Record<string, unknown>;

function diffPaths(a: unknown, b: unknown, path: string, out: string[]): void {
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) {
      out.push(`${path} (shape)`);
      return;
    }
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) {
        out.push(path);
        return;
      }
    return;
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    const keys = new Set([...Object.keys(a as Tree), ...Object.keys(b as Tree)]);
    for (const k of keys) diffPaths((a as Tree)[k], (b as Tree)[k], `${path}.${k}`, out);
    return;
  }
  if (a !== b) out.push(`${path} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
}

describe("original DIGGER.COM extraction", () => {
  const orig = originalBundle();

  it("comes from the expected file", () => {
    const path = fileURLToPath(new URL("../../tools/extract/manifest.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    expect(ORIGINAL_SHA256).toBe(manifest.source.sha256);
  });

  it("levels and palettes match Remastered", () => {
    expect(orig.levels).toEqual(standinAssets.levels);
    expect(orig.palettes).toEqual(standinAssets.palettes);
  });

  it("sprites match Remastered except where Remastered changed the original", () => {
    const diffs: string[] = [];
    diffPaths(orig.sprites, standinAssets.sprites, "sprites", diffs);
    // Fireball / explosion frames: the original draws 8x8 from 15-byte blocks, so the
    // last byte comes from the following mask (a stray pixel Remastered cleaned up).
    // Spare-life icons: Remastered added masks the original does not have.
    const expected = /^sprites\.(fireball|explosion)\.\d+\.(color|opaque)$|^sprites\.(life|lifePlayer2|lifeEmpty)\.(color|opaque)$/;
    expect(diffs.filter((d) => !expected.test(d))).toEqual([]);
  });

  it("font matches Remastered; the original has no colon", () => {
    const diffs: string[] = [];
    diffPaths(orig.font, standinAssets.font, "font", diffs);
    expect(diffs.filter((d) => !d.startsWith("font.:"))).toEqual([]);
    expect(orig.font[":"]).toBeUndefined();
  });

  it("title is the original CGA screen: two boxes and the copyright line", () => {
    const px = (x: number, y: number) => orig.title[y * 320 + x];
    // magenta (colour 2) frame: top edge, left edge, middle divider
    expect(px(100, 18)).toBe(2);
    expect(px(1, 100)).toBe(2);
    expect(px(161, 100)).toBe(2);
    // inside of the boxes is empty
    expect(px(80, 100)).toBe(0);
    expect(px(240, 100)).toBe(0);
    // the "(c) Windmill Software 1983" line at the bottom is drawn in colour 3
    let white = 0;
    for (let y = 185; y < 200; y++) for (let x = 0; x < 320; x++) if (px(x, y) === 3) white++;
    expect(white).toBeGreaterThan(200);
  });
});
