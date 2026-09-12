// Runs an input script through the core and produces reference-shaped trace lines.

import type { InputSource } from "../../src/contracts";
import { createGame, type Game, type GameOptions } from "../../src/core/index";
import { remasteredAssets } from "../../src/assets/fromRemastered";
import { formatLine, packScreen } from "./trace";

export interface ScriptEvent {
  t: number;
  op: "down" | "up" | "tap";
  code: string;
}

export interface Script {
  events: ScriptEvent[];
  end: number;
  /** Time points at which the whole screen is compared pixel by pixel. */
  screensAt: number[];
}

/** Parses the script format shared with the reference harness. */
export function parseScript(text: string): Script {
  const events: ScriptEvent[] = [];
  const screensAt: number[] = [];
  let end = Number.MAX_SAFE_INTEGER;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("fb ")) {
      for (const n of line.slice(3).split(",")) screensAt.push(Number(n.trim()));
      continue;
    }
    const [t, op, code] = line.split(/\s+/);
    if (op === "end") {
      end = Number(t);
      continue;
    }
    events.push({ t: Number(t), op: op as ScriptEvent["op"], code });
  }
  return { events, end, screensAt };
}

/** Keyboard fed from a script: events are applied at their time point. */
export class ScriptedInput implements InputSource {
  private pos = 0;
  private readonly down = new Set<string>();
  private readonly queue: string[] = [];

  constructor(private readonly events: readonly ScriptEvent[]) {}

  /** Time has advanced to time point `t`: apply everything scheduled up to it. */
  advanceTo(t: number): void {
    while (this.pos < this.events.length && this.events[this.pos].t <= t) {
      const e = this.events[this.pos++];
      if (e.op === "down") {
        this.down.add(e.code);
        this.queue.push(e.code);
      } else if (e.op === "up") this.down.delete(e.code);
      else this.queue.push(e.code);
    }
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  nextKey(): string | null {
    return this.queue.shift() ?? null;
  }
}

export interface RunResult {
  lines: string[];
  /** Screens dumped at the requested time points, as packed hex. */
  screens: Map<number, string>;
  game: Game;
}

/** Plays a script through the core, collecting one trace line per time point. */
export function runScript(script: Script, opts: GameOptions = {}, screensAt: readonly number[] = []): RunResult {
  const lines: string[] = [];
  const screens = new Map<number, string>();
  const input = new ScriptedInput(script.events);
  const wanted = new Set(screensAt);
  let stop = false;
  let game!: Game;
  game = createGame(remasteredAssets, {
    ...opts,
    // the reference draws its title screen in VGA and never switches the CGA
    // palette there; our own title follows the original (see WorldOptions)
    titlePalette: "reference",
    traceSound: true,
    onTimePoint: (t, mult) => {
      if (t >= script.end) {
        stop = true;
        return;
      }
      const state = game.inspect();
      lines.push(formatLine(t, mult, state));
      if (wanted.has(t)) screens.set(t, packScreen(state.pixels));
      input.advanceTo(t);
    },
  });
  while (!stop) {
    const before = lines.length;
    game.step(input);
    if (lines.length === before) break; // the program ended (e.g. a recording ran out)
  }
  return { lines, screens, game };
}
