import * as THREE from "three";

/** A sprite ready to be turned into voxels: RGB per opaque pixel, null = empty. */
export interface PixelArt {
  w: number;
  h: number;
  rgb: (readonly [number, number, number] | null)[];
}

export interface VoxelOptions {
  /** Thickness of the thinnest (edge) pixels, in voxels. */
  minDepth: number;
  /** Thickness at the fattest point. */
  maxDepth: number;
  /** Extra thickness per pixel of distance from the silhouette edge. */
  depthStep: number;
}

export interface RoundOptions {
  /** Largest half-thickness, in voxels. */
  maxRadius: number;
  /** Half-thickness of the thinnest parts (legs, antennae). */
  minRadius: number;
}

type Color = readonly [number, number, number];

/**
 * Builds a voxel mesh from pixel art. `half(x, y)` is the half-thickness of the
 * column at that pixel and `side(x, y)` the colour of its sides; the front and back
 * caps always keep the sprite's own colour, so the artwork stays readable head-on.
 * Model space: sprite x -> +X, sprite up -> +Y, thickness along Z (centred),
 * origin at the bottom centre.
 */
function build(
  art: PixelArt,
  half: (x: number, y: number) => number,
  side: (x: number, y: number) => Color,
): THREE.BufferGeometry {
  const { w, h } = art;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && art.rgb[y * w + x] !== null;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const face = (corners: number[][], n: number[], c: Color, shade: number) => {
    const base = pos.length / 3;
    for (const p of corners) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(n[0], n[1], n[2]);
      col.push((c[0] / 255) * shade, (c[1] / 255) * shade, (c[2] / 255) * shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const ox = -w / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = art.rgb[y * w + x];
      if (!c) continue;
      const hz = half(x, y);
      const sc = side(x, y);
      const x0 = ox + x;
      const x1 = x0 + 1;
      const y1 = h - y;
      const y0 = y1 - 1;
      face([[x0, y0, hz], [x1, y0, hz], [x1, y1, hz], [x0, y1, hz]], [0, 0, 1], c, 1);
      face([[x1, y0, -hz], [x0, y0, -hz], [x0, y1, -hz], [x1, y1, -hz]], [0, 0, -1], c, 1);
      const sides: [number, number, number[], number][] = [
        [x - 1, y, [-1, 0, 0], 0.8],
        [x + 1, y, [1, 0, 0], 0.8],
        [x, y - 1, [0, 1, 0], 1.0],
        [x, y + 1, [0, -1, 0], 0.62],
      ];
      for (const [nx, ny, n, shade] of sides) {
        const nh = solid(nx, ny) ? half(nx, ny) : 0;
        if (nh >= hz) continue;
        for (const [za, zb] of [[nh, hz], [-hz, -nh]]) {
          if (n[0] === -1) face([[x0, y0, za], [x0, y0, zb], [x0, y1, zb], [x0, y1, za]].reverse(), n, sc, shade);
          else if (n[0] === 1) face([[x1, y0, za], [x1, y0, zb], [x1, y1, zb], [x1, y1, za]], n, sc, shade);
          else if (n[1] === 1) face([[x0, y1, za], [x1, y1, za], [x1, y1, zb], [x0, y1, zb]].reverse(), n, sc, shade);
          else face([[x0, y0, za], [x1, y0, za], [x1, y0, zb], [x0, y0, zb]], n, sc, shade);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Extrudes pixel art Minecraft-style: pixels further from the outline are thicker,
 * which gives the stepped, rounded look. Good for sprites already drawn from the
 * side, such as the Digger and the Hobbins.
 */
export function voxelize(art: PixelArt, opt: VoxelOptions): THREE.BufferGeometry {
  const { w, h } = art;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && art.rgb[y * w + x] !== null;
  const dist = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dist[y * w + x] = solid(x, y) ? 1000 : 0;
  let changed = true;
  for (let pass = 1; changed; pass++) {
    changed = false;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (dist[y * w + x] !== 1000) continue;
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const d = nx >= 0 && ny >= 0 && nx < w && ny < h ? dist[ny * w + nx] : 0;
            if (d < pass) {
              edge = true;
              break;
            }
          }
        if (edge) {
          dist[y * w + x] = pass;
          changed = true;
        }
      }
  }
  const half = (x: number, y: number) => {
    const d = dist[y * w + x];
    const depth = Math.min(opt.maxDepth, opt.minDepth + (d - 1) * opt.depthStep);
    return Math.max(1, Math.round(depth)) / 2;
  };
  return build(art, half, (x, y) => art.rgb[y * w + x] ?? [0, 0, 0]);
}

/**
 * Turns a sprite drawn face-on (Nobbin, gold bag, emerald, cherries, fireball) into a
 * rounded body: every row becomes a circular cross-section, so the creature has a
 * belly instead of being a flat card. The face keeps the sprite's pixels; the flanks
 * take the row's own body colour.
 */
export function voxelizeRound(art: PixelArt, opt: RoundOptions): THREE.BufferGeometry {
  const { w, h } = art;
  const halfMap = new Float32Array(w * h);
  const sideMap: Color[] = new Array(w * h).fill([0, 0, 0]);
  for (let y = 0; y < h; y++) {
    let x0 = -1;
    let x1 = -1;
    const tally = new Map<string, { n: number; c: Color }>();
    for (let x = 0; x < w; x++) {
      const c = art.rgb[y * w + x];
      if (!c) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
      if (c[0] + c[1] + c[2] === 0) continue; // the black outline is not a body colour
      const key = c.join(",");
      const t = tally.get(key) ?? { n: 0, c };
      t.n++;
      tally.set(key, t);
    }
    if (x0 < 0) continue;
    let body: Color = art.rgb[y * w + x0] ?? [0, 0, 0];
    let best = 0;
    for (const t of tally.values()) if (t.n > best) ((best = t.n), (body = t.c));
    const cx = (x0 + x1) / 2;
    const r = Math.min(opt.maxRadius, (x1 - x0 + 1) / 2);
    for (let x = x0; x <= x1; x++) {
      if (!art.rgb[y * w + x]) continue;
      const dx = (x - cx) / Math.max(1, r);
      const radius = r * Math.sqrt(Math.max(0, 1 - dx * dx));
      halfMap[y * w + x] = Math.max(opt.minRadius, Math.round(radius * 2) / 2);
      sideMap[y * w + x] = body;
    }
  }
  return build(art, (x, y) => halfMap[y * w + x], (x, y) => sideMap[y * w + x]);
}

/** Shared material for voxel models (vertex colours, flat Lambert shading). */
export const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
