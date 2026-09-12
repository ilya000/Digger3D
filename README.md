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

## Where it comes from

**1983.** Digger was written by **Windmill Software** and sold as a copy-protected,
bootable 5.25" floppy for the IBM PC. It needed a 4.77 MHz machine and a genuine
CGA card, which is why it stopped working on later PCs. Its source code was never
published, and the game was never released under any licence: it is Windmill's
work, and it still is. The copy this project reads its artwork out of is the one
kept at the [Internet Archive](https://archive.org/details/msdos_Digger_1983_1983)
(`digger.com`, 57,856 bytes, sha256 `4585dad6…`, which `tools/extract` verifies
before it reads a single byte).

**1998.** **Andrew Jenner** reverse-engineered the game into **Digger Remastered**,
so that it plays and sounds the way the original did on hardware that no longer
exists. He set out where that stands legally in the game's own FAQ
([`digger.txt`](https://github.com/sobomax/digger/blob/master/digger.txt), the
answers to "Is this legal?" and "Where can I get the original version of
Digger?"): Rob Sleath, the author of the original Digger, contacted him; Sleath no
longer owns the copyright to Digger but kept the right to use the code for other
products, considers Digger Remastered to be another such product, and granted
Jenner the copyright to Digger Remastered — which Jenner licensed under the **GNU
GPL**. Of the original games he himself distributes, Jenner writes that doing so
is "strictly speaking, not legal", and that he keeps Windmill's copyright messages
in the game and credits them wherever he can. More of that history, and of
Windmill Software's, is on his site [digger.org](https://digger.org).

**Later.** **Maksym Sobolyev** ported that code to SDL for Linux, FreeBSD and
Windows (and eventually WebAssembly), and **Michael Knigge** cleaned it up and
packaged it for Windows. That tree —
[github.com/sobomax/digger](https://github.com/sobomax/digger) — carries several
licences file by file: GPL-2, 2-clause BSD, Beer-Ware, public domain.

**Now.** Digger 3D continues that line. The game here is written from scratch in
TypeScript, but everything it knows about how Digger behaves comes from the
Remastered sources: they are the documentation of the original's rules and, in
`tools/reference`, the oracle every frame of our simulation is compared against.
So this project takes its licence and its descent from Digger Remastered and is
**GPL-2.0-only** as well (see [`LICENSE`](LICENSE)).

The 1983 program itself was used as the object of study and as the source of its
own artwork: the sprites, the font, the title picture, the level maps, the tunes
and the timing values are read straight out of it, so that what you see and hear
is the 1983 game rather than a redrawing of it. That data belongs to Windmill
Software; it is not ours to license, and their copyright line stays on the screen
exactly where the original puts it.

### Sources

* Digger Remastered's FAQ, where Rob Sleath's permission and the GPL licensing are
  described — [`digger.txt`](https://github.com/sobomax/digger/blob/master/digger.txt)
* Digger Remastered's sources, used here as the test oracle —
  [github.com/sobomax/digger](https://github.com/sobomax/digger)
* Andrew Jenner's site, with the history of Digger and of Windmill Software —
  [digger.org](https://digger.org)
* The original program as preserved —
  [archive.org/details/msdos_Digger_1983_1983](https://archive.org/details/msdos_Digger_1983_1983)

## Author

**Ilya Osipov** — [ilyaos.com](https://ilyaos.com)

## Credits

Digger — **Windmill Software**, 1983.
Digger Remastered — **Andrew Jenner**, with **Maksym Sobolyev** and
**Michael Knigge** ([github.com/sobomax/digger](https://github.com/sobomax/digger)).

Licence: **GPL-2.0-only**.
