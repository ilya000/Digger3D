// Digger 3D: the original game runs in src/core, which draws the original 2D
// CGA screen and offers the same state to the 3D window (src/view3d). The page
// owns real time, the keyboard and the audio.
import { CGA_PALETTES } from "../assets/cga";
import { originalBundle } from "../assets/fromOriginal";
import type { GameView, Palette } from "../contracts";
import { createGame } from "../core";
import { createSoundEngine } from "../sound";
import { originalArt } from "../view3d/originalArt";
import { View3D } from "../view3d/View3D";
import { Attract } from "./attract";
import { Credit } from "./credit";
import { createHighScores } from "./highScores";
import { BrowserKeyboard } from "./input";
import { Screen2D } from "./screen2d";

const params = new URLSearchParams(location.search);
/** ?level=n starts the game at level n (the original always starts at 1). */
const startLevel = Math.min(1000, Math.max(1, Number(params.get("level")) || 1));
/** Camera key: the cabin (the game) or a flyover of the world (a look around). */
const isCameraKey = (e: KeyboardEvent): boolean => e.code === "F2" || (e.altKey && e.code === "KeyC");

const canvas = (id: string): HTMLCanvasElement => document.getElementById(id) as HTMLCanvasElement;

const assets = originalBundle();
// the high-score table is the shared one where our own site serves it, and the
// browser's own where it does not (see highScores.ts); it must be there before
// the game reads it, so the page waits for it
const highScores = await createHighScores();
const game = createGame(assets, { storage: highScores, startLevel });
const keyboard = new BrowserKeyboard({ ignore: isCameraKey });
const screen2d = new Screen2D(canvas("screen2d"));
const view3d = new View3D(canvas("screen3d"));
const credit = new Credit(canvas("credit"), assets);
// while the game is on its title screen the 3D window shows the levels in turn
const attract = new Attract(assets);
const sound = createSoundEngine();
let fly = params.get("cam") === "fly";

// Browsers start audio only after a gesture.
const unlock = (): void => {
  // a sandbox that forbids the audio worklet must not break the game
  void sound.unlock().catch(() => undefined);
  removeEventListener("keydown", unlock);
  removeEventListener("pointerdown", unlock);
};
addEventListener("keydown", unlock);
addEventListener("pointerdown", unlock);

addEventListener("keydown", (e) => {
  if (isCameraKey(e)) {
    e.preventDefault();
    fly = !fly;
  }
});

/**
 * The view the 3D window shows: the game itself while a level is being played,
 * the attract demo while the game is on its title screen. `fly` takes the
 * camera out of the cabin without changing the game.
 */
function shownView(): GameView {
  const live = game.view;
  if (!live.inLevel) return attract.step();
  return fly ? { ...live, inLevel: false } : live;
}

// The 3D art is generated from the original sprites, so it follows the level's
// earth tile and the palette the game has selected (bonus mode flashes it).
// The title screen has a palette of its own; the world keeps the colours a
// level is played in.
let artPlan = 0;
let artPalette: Palette = CGA_PALETTES.p0;
function syncArt(view: GameView): void {
  const plan = Math.min(8, Math.max(1, view.levelPlan));
  const palette = game.view.inLevel ? game.screen.palette : artPalette;
  if (plan === artPlan && palette === artPalette) return;
  artPlan = plan;
  artPalette = palette;
  view3d.setArt(`${plan}:${palette.map((c) => c.join(",")).join("/")}`, () => originalArt(palette, plan));
}

function feed(): void {
  const view = shownView();
  syncArt(view);
  // in the flyover the world is shown from outside, never from the cabin
  view3d.flyMode = fly ? "wide" : "close";
  view3d.onGameFrame(view);
  // our own line in the corner, only while the game shows its title screen
  credit.update(game.screen.palette, !game.view.inLevel);
}
feed();

/** Debugging from the console. */
(globalThis as unknown as { __digger: unknown }).__digger = { game, keyboard, sound, view3d, attract, credit, highScores };

// Other people play too: while the title screen is up, look for a newer table.
if (highScores.shared)
  setInterval(() => {
    if (game.view.inLevel) return;
    void highScores.refresh().then((changed) => {
      if (changed) game.refreshHighScores();
    });
  }, 20000);

let last = performance.now();
let acc = 0;
function tick(now: number): void {
  acc += Math.min(250, now - last);
  last = now;
  // at most a few frames per animation frame, so a slow tab cannot spiral
  for (let n = 0; n < 8 && acc >= game.framePeriodMs; n++) {
    const period = game.framePeriodMs;
    game.step(keyboard);
    for (const ev of game.drainSoundEvents()) sound.handle(ev);
    sound.advance(period / 1000);
    feed();
    acc -= period;
  }
  if (acc > game.framePeriodMs) acc = game.framePeriodMs;
  screen2d.draw(game.screen);
  view3d.render(acc / game.framePeriodMs);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
