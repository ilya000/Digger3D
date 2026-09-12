import * as THREE from "three";
import { Dir, FIELD_COLS, type GameView } from "../contracts";
import { FIELD, Slab, TRENCH } from "./slab";
import { voxelize, voxelizeRound, voxelMaterial, type PixelArt } from "./voxel";
import { World } from "./world";

/** Original art the 3D view is generated from. */
export interface Art3D {
  /** Background tile of the field (the dirt pattern), repeated across the slab. */
  dirt: PixelArt;
  /** The digger facing right, its three animation frames. */
  digger: PixelArt[];
  /** Driver's eye position inside the (right-facing) digger sprite, in sprite pixels. */
  cabin: { x: number; y: number };
  nobbin: PixelArt[];
  /** Nobbin squashed by a bag. */
  nobbinDead: PixelArt;
  hobbin: PixelArt[];
  hobbinDead: PixelArt;
  bag: PixelArt;
  gold: PixelArt;
  emerald: PixelArt;
  fireball: PixelArt;
  bonus: PixelArt;
  /** The tombstone rising out of the ground, 5 stages (0 = lowest). */
  grave: PixelArt[];
}

/** Everything built from one Art3D (one level plan in one palette). */
interface ArtMeshes {
  dirt: THREE.DataTexture;
  nobbin: THREE.BufferGeometry[];
  nobbinDead: THREE.BufferGeometry;
  hobbin: THREE.BufferGeometry[];
  hobbinDead: THREE.BufferGeometry;
  bag: THREE.BufferGeometry;
  gold: THREE.BufferGeometry;
  emerald: THREE.BufferGeometry;
  fireball: THREE.BufferGeometry;
  bonus: THREE.BufferGeometry;
  grave: THREE.BufferGeometry[];
  /** The digger's own hood seen from the driver's seat, one per animation
   *  frame - from inside, that is the scoop opening and closing. */
  hood: THREE.BufferGeometry[];
  hoodPos: THREE.Vector3;
}

/** Sprite size used to place actors (their x/y is the sprite's top-left). */
const SPRITE_W = 16;
const SPRITE_H = 15;
const EYE = 9;
const ACTOR_WIDTH = 12; // model thickness across the trench
/** Every earth tile of the original is 20 x 4 pixels (drawbackg). */
const EARTH_TILE = { w: 20, h: 4 };
/** Slab-local "up" (the surface normal). */
const UP = new THREE.Vector3(0, 1, 0);
/** How far a buried object leans out of the wall of the tunnel beside it, and
 *  the height in the wall it does that at (the driver's eye is at EYE). */
const WALL_OUT = 5;
const WALL_EYE = 6;
/** Camera elevations between which a monster leans back, and how far it leans. */
const LEAN_FROM = 0.55;
const LEAN_TO = 1.15;
const LEAN_MAX = Math.PI * 0.42;

type Pose = { x: number; y: number; dir: Dir };

