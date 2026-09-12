# src/sound — original-accurate PC-speaker sound

Plays every sound effect and tune of the original Digger (Windmill Software,
1983) the way the PC speaker produced them: square waves from the 8253/8254 PIT
(1193181 Hz), sequenced by a 72.8 Hz sound interrupt, with the original's
effect priorities, music/effect interleaving and pulse-width "volume" envelope.

## API

```ts
import { createSoundEngine } from "./sound";

const sound = createSoundEngine({ output: "raw", volume: 0.6 });
button.onclick = () => sound.unlock();        // user gesture: create/resume AudioContext

// every game frame (12.5 Hz in the original):
for (const ev of core.drainSoundEvents()) sound.handle(ev);   // SoundEvent from contracts.ts
sound.advance(0.08);                          // sound time passed during this frame
if (sound.isBusy("levelDone")) { /* keep waiting, don't step the game */ }
```

```ts
interface SoundEngine {
  handle(ev: SoundEvent): void;          // takes effect at the next sound tick
  unlock(): Promise<void>;               // no-op (resolves) without Web Audio
  setSoundEnabled(on: boolean): void;    // the original's sound toggle
  setMusicEnabled(on: boolean): void;    // the original's music toggle
  readonly soundEnabled: boolean;
  readonly musicEnabled: boolean;        // may change by itself (see dirge below)
  advance(seconds: number): void;        // drives isBusy (call once per frame)
  isBusy(what: "levelDone" | "dirge"): boolean;
  setVolume(volume: number): void;       // 0..1, default 0.6
  setOutput(mode: "raw" | "sdl-filter"): void;
  readonly audible: boolean;             // AudioContext running
  dispose(): void;
}

renderOffline(script: ScriptEntry[], sampleRate: number, seconds: number,
              options?: { output?, gain?, onFinished? }): Float32Array
// ScriptEntry = { tick: number; event: SoundEvent | EnableCommand }
// the command is posted right before sound tick `tick` (0-based) runs
```

### Events

`{kind:"music", tune:"main"|"bonus"|"dirge"|"off"}` starts a tune from its
beginning (or stops the music).

`{kind:"start"|"stop", sound: SoundName, arg?}`, with `SoundName` from
`names.ts`:

| name | kind | original | meaning / `arg` |
|---|---|---|---|
| `emerald` | one-shot | `soundem` | emerald eaten: 1-tick click |
| `emeraldStreak` | one-shot | `soundemerald(n)` | streak note, `arg` = position 0..7 (C major scale) |
| `eatMonster` | one-shot | `soundeatm` | monster eaten in bonus mode |
| `fire` | loop | `soundfire(n)` / `soundfireoff(n)` | fireball flying, `arg` = fireball 0/1 |
| `explode` | one-shot | `soundexplode(n)` | fireball explodes (stops its `fire`), `arg` = fireball 0/1 |
| `gold` | one-shot | `soundgold` | gold collected |
| `bagWobble` | loop | `soundwobble` / `soundwobbleoff` | a bag wobbles |
| `bagFall` | loop | `soundfall` / `soundfalloff` | a bag falls |
| `bagBreak` | one-shot | `soundbreak` | a bag breaks open |
| `diggerDeath` | one-shot | `soundddie` | digger dies (also stops the music) |
| `oneUp` | one-shot | `sound1up` | extra life |
| `bonus` | loop | `soundbonus` / `soundbonusoff` | bonus-mode siren |
| `levelDone` | jingle | `soundlevdone` | stop everything, play the level-done jingle |
| `pause` | loop | `soundpause` / `soundpauseoff` | silence and freeze all sound |
| `all` | stop only | `soundstop` | stop every effect, the jingle and the music |

`stop` on a one-shot cuts it short (the original never does that). Unknown
names are ignored.

### Waiting for jingles

The original blocks the game while the level-done jingle plays, and after a
death it waits in the tombstone stage until the dirge melody is over. With a
frame-stepped loop:

* level end: `handle({kind:"start", sound:"levelDone"})`, then each frame
  `advance(dt)` and don't continue while `isBusy("levelDone")` (231 ticks,
  about 3.17 s). If sound is disabled it is not busy at all, as in the original.
* death: `handle({kind:"music", tune:"dirge"})`, then keep the tombstone while
  `isBusy("dirge")` (the melody takes 512 ticks, about 7 s). Starting any other
  tune, `music off` or `stop all` ends the wait. The dirge plays even if music
  is off; the music setting goes back to off when the melody ends.

