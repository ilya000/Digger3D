# Digger 3D — project memory and handoff

Read this first. It records everything decided and learned so far (session of 2026-09-11).
Talk to the owner (Ilya) in **Russian**. Technical docs/code comments are in English.

## 1. What we are building (owner's requirements, verbatim where it matters)

A **web** remake of the original **Digger (Windmill Software, 1983)** where the classic 2D
game is unchanged and an extra 3D window shows the same game from inside the Digger.

- "ours will be a web one" - it runs in a browser.
- "the standard 2D field and the first-person view are always visible at the same time".
- "the graphics and the sounds are completely original, no different in any way. This matters
  very much: it has to feel like the old classic Digger that suddenly grew a 3D window."
- "the 3D view is from the player sitting inside the cabin of the digger machine."
- "the 3D machines and the monsters are 3D pixel art, Minecraft-like but strictly in the style
  of the old Digger"
  -> voxel models generated from the original sprites.
- "the playfield sits inside a Minecraft-like world. With square clouds and all the rest, but the
  field itself is tilted at about 45 degrees so that things like gold fall - slide, rather - down."
- "the tunnels the digger digs are almost the full depth, and things like gold and emeralds stick
  out of the earth by about a third; once the digger has dug a tunnel to them they stick out fully."
- "do not use that project, just make everything from scratch, using it as a hint about the design.
  Use the original Digger, take everything from there, and generate the 3D graphics from the
  original Digger's graphics."
  -> **Write our own code from scratch.** `vendor/digger` (sobomax/digger = Digger Remastered) is
  the reference and the behavioural oracle; since 2026-09-12 it is also where the game data comes
  from (GPL v2), corrected back to the 1983 program by `src/assets/corrections.ts`.
- "the code may be rewritten completely with modern tools" -> TypeScript + Vite + three.js.
- "take absolutely everything from the original!!!"
- "try to bring it to a perfect state, everything must be as in the original (except the 3D we
  added); 100 % correspondence with the original - its spirit, its movement, its mechanics, its
  details - is what makes it work"
- "?mode=title - in that mode show the level map closer, so that it is very clearly readable"
  (done: close flyover).
- Feedback already addressed in the preview: gold bags must wobble/fall/break/push; monsters looked
  flat from the side in 3D (now rounded); fire on Space/F1; touching a monster must kill the Digger.

Project folder: `~/Dropbox/Code/digger-3d` (owner chose the name). No git commits yet — the owner
has not asked for any. `vendor/digger/` is a git clone (gitignored).

## 2. Current state (end of session 2, 2026-09-11)

| Part | State |
|---|---|
| `tools/extract` + `src/assets/original.ts` | **Done, tested.** Everything extracted from DIGGER.COM (see §4). |
| `src/assets/fromOriginal.ts` | **Done.** Builds the core's `AssetBundle` from the original data. |
| `src/sound/` | **Done, verified**: PC-speaker engine, 28 scenarios vs reference, 99.97-100 % bit-identical samples. See `src/sound/README.md`. Dev page `/dev/sound.html`. |
| `src/core/` | **Done and verified.** Title, attract animation, both players, digging, bags, monsters, Hobbins, fire, bonus mode, deaths, level changes, scores, high-score initials, pause and the F-keys. |
| `tests/core/` | **Done**: 10 scenarios, ~100,000 frames compared with the reference line by line (positions, field, score, RNG, sound commands, screen hash) plus 24 pixel-exact screens. |
| `src/app/` | **Done**: `main.ts` runs the core (`createGame(originalBundle(), ...)`), `input.ts` is the browser keyboard, `highScores.ts` is the high-score table (shared through `/api/scores` where our site serves it, otherwise localStorage), `attract.ts` plays the eight levels in the 3D window while the game shows its title screen, `credit.ts` writes "© IlyaOs 2026" in the corner in the original's own lettering, `screen2d.ts` shows the CGA frame. The old `preview.ts` is deleted. |
| `src/view3d/` | Works with the real game: art per level plan and palette switched at runtime (`setArt`, cached per key), cockpit whose scoop opens and closes with the digger's animation, tunnels, bags/gold/emeralds, squashed monsters, bonus cherry, the tombstone rising after a death and the camera that tumbles out of the wreck. Buried emeralds and bags lean out of the wall of the tunnel next to them, so the driver sees them before eating them; monsters and those objects turn to face whoever looks at them (face-up from above, face-on from the cabin). The mouse works in both views: outside the cabin dragging orbits the playfield and the wheel comes closer, and from inside the cabin dragging turns the driver's head, which eases back to straight ahead when the button is let go. |
| the site | `wrangler.toml`, `functions/api/scores.js`, `db/schema.sql`, `public/_headers`, `DEPLOY.md`: Cloudflare Pages + D1 for digger.ilyaos.com and the shared high-score table. Waiting for the Pages project and the token (see DEPLOY.md). |
| `tools/reference/` | Native build of the reference with per-frame state dumps (`build.sh`, `gen-fixtures.sh`). The oracle for the tests. |

