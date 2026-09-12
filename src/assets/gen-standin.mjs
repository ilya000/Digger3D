#!/usr/bin/env node
// Builds the TEMPORARY asset stand-in `src/assets/standin.ts` from the Digger
// Remastered data in vendor/digger (cgagrafx.c, alpha.c, title_gz.c, game.c).
// That data was itself taken from the original 1983 program, so the extracted
// bundle (`src/assets/original.ts`) must come out identical to it.
//
//   node src/assets/gen-standin.mjs            regenerate standin.ts (+ the CGA title
//                                              used by tools/reference)
//   node src/assets/gen-standin.mjs --check [src/assets/original.ts]
//                                              compare an extracted bundle with the
//                                              Remastered data, item by item
//
// The title picture is the one exception: the Remastered sources only contain
// the 640x400 VGA title, so the stand-in title is a 2:1 downsample of it with
// the colours mapped to CGA palette 0. The real CGA title must come from the
// original program; --check reports the title separately.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const VENDOR = resolve(ROOT, "vendor/digger");

// ---------------------------------------------------------------- C parsing

function cArrays(src) {
  const out = new Map();
  const re = /static const uint8_t (\w+)\[[^\]]*\]\s*=\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const bytes = [...m[2].matchAll(/0x([0-9a-fA-F]+)|\b(\d+)\b/g)].map((x) =>
      x[1] !== undefined ? parseInt(x[1], 16) : parseInt(x[2], 10),
    );
    out.set(m[1], Uint8Array.from(bytes));
  }
  return out;
}

function pointerTable(src, name) {
  const m = new RegExp(`${name}\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}`).exec(src);
  if (!m) throw new Error(`table ${name} not found`);
  const body = m[1].replace(/\/\*.*?\*\//g, "");
  return body.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// ---------------------------------------------------------------- sprites

// Size (bytes x rows; one byte = 4 pixels) of every entry of cgatable, as the
// game draws them.
function spriteDims(index) {
  if (index <= 79 || index === 81) return [4, 15];
  if (index === 80) return [4, 14];
  if ((index >= 82 && index <= 93) || index >= 114) return [2, 8];
  if (index >= 94 && index <= 101) return [5, 4];
  if (index === 102 || index === 104) return [2, 18];
  if (index === 103 || index === 105 || index === 106) return [6, 6];
  if (index === 107) return [6, 8];
  if (index === 108 || index === 109) return [4, 10];
  if (index >= 110 && index <= 113) return [4, 12];
  throw new Error(`no size for sprite ${index}`);
}

function decodeSprite(data, mask, wb, h) {
  const w = wb * 4;
  const color = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let b = 0; b < wb; b++) {
      const d = data[y * wb + b];
      const mk = mask[y * wb + b];
      for (let k = 0; k < 4; k++) {
        const sh = 6 - 2 * k;
        const mp = (mk >> sh) & 3;
        const dp = (d >> sh) & 3;
        if (mp !== 0 && mp !== 3) throw new Error("partial mask pixel");
        if (mp === 3 && dp !== 0) throw new Error("data under mask");
        const i = y * w + b * 4 + k;
        color[i] = dp;
        opaque[i] = mp === 0 ? 1 : 0;
      }
    }
  }
  return { w, h, color, opaque };
}

function loadSprites() {
  const src = readFileSync(resolve(VENDOR, "cgagrafx.c"), "utf8");
  const arrays = cArrays(src);
  const names = pointerTable(src, "cgatable");
  const table = [];
  for (let i = 0; i < names.length / 2; i++) {
    const [wb, h] = spriteDims(i);
    table.push(decodeSprite(arrays.get(names[2 * i]), arrays.get(names[2 * i + 1]), wb, h));
  }
  const s = (i) => table[i];
  const three = (i) => [s(i), s(i + 1), s(i + 2)];
  return {
    digger: {
      right: three(1), rightReloading: three(4),
      up: three(7), upReloading: three(10),
      left: three(13), leftReloading: three(16),
      down: three(19), downReloading: three(22),
      dead: s(25),
      grave: [s(26), s(27), s(28), s(29), s(30)],
    },
    bag: s(62), bagRight: s(63), bagLeft: s(64), bagFalling: s(65),
    gold: three(66),
    nobbin: three(69), nobbinDead: s(72),
    hobbinRight: three(73), hobbinRightDead: s(76),
    hobbinLeft: three(77), hobbinLeftDead: s(80),
    bonus: s(81),
    fireball: three(82), explosion: three(85),
    emerald: s(108), emeraldHole: s(109),
    earth: [94, 95, 96, 97, 98, 99, 100, 101].map(s),
    blobs: { right: s(102), top: s(103), left: s(104), bottom: s(105), square: s(106), furry: s(107) },
    life: s(110), lifePlayer2: s(111), lifeEmpty: s(112),
  };
}