function dirVector(d: Dir): THREE.Vector3 {
  switch (d) {
    case Dir.Left:
      return new THREE.Vector3(-1, 0, 0);
    case Dir.Up:
      return new THREE.Vector3(0, 0, -1);
    case Dir.Down:
      return new THREE.Vector3(0, 0, 1);
    default:
      return new THREE.Vector3(1, 0, 0);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function artToTexture(art: PixelArt): THREE.DataTexture {
  const data = new Uint8Array(art.w * art.h * 4);
  for (let i = 0; i < art.w * art.h; i++) {
    const c = art.rgb[i] ?? [0, 0, 0];
    data.set([c[0], c[1], c[2], 255], i * 4);
  }
  const t = new THREE.DataTexture(data, art.w, art.h);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}

/** The first-person window: the tilted playfield inside a voxel world, seen from the cabin. */
export class View3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1.6, 0.3, 4000);
  private readonly world = new World();
  private readonly slabMaterial: THREE.MeshLambertMaterial;
  private readonly slab: Slab;
  private readonly cockpit = new THREE.Group();
  private readonly hood: THREE.Mesh;
  private readonly monsters: THREE.Mesh[] = [];
  private readonly bags: THREE.Mesh[] = [];
  private readonly emeralds: THREE.InstancedMesh;
  private readonly fireball: THREE.Mesh;
  private readonly bonus: THREE.Mesh;
  private readonly grave: THREE.Mesh;
  private readonly fireLight = new THREE.PointLight(0xffaa33, 0, 60, 1.5);
  /** Geometry per art key (level plan and palette), built when first needed. */
  private readonly builds = new Map<string, ArtMeshes>();
  private art: ArtMeshes | null = null;
  private artKey = "";
  private prev: GameView | null = null;
  private cur: GameView | null = null;
  private prevPoses = new Map<string, Pose>();
  private curPoses = new Map<string, Pose>();
  private readonly camQuat = new THREE.Quaternion();
  private camInit = false;
  /** Whether the camera was in the cabin in the previous frame. */
  private inCabin = false;
  /** Whether the camera is outside the cabin right now (the mouse may turn it). */
  private outside = true;
  /** Free look: where the viewer has dragged the camera to. */
  private readonly orbit = { yaw: 0, pitch: 0, distance: 250, manual: false };
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private readonly start = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x8ec5ff);
    this.scene.fog = new THREE.Fog(0x8ec5ff, 500, 1300);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(180, 400, 260);
    this.scene.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x8a6a4a, 1.8), this.fireLight);
    this.scene.add(this.world.group);

    this.slabMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.slab = new Slab(this.slabMaterial, EARTH_TILE.w, EARTH_TILE.h);
    this.scene.add(this.slab.root);

    const empty = new THREE.BufferGeometry();
    this.emeralds = new THREE.InstancedMesh(empty, voxelMaterial, FIELD_COLS * 10);
    this.emeralds.frustumCulled = false;
    this.emeralds.count = 0;
    this.fireball = new THREE.Mesh(empty, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.bonus = new THREE.Mesh(empty, voxelMaterial);
    this.grave = new THREE.Mesh(empty, voxelMaterial);
    this.fireball.visible = this.bonus.visible = this.grave.visible = false;
    this.slab.inner.add(this.emeralds, this.fireball, this.bonus, this.grave);

    // the cabin: the digger's own hood and scoop in front of and below the driver's eye
    this.hood = new THREE.Mesh(empty, voxelMaterial);
    this.hood.rotation.y = Math.PI / 2; // model +X (sprite facing right) -> camera forward (-Z)
    this.cockpit.add(this.hood);
    this.cockpit.visible = false;
    this.camera.add(this.cockpit);
    this.scene.add(this.camera);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.listenForDragging();
  }

  /**
   * Outside the cabin the world can be turned with the mouse (or a finger):
   * dragging orbits around the middle of the playfield, the wheel comes closer
   * and goes away. Inside the cabin the camera belongs to the digger and the
   * pointer does nothing.
   */
  private listenForDragging(): void {
    const canvas = this.canvas;
    const stop = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // the pointer was never captured (or is already gone)
      }
      canvas.style.cursor = this.outside ? "grab" : "";
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.outside) return;
      this.takeOrbitFromCamera();
      this.dragging = true;
      this.pointer = { x: e.clientX, y: e.clientY };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // captures are a convenience: dragging works without them
      }
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.orbit.yaw -= (e.clientX - this.pointer.x) * 0.008;
      this.orbit.pitch = clamp(this.orbit.pitch + (e.clientY - this.pointer.y) * 0.006, -1.35, 1.35);
      this.pointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.outside) return;
        this.takeOrbitFromCamera();
        this.orbit.distance = clamp(this.orbit.distance * (1 + e.deltaY * 0.0012), 60, 1600);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Starts a free look from wherever the camera happens to be. */
  private takeOrbitFromCamera(): void {
    if (this.orbit.manual) return;
    const p = this.camera.position;
    // before the first frame the camera is still at the origin: start from the
    // distance the close flyover uses
    const d = p.length() > 1 ? p.length() : 250;
    this.orbit.distance = clamp(d, 60, 1600);
    this.orbit.pitch = Math.asin(clamp(p.y / d, -1, 1));
    this.orbit.yaw = Math.atan2(p.x, p.z);
    this.orbit.manual = true;
  }

  /**
   * Selects the art the models are made of. `key` identifies it (level plan and
   * palette); `make` is only called the first time a key is seen, so switching
   * back and forth - the palette flashes in bonus mode - costs nothing.
   */
  setArt(key: string, make: () => Art3D): void {
    if (key === this.artKey && this.art) return;
    let built = this.builds.get(key);
    if (!built) {
      built = this.build(make());
      this.builds.set(key, built);
    }
    this.artKey = key;
    this.art = built;
    this.slabMaterial.map = built.dirt;
    this.slabMaterial.needsUpdate = true;
    this.emeralds.geometry = built.emerald;
    this.fireball.geometry = built.fireball;
    this.bonus.geometry = built.bonus;
    this.hood.geometry = built.hood[0];
    this.hood.position.copy(built.hoodPos);
  }

  private build(art: Art3D): ArtMeshes {
    // Sprites drawn face-on (Nobbin, bag, gold, emerald, cherries, fireball) become
    // rounded bodies, so they look right from the side too; the Hobbins and the
    // digger are already drawn from the side and keep the plain extrusion.
    const round = (a: PixelArt, maxRadius: number) => voxelizeRound(a, { maxRadius, minRadius: 1 });
    const side = (a: PixelArt) => voxelize(a, { minDepth: 6, maxDepth: ACTOR_WIDTH, depthStep: 3 });
    const cab = art.cabin;
    const hoodOf = (frame: PixelArt): PixelArt => ({
      w: frame.w,
      h: frame.h,
      rgb: frame.rgb.map((c, i) => {
        const x = i % frame.w;
        const y = Math.floor(i / frame.w);
        // only what lies below the driver's eye: hood and scoop, never the cabin roof;
        // the sprite's black outline would read as a black patch from inside
        const black = c !== null && c[0] + c[1] + c[2] === 0;
        return y > cab.y + 1 && x > cab.x - 3 && !black ? c : null;
      }),
    });
    const first = art.digger[0];
    const eyeModel = new THREE.Vector3(cab.x + 0.5 - first.w / 2, first.h - cab.y - 0.5, 0);
    return {
      dirt: artToTexture(art.dirt),
      nobbin: art.nobbin.map((a) => round(a, ACTOR_WIDTH / 2)),
      nobbinDead: round(art.nobbinDead, ACTOR_WIDTH / 2),
      hobbin: art.hobbin.map(side),
      hobbinDead: side(art.hobbinDead),
      bag: round(art.bag, 6),
      gold: round(art.gold, 4),
      emerald: round(art.emerald, 4),
      fireball: voxelize(art.fireball, { minDepth: 3, maxDepth: 8, depthStep: 2 }),
      bonus: round(art.bonus, 5),
      grave: art.grave.map((a) => voxelize(a, { minDepth: 4, maxDepth: 10, depthStep: 3 })),
      // the machine is only 16 px long, so from the driver's seat the hood is
      // right under the nose: it is kept narrow and a little lower, enough to
      // frame the view without covering it
      hood: art.digger.map((f) => voxelize(hoodOf(f), { minDepth: 5, maxDepth: 9, depthStep: 2 })),
      hoodPos: eyeModel.applyEuler(new THREE.Euler(0, Math.PI / 2, 0)).negate().add(new THREE.Vector3(0, -1.5, 0)),
    };
  }

  /** Call after every game frame. */
  onGameFrame(view: GameView): void {
    this.prev = this.cur;
    this.cur = view;
    this.prevPoses = this.curPoses;
    this.curPoses = new Map();
    view.diggers.forEach((d, i) => this.curPoses.set(`d${i}`, { x: d.x, y: d.y, dir: d.dir }));
    view.monsters.forEach((m, i) => this.curPoses.set(`m${i}`, { x: m.x, y: m.y, dir: m.dir }));
    view.bags.forEach((b, i) => this.curPoses.set(`b${i}`, { x: b.x, y: b.y, dir: Dir.None }));
    this.slab.update(view.tunnels);
  }

  /** Renders; `alpha` is the fraction of the current game frame that has elapsed. */
  render(alpha: number): void {
    const view = this.cur;
    this.world.update((performance.now() - this.start) / 1000);
    if (view && this.art) {
      this.placeMonsters(view, alpha);
      this.placeBags(view, alpha);
      this.placeEmeralds(view);
      this.placeFireball(view);
      this.placeBonus(view);
      this.placeCamera(view, alpha);
      this.placeGrave(view, alpha);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private pose(key: string, alpha: number): Pose | null {
    const c = this.curPoses.get(key);
    if (!c) return null;
    const p = this.prevPoses.get(key);
    if (!p || Math.abs(p.x - c.x) > 24 || Math.abs(p.y - c.y) > 24) return c;
    return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha, dir: c.dir };
  }

  /** Slab-local position of an actor standing on the trench floor. */
  private floorPoint(x: number, y: number, height = 0): THREE.Vector3 {
    return new THREE.Vector3(x + SPRITE_W / 2, -TRENCH + height, y + SPRITE_H / 2);
  }

  /** How much of a sprite's footprint has been dug out (0 = buried, 1 = in a tunnel). */
  private exposure(view: GameView, x: number, y: number): number {
    let dug = 0;
    let n = 0;
    for (let v = y; v < y + SPRITE_H; v += 2)
      for (let u = x; u < x + SPRITE_W; u += 2) {
        n++;
        if (Slab.dug(view.tunnels, u, v)) dug++;
      }
    return n ? dug / n : 0;
  }

  /**
   * Orientation of a flat, face-on object (emerald, bag, gold): it lies in the
   * earth face-up for a camera looking down, and turns to face the driver who
   * sees it from a tunnel. In between it swings smoothly, so the artwork is
   * readable from everywhere.
   */
  private faceViewer(at: THREE.Vector3): THREE.Quaternion {
    const eye = this.slab.inner.worldToLocal(this.camera.position.clone()).sub(at);
    const elevation = Math.atan2(eye.y, Math.hypot(eye.x, eye.z));
    const t = clamp01((elevation - LEAN_FROM) / (LEAN_TO - LEAN_FROM));
    const lying = t * t * (3 - 2 * t); // 1 = flat on its back, 0 = standing up
    // face-up it keeps the orientation of the 2D sprite; standing up it turns to the viewer
    const yaw = Math.atan2(eye.x, eye.z) * (1 - lying);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(-lying * (Math.PI / 2), yaw, 0, "YXZ"));
  }

  /**
   * Which way a buried object should lean out of the earth: towards the tunnel
   * beside it, if there is one. Without this an emerald in the wall is hidden
   * inside the slab and the driver eats it without ever seeing it.
   */
  private wallOpening(view: GameView, x: number, y: number, w: number, h: number): THREE.Vector3 | null {
    const share = (dx: number, dy: number): number => {
      let dug = 0;
      for (let i = 0; i <= 8; i++) {
        const u = dx === 0 ? x + (w * i) / 8 : dx < 0 ? x - 4 : x + w + 4;
        const v = dy === 0 ? y + (h * i) / 8 : dy < 0 ? y - 4 : y + h + 4;
        if (Slab.dug(view.tunnels, Math.round(u), Math.round(v))) dug++;
      }
      return dug / 9;
    };
    let best: THREE.Vector3 | null = null;
    let bestShare = 0.35; // a real opening, not a stray dug pixel
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const s = share(dx, dy);
      if (s > bestShare) {
        bestShare = s;
        best = new THREE.Vector3(dx, 0, dy);
      }
    }
    return best;
  }

  /**
   * How far a face-on model should lean back for the camera that is looking at
   * it: nothing while the camera is level with it (the cabin), almost flat once
   * the camera is overhead (the attract screen and the flyover).
   */
  private leanToCamera(at: THREE.Vector3): number {
    const eye = this.slab.inner.worldToLocal(this.camera.position.clone()).sub(at);
    const elevation = Math.atan2(eye.y, Math.hypot(eye.x, eye.z));
    const t = clamp01((elevation - LEAN_FROM) / (LEAN_TO - LEAN_FROM));
    return t * t * (3 - 2 * t) * LEAN_MAX; // smooth, so a moving camera does not snap
  }

  /** Depth offset for an object that sticks out of the earth by a third while buried. */
  private embedHeight(exposure: number, objectHeight: number): number {
    const buried = TRENCH - objectHeight / 3; // top third above the surface
    return (1 - Math.min(1, exposure * 1.5)) * buried;
  }

  private placeMonsters(view: GameView, alpha: number): void {
    const art = this.art!;
    const t = view.frame;
    while (this.monsters.length < view.monsters.length) {
      const m = new THREE.Mesh(art.nobbin[0], voxelMaterial);
      this.monsters.push(m);
      this.slab.inner.add(m);
    }
    view.monsters.forEach((m, i) => {
      const mesh = this.monsters[i];
      const p = this.pose(`m${i}`, alpha);
      mesh.visible = (m.alive || m.dying) && !!p;
      if (!mesh.visible || !p) return;
      if (m.dying) mesh.geometry = m.nobbin ? art.nobbinDead : art.hobbinDead;
      else {
        const frames = m.nobbin ? art.nobbin : art.hobbin;
        mesh.geometry = frames[Math.floor(t / 2) % frames.length];
      }
      mesh.position.copy(this.floorPoint(p.x, p.y));
      // stand on the floor (slab normal = +Y locally), face along travel
      const fwd = dirVector(m.dir === Dir.None ? Dir.Left : m.dir);
      const yaw = Math.atan2(-fwd.z, fwd.x) + (m.nobbin ? Math.PI / 2 : 0);
      mesh.quaternion.setFromAxisAngle(UP, yaw);
      // A monster is a picture drawn face-on: from the cabin it is seen from
      // the side and stands upright, but a camera looking down on it would see
      // only the top of its head. The higher the camera, the further it leans
      // back, until from straight above the face looks up like the 2D sprite.
      const lean = this.leanToCamera(mesh.position);
      if (lean > 0) {
        const axis = new THREE.Vector3().crossVectors(fwd, UP).normalize();
        mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, lean));
        // leaning turns it about its feet: lift it so it does not sink into the floor
        mesh.position.y += Math.sin(lean) * SPRITE_H * 0.3;
      }
    });
    for (let i = view.monsters.length; i < this.monsters.length; i++) this.monsters[i].visible = false;
  }

  private placeBags(view: GameView, alpha: number): void {
    const art = this.art!;
    while (this.bags.length < view.bags.length) {
      const m = new THREE.Mesh(art.bag, voxelMaterial);
      this.bags.push(m);
      this.slab.inner.add(m);
    }
    view.bags.forEach((b, i) => {
      const mesh = this.bags[i];
      const p = this.pose(`b${i}`, alpha);
      if (!p) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.geometry = b.gold ? art.gold : art.bag;
      const exposure = b.falling ? 1 : this.exposure(view, Math.round(p.x), Math.round(p.y));
      const h = this.embedHeight(exposure, SPRITE_H);
      mesh.position.copy(this.floorPoint(p.x, p.y, h));
      const wobble = b.wobbling ? Math.sin(view.frame * 1.7) * 0.25 : 0;
      if (exposure < 0.5 && !b.gold) {
        // buried: face-up in the earth from above, and leaning out of the wall of
        // the tunnel beside it so it can be seen from the cabin as well
        mesh.position.z -= SPRITE_H / 2;
        const out = this.wallOpening(view, Math.round(p.x), Math.round(p.y), SPRITE_W, SPRITE_H);
        if (out) mesh.position.addScaledVector(out, WALL_OUT).setY(-TRENCH + WALL_EYE);
        mesh.quaternion.copy(this.faceViewer(mesh.position));
        mesh.rotateZ(wobble);
      } else {
        // dug out: standing in the trench
        mesh.rotation.set(0, Math.PI / 2, wobble);
      }
    });
    for (let i = view.bags.length; i < this.bags.length; i++) this.bags[i].visible = false;
  }

  private placeEmeralds(view: GameView): void {
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (let i = 0; i < view.emeralds.length; i++) {
      if (!view.emeralds[i]) continue;
      const col = i % FIELD_COLS;
      const row = Math.floor(i / FIELD_COLS);
      // where the original draws it: drawemerald(col*20+12, row*18+21), sprite 16x10
      const x = FIELD.x0 + col * 20;
      const y = FIELD.y0 + row * 18 + 3;
      const exposure = this.exposure(view, x, y);
      const pos = new THREE.Vector3(x + 8, -TRENCH + this.embedHeight(exposure, 10), y + 5);
      // still in the earth: lean out of the wall of the tunnel beside it, so the
      // driver catches sight of it before driving into it
      if (exposure < 0.5) {
        const out = this.wallOpening(view, x, y, 16, 10);
        if (out) pos.addScaledVector(out, WALL_OUT).setY(-TRENCH + WALL_EYE);
      }
      m.compose(pos, this.faceViewer(pos), scale);
      this.emeralds.setMatrixAt(n++, m);
    }
    this.emeralds.count = n;
    this.emeralds.instanceMatrix.needsUpdate = true;
  }

  private placeFireball(view: GameView): void {
    const f = view.fireballs[0];
    this.fireball.visible = !!f;
    this.fireLight.intensity = f ? 4000 : 0;
    if (!f) return;
    this.fireball.position.copy(this.floorPoint(f.x - 4, f.y - 4, 6));
    this.fireball.rotation.y = view.frame;
    this.fireLight.position.copy(this.slab.inner.localToWorld(this.fireball.position.clone()));
  }

  /** The bonus cherry: it sits on the surface of the field, not in a tunnel. */
  private placeBonus(view: GameView): void {
    this.bonus.visible = view.bonus.visible && view.inLevel;
    if (!this.bonus.visible) return;
    const exposure = this.exposure(view, view.bonus.x, view.bonus.y);
    this.bonus.position.copy(this.floorPoint(view.bonus.x, view.bonus.y, exposure > 0.5 ? 0 : TRENCH));
    this.bonus.rotation.set(0, Math.PI / 2, 0);
  }

  /** The tombstone that rises where the digger died. */
  private placeGrave(view: GameView, alpha: number): void {
    const art = this.art!;
    const d = view.diggers[0];
    const stage = d ? d.graveStage : -1;
    this.grave.visible = stage >= 0 && view.inLevel;
    if (!this.grave.visible || !d) return;
    const p = this.pose("d0", alpha) ?? d;
    this.grave.geometry = art.grave[Math.min(art.grave.length - 1, stage)];
    this.grave.position.copy(this.floorPoint(p.x, p.y));
    // face whoever is watching
    const eye = this.slab.inner.worldToLocal(this.camera.position.clone());
    this.grave.rotation.set(0, Math.atan2(eye.x - this.grave.position.x, eye.z - this.grave.position.z), 0);
  }

  private placeCamera(view: GameView, alpha: number): void {
    const d = view.diggers[0];
    const p = this.pose("d0", alpha);
    if (!view.inLevel || ((!d || !p) && !this.inCabin)) {
      // no game to look at, or the level is still being drawn: fly over it
      this.inCabin = false;
      this.flyover();
      return;
    }
    if (!d || !p) {
      // the end of a life: the digger is gone, but the camera stays where it was
      this.cockpit.visible = false;
      return;
    }
    this.inCabin = true;
    this.setOutside(false);
    this.cockpit.visible = true;
    // the scoop in front of the driver opens and closes as the machine moves,
    // in step with the sprite the 2D screen is showing
    const art = this.art;
    if (art) this.hood.geometry = art.hood[Math.min(art.hood.length - 1, Math.max(0, d.anim))];
    const fwdLocal = dirVector(d.dir === Dir.None ? Dir.Right : d.dir);
    const eyeLocal = this.floorPoint(p.x, p.y, EYE);
    let targetLocal = eyeLocal.clone().addScaledVector(fwdLocal, 40);
    let roll = 0;
    if (!d.alive) {
      // the machine turns over, then the view rises out of the wreck and watches
      // the tombstone from behind
      const t = d.deathTime;
      const out = clamp01((t - 6) / 12);
      roll = Math.PI * clamp01(t / 7) * (1 - out);
      targetLocal = targetLocal.lerp(this.floorPoint(p.x, p.y, 6), out);
      eyeLocal.addScaledVector(fwdLocal, -46 * out);
      eyeLocal.y += 42 * out;
      this.cockpit.visible = out < 0.5;
    }
    const eye = this.slab.inner.localToWorld(eyeLocal.clone());
    const target = this.slab.inner.localToWorld(targetLocal);
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(this.slab.root.quaternion);
    // mostly the cabin's own "up" (the slab normal), softened towards the sky
    const up = normal.multiplyScalar(0.7).add(new THREE.Vector3(0, 0.3, 0)).normalize();
    if (roll !== 0) up.applyAxisAngle(target.clone().sub(eye).normalize(), roll);
    const look = new THREE.Matrix4().lookAt(eye, target, up);
    const want = new THREE.Quaternion().setFromRotationMatrix(look);
    if (!this.camInit) {
      this.camQuat.copy(want);
      this.camInit = true;
    } else {
      this.camQuat.slerp(want, 0.18);
    }
    this.camera.position.copy(eye);
    this.camera.quaternion.copy(this.camQuat);
  }

  /** "close": the playfield almost face-on, big and readable (title screen).
   *  "wide": the whole landscape from a distance (debug view). */
  flyMode: "close" | "wide" = "close";

  private setOutside(outside: boolean): void {
    if (outside === this.outside) return;
    this.outside = outside;
    this.canvas.style.cursor = outside ? "grab" : "";
  }

  private flyover(): void {
    this.cockpit.visible = false;
    this.setOutside(true);
    const t = (performance.now() - this.start) / 1000;
    if (this.orbit.manual) {
      // turned by hand: orbit the middle of the playfield
      const cp = Math.cos(this.orbit.pitch);
      this.camera.position
        .set(Math.sin(this.orbit.yaw) * cp, Math.sin(this.orbit.pitch), Math.cos(this.orbit.yaw) * cp)
        .multiplyScalar(this.orbit.distance);
    } else if (this.flyMode === "wide") {
      const r = 420;
      this.camera.position.set(Math.sin(t * 0.12) * r, 220, Math.cos(t * 0.12) * r + 120);
    } else {
      // along the slab's own normal, so the map reads like the 2D screen, with a
      // slow drift to keep it alive
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(this.slab.root.quaternion);
      const side = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(n, side).normalize();
      this.camera.position
        .copy(n.multiplyScalar(250))
        .addScaledVector(side, Math.sin(t * 0.13) * 90)
        .addScaledVector(up, Math.cos(t * 0.11) * 50);
    }
    this.camera.lookAt(0, 0, 0);
    this.camQuat.copy(this.camera.quaternion);
    this.camInit = true;
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
