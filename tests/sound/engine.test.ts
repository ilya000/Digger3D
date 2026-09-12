// Headless behaviour of the public engine: how a frame-stepped game loop
// waits for jingles, and that the worklet's chunked rendering is identical to
// renderOffline.

import { describe, expect, it } from "vitest";
import { createSoundEngine } from "../../src/sound/engine";
import { SOUND_NAMES, isSoundName } from "../../src/sound/names";
import { PcSpeakerSynth, renderOffline, samplesPerTick, type ScriptEntry } from "../../src/sound/synth";

const FRAME = 0.08; // the original's 12.5 Hz game frame

/** Frames a game loop spends waiting (handle, then poll+advance per frame). */
function framesWaiting(engine: ReturnType<typeof createSoundEngine>, what: "levelDone" | "dirge"): number {
  let frames = 0;
  while (engine.isBusy(what)) {
    engine.advance(FRAME);
    frames++;
    if (frames > 10000) throw new Error("never finished");
  }
  return frames;
}

describe("sound engine (headless)", () => {
  it("unlock resolves without Web Audio", async () => {
    const e = createSoundEngine();
    await expect(e.unlock()).resolves.toBeUndefined();
    expect(e.audible).toBe(false);
  });

  it("level-done jingle keeps the game waiting for 231 ticks (~3.17 s)", () => {
    const e = createSoundEngine();
    e.handle({ kind: "music", tune: "main" });
    e.advance(2);
    e.handle({ kind: "start", sound: "levelDone" });
    expect(e.isBusy("levelDone")).toBe(true); // busy before the next tick
    const frames = framesWaiting(e, "levelDone");
    const seconds = (231 * samplesPerTick(44100)) / 44100;
    expect(frames).toBe(Math.ceil(seconds / FRAME));
  });

  it("no wait for the jingle when sound is off", () => {
    const e = createSoundEngine();
    e.setSoundEnabled(false);
    e.advance(FRAME);
    e.handle({ kind: "start", sound: "levelDone" });
    expect(e.isBusy("levelDone")).toBe(false);
  });

  it("stop levelDone / stop all abort the wait", () => {
    const e = createSoundEngine();
    e.handle({ kind: "start", sound: "levelDone" });
    e.advance(1);
    expect(e.isBusy("levelDone")).toBe(true);
    e.handle({ kind: "stop", sound: "all" });
    e.advance(FRAME);
    expect(e.isBusy("levelDone")).toBe(false);
  });

  it("dirge: busy until its melody ends, even with music switched off", () => {
    const e = createSoundEngine();
    e.setMusicEnabled(false);
    e.advance(FRAME);
    e.handle({ kind: "music", tune: "dirge" });
    expect(e.isBusy("dirge")).toBe(true);
    const frames = framesWaiting(e, "dirge");
    // reference: the melody ends 512 ticks after the tune starts
    const seconds = (512 * samplesPerTick(44100)) / 44100;
    expect(Math.abs(frames * FRAME - seconds)).toBeLessThan(FRAME * 1.5);
    expect(e.musicEnabled).toBe(false); // restored after the forced dirge
  });

  it("starting another tune ends the dirge wait", () => {
    const e = createSoundEngine();
    e.handle({ kind: "music", tune: "dirge" });
    e.advance(1);
    expect(e.isBusy("dirge")).toBe(true);
    e.handle({ kind: "music", tune: "main" });
    e.advance(FRAME);
    expect(e.isBusy("dirge")).toBe(false);
  });

  it("ignores unknown sound names", () => {
    const e = createSoundEngine();
    e.handle({ kind: "start", sound: "no-such-sound" });
    e.advance(1);
    expect(isSoundName("no-such-sound")).toBe(false);
    expect(SOUND_NAMES).toContain("levelDone");
  });
});

describe("synthesis", () => {
  const script: ScriptEntry[] = [
    { tick: 0, event: { kind: "music", tune: "main" } },
    { tick: 40, event: { kind: "start", sound: "fire", arg: 0 } },
    { tick: 90, event: { kind: "start", sound: "explode", arg: 0 } },
    { tick: 120, event: { kind: "start", sound: "levelDone" } },
  ];

  it("worklet-style chunked rendering equals renderOffline", () => {
    const whole = renderOffline(script, 48000, 6, { output: "sdl-filter" });
    const synth = new PcSpeakerSynth(48000, { output: "sdl-filter" });
    let next = 0;
    synth.beforeTick = (tick) => {
      while (next < script.length && script[next]!.tick <= tick) synth.post(script[next++]!.event);
    };
    const chunked = new Float32Array(whole.length);
    for (let i = 0; i < chunked.length; i += 128) synth.render(chunked, i, Math.min(128, chunked.length - i));
    expect(chunked).toEqual(whole);
  });

  it("is deterministic and bounded", () => {
    const a = renderOffline(script, 44100, 3);
    const b = renderOffline(script, 44100, 3);
    expect(a).toEqual(b);
    let peak = 0;
    for (const v of a) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(16383 / 32768, 6);
  });
});