// ---------------------------------------------------------------- font

function loadFont() {
  const src = readFileSync(resolve(VENDOR, "alpha.c"), "utf8");
  const arrays = cArrays(src);
  const names = pointerTable(src, "ascii2cga");
  const font = {};
  for (let i = 0; i < names.length; i++) {
    const ch = String.fromCharCode(32 + i);
    if (names[i] === "0" || ch !== ch.toUpperCase()) continue;
    const data = arrays.get(names[i]);
    const pixels = new Uint8Array(144);
    for (let y = 0; y < 12; y++)
      for (let b = 0; b < 3; b++)
        for (let k = 0; k < 4; k++) pixels[y * 12 + b * 4 + k] = (data[y * 3 + b] >> (6 - 2 * k)) & 3;
    font[ch] = { w: 12, h: 12, pixels };
  }
  return font;
}

// ---------------------------------------------------------------- title

const VGA_TO_CGA = new Map([[0, 0], [4, 2], [7, 1], [8, 1], [15, 3]]);

function loadTitle() {
  const src = readFileSync(resolve(VENDOR, "title_gz.c"), "utf8");
  const m = /title_gz\[CTITLELEN\]\s*=\s*\{([^}]*)\}/.exec(src);
  const gz = Uint8Array.from(m[1].match(/\d+/g).map(Number));
  const vga = inflateSync(gz);
  if (vga.length !== 640 * 400) throw new Error("unexpected title size");
  const title = new Uint8Array(320 * 200);
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 320; x++) {
      const c = VGA_TO_CGA.get(vga[2 * y * 640 + 2 * x]);
      if (c === undefined) throw new Error("unmapped title colour");
      title[y * 320 + x] = c;
    }
  return title;
}

// ---------------------------------------------------------------- levels

function loadLevels() {
  const src = readFileSync(resolve(VENDOR, "game.c"), "utf8");
  const body = /\.leveldat\s*=\s*\{(.*)\}\s*\}\s*;/s.exec(src)[1];
  const rows = [...body.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  if (rows.length !== 80) throw new Error("expected 80 level rows");
  const levels = [];
  for (let l = 0; l < 8; l++) levels.push(rows.slice(l * 10, l * 10 + 10));
  return levels;
}

// ---------------------------------------------------------------- palettes

// The CGA hardware colours for palette 0/1 at low/high intensity, background black.
const PALETTES = {
  normal: [
    [[0, 0, 0], [0, 170, 0], [170, 0, 0], [170, 85, 0]],
    [[0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170]],
  ],
  intense: [
    [[0, 0, 0], [85, 255, 85], [255, 85, 85], [255, 255, 85]],
    [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]],
  ],
};

export function buildRemasteredBundle() {
  return {
    source: "standin",
    palettes: PALETTES,
    sprites: loadSprites(),
    font: loadFont(),
    title: loadTitle(),
    levels: loadLevels(),
  };
}

// ---------------------------------------------------------------- canonical form

/** Flattens a bundle into path -> string, typed arrays as hex, for comparisons. */
function canonical(value, path = "", out = new Map()) {
  if (value instanceof Uint8Array) {
    out.set(path, Buffer.from(value).toString("hex"));
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => canonical(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const k of Object.keys(value).sort()) canonical(value[k], path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, String(value));
  }
  return out;
}

// ---------------------------------------------------------------- emitting standin.ts

function pack2bpp(px) {
  const out = new Uint8Array(Math.ceil(px.length / 4));
  for (let i = 0; i < px.length; i++) out[i >> 2] |= (px[i] & 3) << (6 - 2 * (i & 3));
  return Buffer.from(out).toString("base64");
}

