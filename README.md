# Digger 3D

The original **Digger** (Windmill Software, 1983) in a browser — the 2D CGA
screen exactly as it was, and, next to it, a second window that looks at the
same game from inside the digger's cabin.

**▶ Play: https://ilya000.github.io/Digger3D/**

Both windows show one simulation: the 3D view only reads the game state, it
never influences it. Every sprite, colour, level map, sound and tune comes out
of the original `DIGGER.COM`; the voxel models in the 3D window are generated
from those very sprites.

```bash
npm install
npm run dev            # http://localhost:5173
```

| key | |
|---|---|
| any key | start |
| ← ↑ → ↓ | drive and dig |
| Shift / Enter / Ctrl / ⌘ / F1 | fire |
| Space | pause |
| N | one or two players |
| ⌥M / ⌥S | music, sound |
| ⌥Q | leave the game |
| + / − | speed |
| ⌥C / F2 | cabin or flyover |
| mouse | drag the 3D window to look around, wheel to come closer |

The function keys of the original (F1, F7, F9, F10) still work where the system
lets them through; on a Mac that means holding `fn`, which is why every one of
them also has a plain-key or Alt alias.

## How close to the original it is

* **The title screen is pixel-for-pixel the original's.** Decoding a screenshot
  of the 1983 game into CGA colours and comparing it with our own frame gives
  0 different pixels out of 64,000.
* **The game itself is compared frame by frame** with an instrumented build of
  the Digger Remastered sources, which are used as a behavioural oracle: ten
  scenarios, about 100,000 frames, including five recorded games played by other
  people. Every frame compares the position and state of the digger, the
  monsters, the bags, the fireball and the bonus, the map of dug tunnels, the
  scores, the lives, the state of the random generator, a hash of the whole
  screen — and the sound commands issued in that frame.
* **The sound is a PC-speaker emulation** — square waves from the 8253 timer at
  1,193,181 Hz sequenced by a 72.8 Hz interrupt — compared sample by sample with
  the reference: 99.97 %–100 % of samples are bit-identical across 28 scenarios.
* **Rules the recordings never reach** (the score wrapping at a million, the
  limit of four spare lives, player 2's extra life one point late, the order the
  eight level maps repeat in) are pinned down in their own tests.

## Layout

| | |
|---|---|
| `tools/extract` | reads the original game file, writes `src/assets/original.ts` |
| `src/assets` | generated data: sprites, palettes, font, title picture, levels, music |
| `src/core` | the game: rules, AI, digging, bags, fire, bonus, lives, scores, title; draws the 320×200 CGA screen and emits sound events |
| `src/sound` | PC-speaker emulation (AudioWorklet) |
| `src/view3d` | three.js world, the playfield as a tilted slab, cockpit camera, voxel models |
| `src/app` | the page: loop, keyboard, high scores, the attract screen |
| `tests` | extraction, sound and the frame-by-frame comparison with the reference |
| `functions`, `db` | the shared high-score table and the play counters of the site |

`npm test` runs everything; `npm run build` type-checks and builds into `dist/`.

The frame-by-frame tests replay games recorded by other people; those recordings
live in the reference repository, so they need it checked out beside the project
(it is never modified, and none of its code goes into the game):

```bash
git clone https://github.com/sobomax/digger vendor/digger
```

## Author

**Ilya Osipov** — [ilyaos.com](https://ilyaos.com)

## Credits and licence

Digger was created by **Windmill Software** in 1983 and is their work; this
project only makes it run in a browser and adds the window into the cabin.

The reverse engineering that made the rules knowable is **Digger Remastered** by
Andrew Jenner and the later ports by Maksym Sobolyev and Michael Knigge; their
sources are used here as a test oracle, never as game code.

Licence: GPL-2.0-only.