All tests pass: `npx vitest run` -> 58 tests (assets 5, core 10, rules 5, sound 38).

### How faithful the 2D is, and how we know (checked again 2026-09-12)

* **The title screen is pixel-for-pixel the original.** Decoding
  `assets/original/screenshots/screenshot_00.jpg` into CGA colours and comparing
  it with our own frame gives **0 different pixels out of 64,000** - the same
  picture, the same font, the same layout, the same palette (1, high intensity).
  The three other screenshots differ only inside the 16-pixel box of one cast
  sprite (41-105 pixels), because they were taken at another phase of that
  sprite's animation; every pixel of text and frame matches.
* **The mechanics and the sound come from the reference frame by frame.** Every
  trace line holds a hash of the whole screen and the sound commands of that
  time point, so the 10 scenarios compare ~100,000 frames of positions, tunnels,
  scores, the random generator, the screen and the sound. A count over the
  fixtures shows what that covers: every sound command of the game (fall, break,
  wobble, fire, explode, bonus siren, emerald click and all eight notes, gold,
  eat monster, death, extra life, level-done jingle, the three tunes, pause,
  toggles, speaker off), and the events - 44 levels completed, 43 bonus modes,
  200 hobbin changes, 150 monsters killed, 273 bags broken, 16 extra lives, 28
  lives lost (by monster and by bag), 5 player changes, up to 5 monsters on
  screen (the original's limit).
* **Rules the recordings never reach** are pinned down in `tests/core/rules.test.ts`
  from the reference's own documentation: the score wrapping at a million and no
  extra life after it, four spare lives at most, player 2's extra life one point
  late, the level map order 1-8, 6-7-8, then 5-6-7-8, and the difficulty stopping
  at level 10.
* **Timing**: the frame period is the original's 80,000 us (speed 40 x 2000) and
  the speed keys change it by 10,000 us with a floor, as in the reference.

A playable build is published as a private Claude artifact:
<https://ilya000.github.io/Digger3D/>
(rebuild with `npm run build`, then publish `dist/` again - the page is
`dist/index.html` without the html/head/body wrapper plus `dist/assets/*.js`).

### Next steps
1. **digger.ilyaos.com** (decided 2026-09-11): Cloudflare Pages + D1, the owner
   creates the Pages project `digger-3d`, the D1 database `digger_scores` and the
   custom domain in the dashboard, in the personal Cloudflare account that holds
   the `ilyaos.com` zone, and leaves a token with Account -> Pages·Edit and
   D1·Edit in `.secrets/cloudflare.token` (never committed); then fill
   `database_id` in `wrangler.toml`, run `db/schema.sql` and
   `npx wrangler@4 pages deploy`. See DEPLOY.md.
2. 3D polish: emeralds and bags embedded in the *walls* of a trench are invisible
   from the cabin (they only stick out of the surface); the second player's digger;
   the fireball light and the explosion; the bonus-mode flash in the world.
3. Mobile: touch controls and a layout for a phone (dragging the 3D window
   already works with a finger).
4. During the two seconds in which the original paints a new level cell by cell,
   the 3D window already shows all the emeralds (the core knows them from the
   start). Reveal them with the 2D drawing if it turns out to matter.

### Where the game data comes from (changed 2026-09-12)
The game no longer ships data extracted from DIGGER.COM. `src/assets/game.ts`
builds the bundle from `src/assets/fromRemastered.ts` (the Digger Remastered
data, GPL v2, generated by `src/assets/gen-standin.mjs` from vendor/digger) plus
`src/assets/corrections.ts`, which puts back the places where Remastered differs
from the 1983 program: 6 fireball/explosion frames (6-8 px each), the two
spare-life icons (48 each), the title picture (1961 px of 64,000) and the colon
Remastered added to the font. `tools/assets/build-assets.mjs` regenerates both
the corrections and `docs/ASSETS.md` (the table of what was taken and what was
changed, which is what the GPL asks for); it needs `src/assets/original.ts`,
which `tools/extract` produces locally from a copy of DIGGER.COM.
`assets/original/` and `src/assets/original.ts` are gitignored - local only.
The result is byte-for-byte the 1983 data (verified: 0 differing pixels in
sprites, font, title, levels and palettes), so the repository can be public
while every byte in it is GPL.

### Licence and descent
The project continues the line of Digger Remastered (Windmill Software 1983 ->
Andrew Jenner's reverse engineering, which Rob Sleath, the original's author,
allowed him to license under the GNU GPL -> the SDL ports), so it is
**GPL-2.0-only** as well and carries the GPL text in `LICENSE`; `README.md`
tells that story. The data read out of the original program belongs to Windmill
Software and is not ours to license - that is why the repository
(github.com/ilya000/Digger3D) is private while the built game is public on
GitHub Pages. To open the sources, take `assets/original/` and the generated
`src/assets/original.ts` out of the repository and let each player supply their
own DIGGER.COM for `tools/extract` (the tests use `src/assets/standin.ts`,
which comes from the reference's GPL data, so they keep working).

### Our own line in the 3D window
`src/app/credit.ts` writes "© IlyaOs 2026" in the letters of the original's
"© Windmill Software 1983". That line is not a font - it is drawn into the title
picture - so the glyphs are cut out of the picture by the columns they occupy
(rows 184..199, baseline 199). The alphabet that gives is only
"© W i n d m l S o f t w a r e 1 9 8 3"; the missing I, O, s, y and the
digits 0, 2, 6 are drawn (p and v are drawn too, for a longer name) in `DRAWN` in the same style (two-pixel stems, the same
serifs, capitals from row 186, x-height from row 190, descenders below the
baseline, which the original had no room for). Change the text by passing it to
`new Credit(canvas, assets, "...")`.

### Deliberate differences from the reference (not bugs)
- **Title screen colours.** The original shows the title in CGA palette 1 at high
  intensity (white text, light magenta boxes, light cyan scores) - proven by the
  pixel-exact comparison above. The Remastered reference draws its title as a VGA
  picture (`cgatitle` is an empty stub in the SDL port) and never switches the CGA
  palette, so its harness reports palette 0 there. The core follows the original; `GameOptions.titlePalette
  = "reference"` selects the reference behaviour and the differential tests use it.
- **Keyboard.** The game's keys are the original's, but a browser (and a Mac)
  cannot give us the F row: `Shift`, `Enter`, `Ctrl` and `⌘` fire as well as F1,
  and `Alt` + a letter stands for the rest (⌥M music, ⌥S sound, ⌥Q exit,
  ⌥C camera, ⌥P pause). While `⌘` is held macOS sends no key-up at all, so
  releasing it drops every held key (auto-repeat brings back what is really
  held). The page itself is in English.
  F1 itself still works where the system lets it through - on a Mac only with
  `fn` held, or with "Use F1, F2, etc. keys as standard function keys" switched
  on in System Settings; by default macOS turns that key into screen brightness
  before any window sees it, and a web page cannot get it back.
  Alt is never part of the game's own keys, so the letters stay free for the
  high-score initials. `F2` / `⌥C` switches between the cabin and the flyover -
  the only key of ours that the game itself does not see.

### Known, deliberate divergences from the original
- After a game over **without** a high score the original flashed between its two
  palettes for a while on some machines; Andrew Jenner removed that in Remastered
  ("the original didn't do this on my 8086 ... it was taking ages to get back to
  the title screen"), and we follow Remastered, since the flash was a hardware
  oddity nobody can reproduce reliably.
- Remastered's own additions are deliberately absent: the "battle" tune of the
  last life, unlimited lives (/U), gauntlet mode, the cheat key, the redefinable
  keyboard, the VGA artwork, simultaneous two-player play and network play.

### Quirks that look like bugs but are the original's
- Starting the game with **Space** also pauses it at once ("PRESS ANY KEY"),
  because Space is the pause key and the press is still pending. The reference
  does exactly the same (verified by the trace).
- The high-score table shows `0` as a box: the original's font has no zero glyph
  of its own and no colon at all.
- Each life starts with the random seed 0 (`randv=0`), so the game is
  deterministic - that is why the .drf recordings replay at all.

## 3. Architecture

See `docs/ARCHITECTURE.md` and `src/contracts.ts` (Screen, GameView, SoundEvent, SpriteImage, Palette).

```
tools/extract/extract.ts   DIGGER.COM + manifest.json -> src/assets/original.ts (generated)
src/assets/cga.ts          CGA palettes + decodeCgaSprite (2 bpp, mask 00 = opaque)
src/assets/fromOriginal.ts AssetBundle for the core (types in src/assets/types.ts)
src/assets/standin.ts      core agent's stand-in from Remastered data (dev only; do not ship)
src/core/                  the game (rules, AI, 2D rendering, sound events, GameView)
src/sound/                 PC-speaker engine (done)
src/view3d/                View3D.ts, slab.ts, world.ts, voxel.ts, originalArt.ts
src/app/                   main.ts (loop), input.ts (keyboard), highScores.ts, screen2d.ts, style.css
index.html                 two 16:10 panes side by side (stacked on narrow screens) + help line
dev/sound.html             listen to every sound
```

Commands:
```bash
npm run dev                       # http://localhost:5173  (?level=n, ?cam=fly)
npm run build                     # typecheck + production build into dist/
node tools/extract/extract.ts     # regenerate src/assets/original.ts (checks sha256)
npx vitest run                    # everything (53 tests)
npx vitest run tests/core         # the differential tests against the reference
npx tsc --noEmit                  # typecheck
```
Keys: see §2 ("Keyboard"). `window.__digger` exposes `{game, keyboard, sound, view3d}`.
Note: `requestAnimationFrame` does not run while the in-app browser pane is hidden, so the game
stands still between tool calls — drive it directly instead:
```js
const src = { isDown: (c) => false, nextKey: () => null };   // or a set of held codes
for (let i = 0; i < 60; i++) __digger.game.step(src);
```

## 4. Facts about the original DIGGER.COM

Source: archive.org item `msdos_Digger_1983_1983`, `Digger_1983_1983.zip` (24 012 B) →
`assets/original/Digger83/digger.com`, 57 856 bytes, dated 1996, uncompressed .COM.
sha256 is in `tools/extract/manifest.json`. Emulator screenshots used for colour checks:
`assets/original/screenshots/`.

Data segment starts around 0x8D40 ("Copyright(C) 1983 Windmill Software Inc.").
All offsets were located by matching Remastered's tables; data is read from the original.

- **Sprites** 0xA454–0xC88B: 2 bpp CGA, 4 px/byte, MSB first; separate mask
  (screen = (screen AND mask) OR image; mask 00 = opaque). Sprite numbers (`ch`) and sizes
  (bytes × rows) follow Remastered's `cgatable`:
  0 blank · 1–3 right · 4–6 right reloading · 7–9 up · 10–12 up reloading · 13–15 left ·
  16–18 left reloading · 19–21 down · 22–24 down reloading · 25 dead · 26–30 grave ·
  62 bag · 63 bag right · 64 bag left · 65 bag falling · 66–68 gold · 69–71 Nobbin · 72 Nobbin dead ·
  73–75 Hobbin right · 76 dead · 77–79 Hobbin left · 80 dead (4×14) · 81 bonus cherry ·
  82–84 fire · 85–87 explosion (2×8) · 94–101 earth tiles (5×4, one per level plan) ·
  102 right blob 2×18 · 103 top 6×6 · 104 left 2×18 · 105 bottom 6×6 · 106 square 6×6 ·
  107 furry 6×8 · 108 emerald 4×10 · 109 emerald hole · 110 life · 111 life P2 · 112 life empty (4×12).
  Most sprites are 4×15 (16×15 px). Entries 32–56 ("bigger") and 113–119 are Remastered-only.
- **Quirks kept from the original**: fire/explosion frames are 15-byte blocks drawn as 16 bytes,
  so the last byte comes from the following mask (a stray pixel Remastered removed); life icons
  have no masks; the font has **no colon**.
- **Font** 0x9428–0x99CB: 39 glyphs, 3 bytes × 12 rows (12×12), keys A–Z, 0–9, `.`, `_`, space.
  Text is drawn by overwriting the 12×12 cell with `pixel AND colour`. Zero looks like a box.
- **Title screen**: length word at 0x9B1A (=2330), RLE data from 0x9B1C: `FE count value`
  (count 0 = 256), other bytes literal → CGA video memory (even rows at 0, odd rows at 0x2000,
  80 bytes/row). Contains the two magenta boxes and "© Windmill Software 1983". The game draws
  on top: "D I G G E R" (100,0,c3), "HIGH SCORES" (16,25,c3), scores (16, 44+13i; first c2 others c1),
  "ONE" (220,25), " PLAYER " (192,39), cast at x=216 text / x=184 sprite, y = 64 NOBBIN, 83 HOBBIN,
  102 DIGGER, 121 GOLD, 140 EMERALD, 159 BONUS (colour 2). Title palette: 1, high intensity
  (measured light magenta 255,85,255 on the screenshot).
- **Levels** 0xD87E, 8 × 10 rows × 15 chars: S start of tunnels, V vertical, H horizontal,
  C emerald, B bag, space earth. Level plan for level l>8: `(l & 3) + 5`.
- **Music** 16-bit LE (divisor, duration) pairs: bonus 0xD354 (321 words), main 0xD5D6 (291),
  dirge 0xD81C (49). The Remastered "battle" tune is NOT in the original.
- **Sound immediates in code**: new-level jingle at 0x726A stride 8 (10 values: 2280 1810 1522 2032
  1708 1356 1810 1522 1208 1140); emerald scale 0x760C stride 8 (2032 1810 1708 1522 1356 1208 1140;
  the leading 2280 comes from elsewhere).
- **Texts** (verified in the extractor): PLAYER, NEW HIGH SCORE, GAME OVER, HIGH SCORES, ENTER YOUR,
  INITIALS, D I G G E R, NOBBIN, HOBBIN, DIGGER, EMERALD, BONUS, PRESS ANY KEY (+ TWO, PLAYERS, "_ _ _").
- **Palette**: code sets BIOS mode 4 then writes 0x20 to port 0x3D9 at 0x351; helpers at 0x406
  (palette bit 5), 0x43B (background nibble), 0x465/0x475 (intensity bit 4 on/off).
  CGA colours: p0 black/green/red/brown, p0i black/light green/light red/yellow, p1 black/cyan/
  magenta/light grey, p1i black/light cyan/light magenta/white.
- Unexplored: 256 high-entropy bytes at 0x9A17 (maybe an RNG/permutation table); C runtime ctype
  table at 0xDE08.

## 5. Original rules learned from the reference (for the core; confirm with the diff harness)

- Screen 320×200; field 15×10 cells of 20×18 px; sprite position of cell (h,v) = (h·20+12, v·18+18).
- Earth tiles drawn from (0,14) in steps of 20×4 (`drawbackg`). Emerald drawn at (h·20+12, v·18+21).
- Digger starts at cell (7,9) facing right (1 player). Moves 4 px horizontally / 3 px vertically per
  step; may turn to up/down only when (x−12)%20==0 and to left/right only when (y−18)%18==0.
- Digging blobs: right blob at (x+16, y−1), left (x−8, y−1), top (x−4, y−6), bottom (x−4, y+15),
  furry (x−4, y+15), square (x−4, y+17). Initial tunnels (`makefield`/`drawfield`): field word per
  cell starts at 0xFFFF; S/V clear with `&=0xD03F`, S/H with `&=0xDFE0`; cells with bit 0x2000 clear
  are drawn with bottom blobs at y−15..y−3 step 3 + top blob at y+3 (vertical), right blobs at
  x−16..x−4 step 4 + left blob at x+4 (horizontal), plus connecting blobs to the right/below.
  `eatfield` updates the bits as the Digger moves (bitmasks per sub-position).
- Bags: wobble when resting aligned (xr==0, y<180) and the cell below is not full earth
  ((field & 0xFDF) != 0xFDF) and the Digger is not under it; wobble counter 15 then fall; falling
  continues while the cell below is not full earth; on landing at yr==0, `fallh>1` rows → gold;
  pushed sideways by the Digger; a bag pushed over a hole falls at once. Gold has a lifetime (`goldtime`).
- Game frame period default `ftime = 80000 µs` (12.5 frames/s); sound interrupt 72.8 Hz; PIT 1193181 Hz.
- Palette per level: `gpal(0); ginten(0)`; bonus mode flashes intensity; high-score screen toggles palette.

## 6. 3D design decisions (src/view3d)

- 1 world unit = 1 screen pixel. Slab local frame: X = screen x, Z = screen y, Y = out of the surface.
  `FIELD = {x0:12, y0:18, w:300, h:180}`, slab thickness 18, trench depth 16, tilt 45° about X.
- Slab mesh rebuilt per 20×18 chunk when the tunnel mask changes; top/wall textures are the level's
  original earth tile, UV origin (0,14) to match the 2D tiling.
- World: voxel hills (block 10), sparse voxel trees, flat white square clouds (MeshBasicMaterial) drifting.
- Models: `voxelize` (distance-transform thickness) for side-view sprites (Digger, Hobbin);
  `voxelizeRound` (circular cross-section per row, face on front/back caps, flanks in the row's
  body colour) for face-on sprites (Nobbin, bag, gold, emerald, cherry, fireball).
- Buried emeralds/bags lie face-up in the earth sticking out ~1/3 (`embedHeight`); exposure =
  fraction of dug pixels under the sprite; exposed bags stand upright in the trench.
- Camera: eye in the cabin (sprite pixel (6,3) of the right-facing Digger), looks along travel
  direction; up = 0.7·slab normal + 0.3·world up; slerp smoothing; positions interpolated between
  game frames. Cockpit shows only hood/scoop pixels below eye level, black outline removed.
- `flyMode`: "close" (title: along the slab normal, map readable) / "wide" (C key / ?cam=fly).

## 7. Environment notes

- Installed during the session via Homebrew (arm64 `/opt/homebrew`): `emscripten` (installed before
  it could be cancelled; unused), `nasm` (ndisasm; unused). Owner may remove them.
- npm devDependencies: vite 8, typescript 7, vitest 5, @types/three, @types/node. Dependency: three 0.186.
- The earlier macOS port of Digger Reloaded (2005, first-person) lives in `~/Dropbox/Code/digger-reloaded-mac`
  — the research that started this project. Nothing from it is used here.
