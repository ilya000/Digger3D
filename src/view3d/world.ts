import * as THREE from "three";
import { FIELD, TILT } from "./slab";

const BLOCK = 10;
const RADIUS = 46; // blocks from the centre in each direction
const HALF_W = FIELD.w / 2;
const HALF_D = (FIELD.h / 2) * Math.cos(TILT);
const RISE = (FIELD.h / 2) * Math.sin(TILT);

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number): number {
  return smoothNoise(x, y) * 0.6 + smoothNoise(x * 2.1, y * 2.1) * 0.3 + smoothNoise(x * 4.3, y * 4.3) * 0.1;
}

/** Height of the hillside the slab is set into (world units), before quantising. */
function hillHeight(x: number, z: number): number {
  // the slope plane of the slab, extended sideways and flattening at top and bottom
  const slope = Math.max(-RISE - 20, Math.min(RISE + 20, -z * Math.tan(TILT)));
  const away = Math.max(0, Math.abs(x) - HALF_W - 20) + Math.max(0, Math.abs(z) - HALF_D - 30);
  const bumps = (fbm(x / 90, z / 90) - 0.5) * Math.min(90, 10 + away * 0.45);
  return slope - 8 + bumps;
}

/** A Minecraft-like voxel landscape around the playfield, with trees and square clouds. */
export class World {
  readonly group = new THREE.Group();
  private readonly clouds: THREE.InstancedMesh;
  private readonly cloudBase: THREE.Vector3[] = [];

  constructor() {
    this.group.add(this.buildTerrain());
    this.clouds = this.buildClouds();
    this.group.add(this.clouds);
  }

  update(timeSec: number): void {
    const m = new THREE.Matrix4();
    const span = RADIUS * BLOCK * 2.4;
    for (let i = 0; i < this.cloudBase.length; i++) {
      const b = this.cloudBase[i];
      let x = b.x + timeSec * 6;
      x = ((((x + span / 2) % span) + span) % span) - span / 2;
      m.makeTranslation(x, b.y, b.z);
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  private buildTerrain(): THREE.Group {
    const g = new THREE.Group();
    const grassTop = new THREE.MeshLambertMaterial({ color: 0x6aa84f });
    const grassSide = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const dirt = new THREE.MeshLambertMaterial({ color: 0x7a4f27 });
    const box = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    // materials per face: +x -x +y -y +z -z
    const topMats = [grassSide, grassSide, grassTop, dirt, grassSide, grassSide];

    type Cell = { x: number; z: number; top: number };
    const cells: Cell[] = [];
    const heights = new Map<string, number>();
    for (let bz = -RADIUS; bz <= RADIUS; bz++) {
      for (let bx = -RADIUS; bx <= RADIUS; bx++) {
        const x = bx * BLOCK;
        const z = bz * BLOCK;
        // leave room for the slab: its footprint is covered by the slab itself
        const inside = Math.abs(x) < HALF_W + BLOCK * 0.5 && Math.abs(z) < HALF_D + BLOCK * 0.5;
        const top = Math.round(hillHeight(x, z) / BLOCK);
        heights.set(`${bx},${bz}`, inside ? -1000 : top);
        if (!inside) cells.push({ x: bx, z: bz, top });
      }
    }
    const tops = new THREE.InstancedMesh(box, topMats, cells.length);
    const under: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      m.makeTranslation(c.x * BLOCK, c.top * BLOCK, c.z * BLOCK);
      tops.setMatrixAt(i, m);
      // fill downward so step sides are closed
      let lowest = c.top;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = heights.get(`${c.x + dx},${c.z + dz}`);
        if (n !== undefined && n > -1000) lowest = Math.min(lowest, n);
      }
      for (let y = c.top - 1; y >= lowest - 1; y--)
        under.push(new THREE.Matrix4().makeTranslation(c.x * BLOCK, y * BLOCK, c.z * BLOCK));
    });
    const fill = new THREE.InstancedMesh(box, dirt, Math.max(1, under.length));
    under.forEach((mm, i) => fill.setMatrixAt(i, mm));
    g.add(tops, fill);

    // a few voxel trees on the grass
    const trunk = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    const leaves = new THREE.MeshLambertMaterial({ color: 0x3f7f2f });
    const treeCells = cells.filter((c) => hash(c.x * 7, c.z * 13) > 0.993 &&
      (Math.abs(c.x * BLOCK) > HALF_W + 40 || Math.abs(c.z * BLOCK) > HALF_D + 40));
    for (const c of treeCells) {
      const base = new THREE.Vector3(c.x * BLOCK, c.top * BLOCK, c.z * BLOCK);
      for (let k = 1; k <= 4; k++) {
        const t = new THREE.Mesh(box, trunk);
        t.position.copy(base).add(new THREE.Vector3(0, k * BLOCK, 0));
        g.add(t);
      }
      for (let dy = 4; dy <= 6; dy++)
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            if (dy === 6 && (dx !== 0 || dz !== 0) && Math.abs(dx) + Math.abs(dz) > 1) continue;
            if (dy < 6 && dx === 0 && dz === 0) continue;
            const l = new THREE.Mesh(box, leaves);
            l.position.copy(base).add(new THREE.Vector3(dx * BLOCK, dy * BLOCK, dz * BLOCK));
            g.add(l);
          }
    }
    return g;
  }

  private buildClouds(): THREE.InstancedMesh {
    const size = 24;
    const geo = new THREE.BoxGeometry(size, 6, size);
    // Minecraft clouds are flat bright white from every side
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    const n = 60;
    const cells: THREE.Vector3[] = [];
    for (let z = -n; z <= n; z++)
      for (let x = -n; x <= n; x++)
        if (fbm(x / 5 + 100, z / 5 + 40) > 0.62) cells.push(new THREE.Vector3(x * size, 230, z * size));
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    cells.forEach((c) => this.cloudBase.push(c));
    mesh.frustumCulled = false;
    return mesh;
  }
}
