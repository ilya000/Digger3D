# Digger 3D — architecture

The original Digger (Windmill Software, 1983) running in the browser, looking and
sounding exactly like the original, with an extra window that shows the same game
from inside the Digger's cabin.

The feel we are after: *the old Digger you remember suddenly grew a 3D window.*

## Ground rules

1. **Written from scratch.** Own TypeScript code and own architecture. The Digger
   Remastered sources in `vendor/digger` are used only as a *reference* — to
   understand how the original behaves — and as a behavioural oracle in tests.
   No code is copied or mechanically translated from it.
2. **Assets come from the original 1983 game.** Sprites, CGA palettes, font, title
   screen, level maps and sound/music data are extracted from the original program
   (`assets/original/`) by our own extraction tool (`tools/extract`).
3. **Identical to the original.** Rules, timing, AI, randomness, graphics and sound
   must match the original. Verified against the reference in `tests/`.
4. **Both views always visible**: the standard 2D field and the first-person 3D view.
5. **The 3D view is derived only from game state** (`GameView`) and never influences
   the simulation. The simulation is deterministic and runs headless.

## Modules

| Dir | Role |
|---|---|
| `tools/extract` | reads the original game file, writes `src/assets/*.ts` (sprites, palettes, font, title, levels, sound data) |
| `src/assets` | generated data only |
| `src/core` | the game: rules, AI, digging, bags, fireball, bonus, lives, scores, title; renders the 2D screen into an indexed 320×200 CGA buffer; emits sound events; exposes `GameView` |
| `src/sound` | PC-speaker emulation (AudioWorklet) playing the original sound effects and tunes |
| `src/app` | page shell: layout, canvas scaling, real-time pacing, keyboard, audio unlock |
| `src/view3d` | three.js world and cockpit camera, voxel models generated from original sprites |

Interfaces between modules: `src/contracts.ts`.

## The 3D world

- A Minecraft-like voxel landscape: grass blocks, hills, blue sky, **square clouds**.
- The Digger field is a large slab of earth set into that world and **tilted ~45°**:
  2D "down" is downhill, so a falling gold bag visibly *slides* down the slope.
- The slab's top face shows the original dirt pattern, exactly as in the 2D field.
- Tunnels dug by the Digger are **trenches almost the full depth of the slab**, open
  to the sky, matching the 2D tunnels pixel for pixel (same tunnel mask).
- Emeralds and gold bags **stick out of the surface by about a third** while buried;
  once a tunnel reaches them they are **fully exposed**.
- Digger, Nobbins, Hobbins, bags, gold, emeralds, fireball, bonus: **voxel models
  generated from the original sprites** (same pixels, same colours, extruded).
- Camera: the player sits **inside the Digger's cabin**, looking along the direction
  of travel; smooth turns, positions interpolated between game frames.

## Verification

- Replays of recorded input through our core are compared frame by frame with the
  reference build of `vendor/digger` (positions, tunnel mask, score, sound events).
- 2D frames are compared pixel by pixel with the reference in CGA mode.
- Sound: PCM of scripted sound sequences compared with the reference.
