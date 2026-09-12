// Compares our offline renderer with PCM produced by the Digger Remastered
// reference sound code (tools/reference-sound) for every scenario: each
// effect alone, each tune (10 s), and overlaps of music and effects.
//
// Metrics
//   exact   - fraction of samples with the identical int16 value
//   run     - longest run of consecutive differing samples. Must be 1: the only
//             differences allowed are isolated samples where an edge falls
//             exactly on a sample instant (the reference computes phase in
//             floating point and lands on either side; we use exact integer
//             phase). A wrong pitch, level or tick would give long runs.
//   edges   - fraction of level changes reproduced within ±1 sample, in
//             both directions (ref→ours / ours→ref)
//   acks    - tick at which levelDone / dirge completed must be identical
//   filter  - SDL-filter output mode: fraction of samples within ±2 LSB of
//             the reference over a 1 s window (each isolated raw difference
//             leaves a ~30-sample decaying trace through the 1 kHz high-pass)

import { afterAll, describe, expect, it } from "vitest";
import { renderOffline } from "../../src/sound/synth";
import type { Waitable } from "../../src/sound/machine";
import {
  edgeMatch,
  fixtures,
  parseScript,
  referenceFiltered,
  referenceRaw,
  transitions,
} from "./fixtures";

const rows: string[] = [];
afterAll(() => {
  console.log(
    ["scenario                   exact  run   edges ref→ours / ours→ref   filter±2", ...rows].join("\n"),
  );
});

describe("PC speaker output matches the reference", () => {
  it("has the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(20);
  });

  for (const f of fixtures) {
    it(f.name, async () => {
      const { seconds, rate, entries } = parseScript(f.script);
      expect(rate).toBe(f.rate);
      const finished: { what: Waitable; tick: number }[] = [];
      const ours = renderOffline(entries, rate, seconds, {
        onFinished: (what, tick) => finished.push({ what, tick }),
      });
      const ref = await referenceRaw(f);
      expect(ours.length).toBe(ref.length);

      const mine = new Int16Array(ours.length);
      let same = 0;
      let run = 0;
      let longest = 0;
      for (let i = 0; i < ours.length; i++) {
        mine[i] = Math.round(ours[i]! * 32768);
        if (mine[i] === ref[i]) {
          same++;
          run = 0;
        } else longest = Math.max(longest, ++run);
      }
      const exact = same / ref.length;
      const tr = transitions(ref);
      const to = transitions(mine);
      const e1 = edgeMatch(tr, to);
      const e2 = edgeMatch(to, tr);

      const flt = renderOffline(entries, rate, seconds, { output: "sdl-filter" });
      const refFlt = await referenceFiltered(f);
      let close = 0;
      for (let i = 0; i < refFlt.length; i++) {
        const v = Math.round(flt[f.fltStart + i]! * 32768);
        if (Math.abs(v - refFlt[i]!) <= 2) close++;
      }
      const fltOk = close / refFlt.length;

      rows.push(
        `${f.name.padEnd(22)} ${(exact * 100).toFixed(4).padStart(9)}%  ${String(longest).padStart(2)}   ${(e1 * 100).toFixed(3).padStart(8)}% / ${(e2 * 100).toFixed(3).padStart(8)}%   ${(fltOk * 100).toFixed(2).padStart(7)}%`,
      );

      expect(finished).toEqual(f.acks);
      expect(longest).toBeLessThanOrEqual(1);
      expect(exact).toBeGreaterThan(0.9995);
      expect(e1).toBeGreaterThan(0.998);
      expect(e2).toBeGreaterThan(0.998);
      expect(fltOk).toBeGreaterThan(0.985);
    });
  }
});