function packBits(bits) {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
  return Buffer.from(out).toString("base64");
}

function emitValue(v, indent) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (v.length > 0 && typeof v[0] === "number") return `[${v.join(", ")}]`;
    if (v.length > 0 && typeof v[0] === "string") return `[\n${v.map((s) => `${pad}  ${JSON.stringify(s)},`).join("\n")}\n${pad}]`;
    return `[\n${v.map((x) => `${pad}  ${emitValue(x, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  if (v && typeof v === "object" && "opaque" in v)
    return `sp(${v.w}, ${v.h}, "${pack2bpp(v.color)}", "${packBits(v.opaque)}")`;
  if (v && typeof v === "object" && "pixels" in v) return `gl("${pack2bpp(v.pixels)}")`;
  if (v instanceof Uint8Array) return `px(${v.length}, "${pack2bpp(v)}")`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    return `{\n${keys.map((k) => `${pad}  ${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}: ${emitValue(v[k], indent + 1)},`).join("\n")}\n${pad}}`;
  }
  return JSON.stringify(v);
}

function emitStandin(bundle) {
  const { palettes, ...rest } = bundle;
  return `// TEMPORARY STAND-IN for the assets of the original 1983 DIGGER program.
//
// GENERATED by src/assets/gen-standin.mjs from the Digger Remastered data in
// vendor/digger (cgagrafx.c, alpha.c, title_gz.c, game.c) - do not edit.
// It is replaced by src/assets/original.ts produced by the extractor; run
// \`node src/assets/gen-standin.mjs --check\` to verify that bundle against this data.
// The title picture here is only a downsample of the Remastered VGA title.

import type { Palette, SpriteImage } from "../contracts";
import type { AssetBundle, Glyph } from "./types";

function unpack2bpp(n: number, b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 2) >> (6 - 2 * (i & 3))) & 3;
  return out;
}

function unpackBits(n: number, b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return out;
}

function sp(w: number, h: number, color: string, opaque: string): SpriteImage {
  return { w, h, color: unpack2bpp(w * h, color), opaque: unpackBits(w * h, opaque) };
}

function gl(pixels: string): Glyph {
  return { w: 12, h: 12, pixels: unpack2bpp(144, pixels) };
}

function px(n: number, data: string): Uint8Array {
  return unpack2bpp(n, data);
}

const palettes: { normal: [Palette, Palette]; intense: [Palette, Palette] } = ${JSON.stringify(palettes)};

export const standinAssets: AssetBundle = {
  palettes,
  ${Object.entries(rest).map(([k, v]) => `${k}: ${emitValue(v, 1)},`).join("\n  ")}
};
`;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const bundle = buildRemasteredBundle();
  if (args[0] === "--check") {
    const file = resolve(args[1] ?? resolve(HERE, "original.ts"));
    const mod = await import(pathToFileURL(file).href);
    const other = Object.values(mod).find((v) => v && typeof v === "object" && "sprites" in v);
    if (!other) throw new Error(`${file} exports no AssetBundle`);
    const a = canonical({ ...bundle, source: "" });
    const b = canonical({ ...other, source: "" });
    let bad = 0;
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      if (a.get(key) === b.get(key)) continue;
      if (key === "title") {
        console.log("title: differs (expected: the stand-in title is only a VGA downsample)");
        continue;
      }
      bad++;
      console.log(`MISMATCH ${key}\n  remastered: ${a.get(key)?.slice(0, 120)}\n  extracted:  ${b.get(key)?.slice(0, 120)}`);
    }
    console.log(bad === 0 ? "OK: extracted bundle matches the Remastered data" : `${bad} mismatches`);
    process.exit(bad === 0 ? 0 : 1);
  }
  writeFileSync(resolve(HERE, "standin.ts"), emitStandin(bundle));
  const refData = resolve(ROOT, "tools/reference/data");
  mkdirSync(refData, { recursive: true });
  writeFileSync(resolve(refData, "title_cga.bin"), bundle.title);
  console.log("wrote src/assets/standin.ts and tools/reference/data/title_cga.bin");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
