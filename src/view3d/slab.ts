import * as THREE from "three";
import { SCREEN_W } from "../contracts";

/** Playfield rectangle on the 320x200 screen (15 x 10 cells of 20 x 18 px). */
export const FIELD = { x0: 12, y0: 18, w: 300, h: 180 } as const;
/** Slab thickness and trench depth, in screen pixels (1 world unit = 1 px). */
export const SLAB_T = 18;
export const TRENCH = 16;
export const TILT = Math.PI / 4;

const CHUNK_W = 20;
const CHUNK_H = 18;
const CHUNKS_X = FIELD.w / CHUNK_W;
const CHUNKS_Y = FIELD.h / CHUNK_H;

const SHADE_TOP = 1.0;
const SHADE_WALL = 0.9;
const SHADE_FLOOR = 0.42;

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Quad a-b-c-d; winding is fixed up so the face points along `n`. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uvs: number[][], shade: number): void {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = ab[1] * ac[2] - ab[2] * ac[1];
    const cy = ab[2] * ac[0] - ab[0] * ac[2];
    const cz = ab[0] * ac[1] - ab[1] * ac[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const base = this.pos.length / 3;
    const verts = flip ? [a, d, c, b] : [a, b, c, d];
    const tex = flip ? [uvs[0], uvs[3], uvs[2], uvs[1]] : uvs;
    for (let i = 0; i < 4; i++) {
      this.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.uv.push(tex[i][0], tex[i][1]);
      this.col.push(shade, shade, shade);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The playfield as a tilted slab of earth. Local frame of `inner`:
 * X = screen x, Z = screen y (2D "down"), Y = out of the surface (surface at 0).
 * `root` is tilted so that 2D "down" runs downhill.
 */
export class Slab {
  readonly root = new THREE.Group();
  readonly inner = new THREE.Group();
  private readonly chunks: (THREE.Mesh | null)[] = new Array(CHUNKS_X * CHUNKS_Y).fill(null);
  private readonly last = new Uint8Array(SCREEN_W * 200);
  private first = true;

  constructor(
    private readonly material: THREE.Material,
    private readonly texW: number,
    private readonly texH: number,
  ) {
    this.root.rotation.x = TILT;
    this.inner.position.set(-(FIELD.x0 + FIELD.w / 2), 0, -(FIELD.y0 + FIELD.h / 2));
    this.root.add(this.inner);
    this.inner.add(this.buildBottom());
  }

  /** Rebuilds the chunks whose tunnel pixels changed. */
  update(tunnels: Uint8Array): void {
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        // include a 1px border: walls depend on neighbours
        const u0 = FIELD.x0 + cx * CHUNK_W - 1;
        const v0 = FIELD.y0 + cy * CHUNK_H - 1;
        let changed = this.first;
        for (let v = v0; v < v0 + CHUNK_H + 2 && !changed; v++) {
          const row = v * SCREEN_W;
          for (let u = u0; u < u0 + CHUNK_W + 2; u++) {
            if (tunnels[row + u] !== this.last[row + u]) {
              changed = true;
              break;
            }
          }
        }
        if (changed) this.rebuild(cx, cy, tunnels);
      }
    }
    this.last.set(tunnels);
    this.first = false;
  }

  /** Is the earth dug away at screen pixel (u, v)? Outside the field counts as solid. */
  static dug(tunnels: Uint8Array, u: number, v: number): boolean {
    if (u < FIELD.x0 || v < FIELD.y0 || u >= FIELD.x0 + FIELD.w || v >= FIELD.y0 + FIELD.h) return false;
    return tunnels[v * SCREEN_W + u] !== 0;
  }

  private rebuild(cx: number, cy: number, tunnels: Uint8Array): void {
    const i = cx + cy * CHUNKS_X;
    const old = this.chunks[i];
    if (old) {
      this.inner.remove(old);
      old.geometry.dispose();
    }
    const b = new MeshBuilder();
    const tw = this.texW;
    const th = this.texH;
    // the original tiles its background from (0, 14): drawbackg() in steps of 20 x 4
    const uv = (s: number, t: number) => [s / tw, -(t - 14) / th];
    const u0 = FIELD.x0 + cx * CHUNK_W;
    const v0 = FIELD.y0 + cy * CHUNK_H;
    const floorY = -TRENCH;
    for (let v = v0; v < v0 + CHUNK_H; v++) {
      // merge runs of equal state along the row for tops/floors
      let runStart = u0;
      let runDug = Slab.dug(tunnels, u0, v);
      for (let u = u0; u <= u0 + CHUNK_W; u++) {
        const d = u < u0 + CHUNK_W ? Slab.dug(tunnels, u, v) : !runDug;
        if (d !== runDug || u === u0 + CHUNK_W) {
          const y = runDug ? floorY : 0;
          b.quad(
            [runStart, y, v], [u, y, v], [u, y, v + 1], [runStart, y, v + 1],
            [0, 1, 0],
            [uv(runStart, v), uv(u, v), uv(u, v + 1), uv(runStart, v + 1)],
            runDug ? SHADE_FLOOR : SHADE_TOP,
          );
          runStart = u;
          runDug = d;
        }
      }
      for (let u = u0; u < u0 + CHUNK_W; u++) {
        if (!Slab.dug(tunnels, u, v)) continue;
        // walls of the trench where a dug pixel meets earth
        if (!Slab.dug(tunnels, u - 1, v))
          b.quad([u, floorY, v], [u, 0, v], [u, 0, v + 1], [u, floorY, v + 1], [1, 0, 0],
            [uv(v, floorY), uv(v, 0), uv(v + 1, 0), uv(v + 1, floorY)], SHADE_WALL);
        if (!Slab.dug(tunnels, u + 1, v))
          b.quad([u + 1, floorY, v], [u + 1, 0, v], [u + 1, 0, v + 1], [u + 1, floorY, v + 1], [-1, 0, 0],
            [uv(v, floorY), uv(v, 0), uv(v + 1, 0), uv(v + 1, floorY)], SHADE_WALL);
        if (!Slab.dug(tunnels, u, v - 1))
          b.quad([u, floorY, v], [u, 0, v], [u + 1, 0, v], [u + 1, floorY, v], [0, 0, 1],
            [uv(u, floorY), uv(u, 0), uv(u + 1, 0), uv(u + 1, floorY)], SHADE_WALL);
        if (!Slab.dug(tunnels, u, v + 1))
          b.quad([u, floorY, v + 1], [u, 0, v + 1], [u + 1, 0, v + 1], [u + 1, floorY, v + 1], [0, 0, -1],
            [uv(u, floorY), uv(u, 0), uv(u + 1, 0), uv(u + 1, floorY)], SHADE_WALL);
      }
    }
    // Outer sides of the slab along the field border. They always reach the
    // surface: a tunnel that runs into the border of the field ends at a wall
    // of earth, it never opens a hole through the side of the slab (in the 2D
    // game the field simply ends there and nothing can pass it).
    const x1 = FIELD.x0 + FIELD.w;
    const y1 = FIELD.y0 + FIELD.h;
    const top = 0;
    for (let v = v0; v < v0 + CHUNK_H; v++) {
      if (u0 === FIELD.x0) {
        b.quad([u0, -SLAB_T, v], [u0, top, v], [u0, top, v + 1], [u0, -SLAB_T, v + 1], [-1, 0, 0],
          [uv(v, -SLAB_T), uv(v, top), uv(v + 1, top), uv(v + 1, -SLAB_T)], SHADE_WALL);
      }
      if (u0 + CHUNK_W === x1) {
        b.quad([x1, -SLAB_T, v], [x1, top, v], [x1, top, v + 1], [x1, -SLAB_T, v + 1], [1, 0, 0],
          [uv(v, -SLAB_T), uv(v, top), uv(v + 1, top), uv(v + 1, -SLAB_T)], SHADE_WALL);
      }
    }
    for (let u = u0; u < u0 + CHUNK_W; u++) {
      if (v0 === FIELD.y0) {
        b.quad([u, -SLAB_T, v0], [u, top, v0], [u + 1, top, v0], [u + 1, -SLAB_T, v0], [0, 0, -1],
          [uv(u, -SLAB_T), uv(u, top), uv(u + 1, top), uv(u + 1, -SLAB_T)], SHADE_WALL);
      }
      if (v0 + CHUNK_H === y1) {
        b.quad([u, -SLAB_T, y1], [u, top, y1], [u + 1, top, y1], [u + 1, -SLAB_T, y1], [0, 0, 1],
          [uv(u, -SLAB_T), uv(u, top), uv(u + 1, top), uv(u + 1, -SLAB_T)], SHADE_WALL);
      }
    }
    const mesh = new THREE.Mesh(b.build(), this.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.chunks[i] = mesh;
    this.inner.add(mesh);
  }

  private buildBottom(): THREE.Mesh {
    const b = new MeshBuilder();
    const x0 = FIELD.x0;
    const x1 = FIELD.x0 + FIELD.w;
    const z0 = FIELD.y0;
    const z1 = FIELD.y0 + FIELD.h;
    const y = -SLAB_T;
    b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0],
      [[0, 0], [1, 0], [1, 1], [0, 1]], 0.5);
    return new THREE.Mesh(b.build(), this.material);
  }
}