`isBusy` is answered by a silent copy of the sound machine on the main thread,
advanced only by `advance()`. It gives the same answer with audio,
without audio (tests, node) and before `unlock()`. It is `true` right after
`handle()`, before the next tick runs.

## How it works

| file | role |
|---|---|
| `data.ts` | facts of the original: PIT clock, tick rate, the three tunes, jingle, emerald scale, envelopes/tempo |
| `effects.ts` | each effect as a per-tick program returning a channel-2 divisor |
| `music.ts` | tune player with the attack/decay/sustain/release pulse-width envelope |
| `machine.ts` | the sound interrupt: applies commands, runs music and effects, decides who owns the speaker, programs the PIT |
| `speaker.ts` | sample-level model of PIT channels 0/2 and the speaker, plus the output stage |
| `synth.ts` | ticks the machine every `round(rate/72.8)` samples; `renderOffline` |
| `worklet.ts` | AudioWorkletProcessor around the synth |
| `engine.ts` | main-thread API: worklet transport and the `isBusy` mirror |

Once per tick every active effect advances. The last effect in priority order
that wants the speaker gets channel 2 for that tick (priority, low to high:
emerald streak, wobble, death, break, gold, emerald click, explosion, fire,
eat monster, fall, 1-up, bonus). On ticks where no effect wants it, the speaker
is switched to the music, a square wave on channel 0 whose amplitude follows
the pulse-width envelope. That is why effects that pulse (fire, wobble,
emeralds) are heard interleaved with the tune. The level-done jingle uses the
original's two-timer trick: channel 0 on the note, channel 2 detuned 35 divisor
steps and acting as a gate at the beat frequency.

Phase is kept exactly (integer accumulator per voice), and a re-tuned voice
continues from its current phase.

Output modes:
* `raw` (default): the pure square wave, ±16383/32768 × volume. This is what
  the reference produces in its GNUmakefile/CI/release builds (`NO_SND_FILTER`).
* `sdl-filter`: the reference CMake build's SDL output filter (1 kHz high-pass,
  4 kHz low-pass, heavily overdriven), which gives clicky, clipped edges.

The AudioContext asks for 44100 Hz so the synthesis is sample-for-sample the
reference's. Other rates work (a tick is `round(rate/72.8)` samples).

## Verification

`tests/sound/reference.test.ts` renders 28 scripted scenarios and compares
them with PCM from the reference code in `vendor/digger`, run by the native
harness in `tools/reference-sound` (`build.sh` rebuilds it, re-runs all
`scenarios/*.txt` and regenerates `tests/sound/fixtures`). The scenarios are
every effect alone, every tune (10 s), and overlaps (music + fire/explosion/
emeralds/gold/bags, bonus mode, death + dirge, pause, toggles, stop-all, level
end). The results:

* completion ticks of the level-done jingle and the dirge are identical in all scenarios;
* 99.97 %–100 % of samples are bit-identical. Every difference is a single
  isolated sample (longest differing run = 1) where a square-wave edge falls
  exactly on a sample instant: the reference computes phase in floating point
  and lands on either side, while we use exact integer phase;
* 99.90 %–100 % of level changes coincide within ±1 sample, in both directions;
* `sdl-filter` mode: 99.1 %–100 % of samples within ±2 LSB. Each isolated raw
  difference leaves a short decaying trace through the high-pass.

`tests/sound/engine.test.ts` checks the waiting semantics headless, and that
the worklet's 128-sample chunked rendering is identical to `renderOffline`.

Listen: `npm run dev`, then open `/dev/sound.html`.

## Deliberate choices and known differences

* The Remastered "battle" tune (played instead of the main tune on the last
  life) is not in the 1983 original and is left out. The core should send `main`.
* The 0.7× dirge tempo of the Remastered simultaneous two-player mode is
  supported internally (`TunePlayer.start(tune, tempoScale)`) but not exposed
  through `SoundEvent`.
* Reference behaviours kept for fidelity (the reference is the oracle):
  - channel-2 divisors ≥ 0x4000 are silent, e.g. the top of the death sound and
    the end of the fire whoosh;
  - before any tune has played since start-up, the level-done jingle is silent
    (the speaker is in mode "none");
  - after `pause` or sound off/on, effects stay silent until the speaker is
    switched to the music at least once (normally at once, because music is
    playing). With music off they stay silent until the next level-done jingle;
  - re-enabling sound also re-enables music.
* The isBusy mirror always runs at a nominal 44100 Hz. If the AudioContext
  runs at another rate, audio and mirror differ by < 0.1 % in tick rate.
