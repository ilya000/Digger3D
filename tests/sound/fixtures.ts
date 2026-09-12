// Loads the reference fixtures produced by tools/reference-sound (see its
// build.sh) and parses the scenario scripts they embed.

import type { SoundCommand } from "../../src/sound/machine";
import type { ScriptEntry } from "../../src/sound/synth";

export interface Fixture {
  name: string;
  script: string;
  rate: number;
  samples: number;
  acks: { what: string; tick: number }[];
  raw: string;
  fltStart: number;
  flt: string;
}

const files = import.meta.glob("./fixtures/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const fixtures: Fixture[] = Object.values(files)
  .map((s) => JSON.parse(s) as Fixture)
  .sort((a, b) => a.name.localeCompare(b.name));

async function gunzip(b64: string): Promise<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** The unfiltered reference PCM (int16 values). */
export async function referenceRaw(f: Fixture): Promise<Int16Array> {
  const runs = new Int32Array(await gunzip(f.raw));
  const out = new Int16Array(f.samples);
  let p = 0;
  for (let i = 0; i < runs.length; i += 2) {
    out.fill(runs[i]!, p, p + runs[i + 1]!);
    p += runs[i + 1]!;
  }
  return out;
}

/** One second of the SDL-filtered reference PCM, starting at f.fltStart. */
export async function referenceFiltered(f: Fixture): Promise<Int16Array> {
  return new Int16Array(await gunzip(f.flt));
}

/** Parses the harness script format (see tools/reference-sound/harness.c). */
export function parseScript(text: string): { seconds: number; rate: number; entries: ScriptEntry[] } {
  let seconds = 10;
  let rate = 44100;
  const entries: ScriptEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const w = line.split(/\s+/);
    if (w[0] === "seconds") {
      seconds = Number(w[1]);
      continue;
    }
    if (w[0] === "rate") {
      rate = Number(w[1]);
      continue;
    }
    const tick = Number(w[0]);
    const kind = w[1]!;
    let event: SoundCommand;
    if (kind === "music") event = { kind: "music", tune: w[2] as "main" | "bonus" | "dirge" | "off" };
    else if (kind === "enable") event = { kind: "enable", what: w[2] as "sound" | "music", on: w[3] === "1" };
    else if (kind === "start" || kind === "stop")
      event = w[3] === undefined ? { kind, sound: w[2]! } : { kind, sound: w[2]!, arg: Number(w[3]) };
    else throw new Error(`bad script line: ${raw}`);
    entries.push({ tick, event });
  }
  return { seconds, rate, entries };
}

/** Sample indices where the signal changes value. */
export function transitions(pcm: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < pcm.length; i++) if (pcm[i] !== pcm[i - 1]) out.push(i);
  return out;
}

/** Fraction of `ref` transitions that `ours` has within ±tol samples. */
export function edgeMatch(ref: number[], ours: number[], tol = 1): number {
  if (ref.length === 0) return ours.length === 0 ? 1 : 0;
  let j = 0;
  let hit = 0;
  for (const t of ref) {
    while (j < ours.length && ours[j]! < t - tol) j++;
    if (j < ours.length && Math.abs(ours[j]! - t) <= tol) hit++;
  }
  return hit / ref.length;
}
