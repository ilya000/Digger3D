import type { AssetBundle } from "../assets/types";
import type { GameView, InputSource } from "../contracts";
import { createGame, type Game } from "../core";

const IDLE: InputSource = { isDown: () => false, nextKey: () => null };

/** An input source that presses one key once (to leave a title screen). */
function pressOnce(code: string): InputSource {
  let left = 1;
  return { isDown: () => false, nextKey: () => (left-- > 0 ? code : null) };
}

/**
 * What the 3D window shows while the game itself is on the title screen.
 *
 * A second, hidden copy of the core plays the eight levels of the original one
 * after another - the same earth, tunnels, emeralds, bags and monsters as in a
 * real game - so that the world outside is a living playfield instead of an
 * empty slab. It is only ever read: no sound, no scores, no keyboard.
 */
export class Attract {
  private game!: Game;
  private level = 0;
  private frames = 0;

  /** `framesPerLevel` at the game's 12.5 frames per second (110 ~ 9 s). */
  constructor(
    private readonly assets: AssetBundle,
    private readonly framesPerLevel = 110,
  ) {
    this.next();
  }

  /** Level being shown, 1..8. */
  get level3D(): number {
    return this.level;
  }

  private next(): void {
    this.level = (this.level % 8) + 1;
    this.frames = 0;
    this.game = createGame(this.assets, { startLevel: this.level });
  }

  /** Advances the demo by one frame and returns the view for the 3D window. */
  step(): GameView {
    const playing = this.game.view.inLevel;
    if (playing && ++this.frames >= this.framesPerLevel) this.next();
    // outside a level the hidden game waits on its title screen (and the very
    // first press there is swallowed, as in the original), so keep pressing
    this.game.step(this.game.view.inLevel ? IDLE : pressOnce("KeyA"));
    this.game.drainSoundEvents(); // the demo is silent; keep the queue empty
    const view = this.game.view;
    // never "in a level": the camera of the 3D window stays outside, because
    // nobody is sitting in this digger's cabin
    return { ...view, inLevel: false };
  }
}
