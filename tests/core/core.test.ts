// Compares the core with the instrumented Digger Remastered reference
// (tools/reference) time point by time point: positions and state of every
// object, the tunnel map, scores, lives, the random generator, the sound
// commands and a hash of the whole CGA screen - plus complete screens at
// sampled points.
//
// The fixtures are produced by tools/reference/gen-fixtures.sh from the scripts
// in tests/core/scenarios.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseScript, runScript } from "./replay";
import { loadDrf } from "./drf";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = resolve(HERE, "scenarios");
const FIXTURES = resolve(HERE, "fixtures");
const ROOT = resolve(HERE, "../..");

interface Fixture {
  lines: string[];
  screens: Map<number, string>;
}

function readFixture(name: string): Fixture {
  const text = new TextDecoder().decode(gunzipSync(readFileSync(resolve(FIXTURES, `${name}.trace.gz`))));
  const lines: string[] = [];
  const screens = new Map<number, string>();
  for (const line of text.split("\n")) {
    if (line === "") continue;
    if (line.startsWith("#fb ")) {
      const sp = line.indexOf(" ", 4);
      screens.set(Number(line.slice(4, sp)), line.slice(sp + 1));
    } else lines.push(line);
  }
  return { lines, screens };
}

function describeDiff(t: number, expected: string, actual: string): string {
  const e = expected.split(" ");
  const a = (actual ?? "").split(" ");
  const fields: string[] = [];
  for (let i = 0; i < Math.max(e.length, a.length); i++)
    if (e[i] !== a[i]) fields.push(`  field ${i}: reference ${e[i]} / core ${a[i]}`);
  return `time point ${t} differs:\n  reference: ${expected}\n  core:      ${actual}\n${fields.join("\n")}`;
}

function compare(name: string, lines: string[], screens: Map<number, string>): void {
  const fixture = readFixture(name);
  const n = Math.min(lines.length, fixture.lines.length);
  for (let i = 0; i < n; i++)
    if (lines[i] !== fixture.lines[i]) throw new Error(describeDiff(i, fixture.lines[i], lines[i]));
  expect(lines.length, "number of time points").toBe(fixture.lines.length);
  for (const [t, hex] of fixture.screens) expect(screens.get(t), `screen at time point ${t}`).toBe(hex);
  expect(fixture.lines.length).toBeGreaterThan(0);
}

describe("core reproduces the reference", () => {
  const scripts = readdirSync(SCENARIOS)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  for (const file of scripts) {
    const name = file.replace(/\.txt$/, "");
    const text = readFileSync(resolve(SCENARIOS, file), "utf8");
    const drf = /^#\s*drf\s+(\S+)/m.exec(text)?.[1];
    // recorded games live in the reference repository; without it, skip them
    const missing = drf !== undefined && !existsSync(resolve(ROOT, drf));
    it.skipIf(missing)(name, () => {
      const script = parseScript(text);
      const drfPath = drf;
      const playback = drfPath ? loadDrf(readFileSync(resolve(ROOT, drfPath), "utf8")) : undefined;
      const run = runScript(script, playback ? { playback } : {}, script.screensAt);
      compare(name, run.lines, run.screens);
    }, 300_000);
  }
});
