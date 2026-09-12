// Formats the core's state into the same trace lines that the instrumented
// reference writes (tools/reference/harness.c), so the two can be compared
// literally, line by line.

import type { CoreState } from "../../src/core/index";

export function fnv(data: ArrayLike<number>, start = 0x811c9dc5): number {
  let h = start >>> 0;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hex8(v: number): string {
  return (v >>> 0).toString(16).padStart(8, "0");
}

function bit(b: boolean): string {
  return b ? "1" : "0";
}

function fieldHash(field: Uint16Array): number {
  const bytes = new Uint8Array(field.length * 2);
  for (let i = 0; i < field.length; i++) {
    bytes[2 * i] = field[i] & 0xff;
    bytes[2 * i + 1] = field[i] >> 8;
  }
  return fnv(bytes);
}

/** One trace line: time point, its length, palette, screen hash, sounds, game state. */
export function formatLine(t: number, mult: number, s: CoreState): string {
  const parts = [
    `${t} ${mult} ${s.palette}${s.intensity} ${hex8(fnv(s.pixels))} ${s.sound.length ? s.sound.join(",") : "-"}`,
  ];
  if (s.inGame) {
    const d = s.digger;
    parts.push(
      `| c${s.curPlayer} L${s.level[0]},${s.level[1]} S${s.score[0]},${s.score[1]} ` +
        `V${s.lives[0]},${s.lives[1]} R${hex8(s.randv)}`,
    );
    parts.push(
      `D${d.x},${d.y},${d.dir},${d.mdir},${bit(d.alive)},${d.deathStage},${d.deathTime},${d.deathAni},` +
        `${d.bagtime},${d.rechargeTime},${bit(d.notFiring)},${d.emeraldRun},${d.emeraldTime},${d.msc},${bit(d.canFire)}`,
    );
    parts.push(s.fire ? `F${s.fire.x},${s.fire.y},${s.fire.dir},${s.fire.expsn}` : "F-");
    parts.push(`X${bit(s.bonus.visible)},${bit(s.bonus.mode)},${s.bonus.timeLeft},${s.bonus.startTimeLeft}`);
    const mons = s.monsters.slots
      .map((m) =>
        m === null
          ? "-"
          : `${m.x},${m.y},${m.dir},${m.faces},${bit(m.nobbin)},${bit(m.alive)},${m.hnt},${m.t},${m.stime},${m.death}`,
      )
      .join(";");
    parts.push(
      `M${s.monsters.next},${s.monsters.total},${s.monsters.nextTime},${bit(s.monsters.unbonus)} m${mons}`,
    );
    const bags = s.bags.list
      .map((b) =>
        b === null
          ? "-"
          : `${b.x},${b.y},${b.dir},${bit(b.wobbling)},${b.wt},${b.gt},${b.fallh},${bit(b.unfallen)}`,
      )
      .join(";");
    parts.push(`G${s.bags.pushCount},${s.bags.goldTime} b${bags}`);
    const em = new Uint8Array(s.emeralds.length);
    const mask = 1 << s.curPlayer;
    for (let i = 0; i < em.length; i++) em[i] = s.emeralds[i] & mask ? 1 : 0;
    parts.push(`H${hex8(fieldHash(s.field))} E${hex8(fnv(em))}`);
  }
  return parts.join(" ");
}

/** Packs the screen the way the reference dumps it (2 bits per pixel, hex). */
export function packScreen(pixels: Uint8Array): string {
  let out = "";
  for (let i = 0; i < pixels.length; i += 4) {
    const b = (pixels[i] << 6) | (pixels[i + 1] << 4) | (pixels[i + 2] << 2) | pixels[i + 3];
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
