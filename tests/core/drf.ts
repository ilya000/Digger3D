// Reader for Digger Remastered recordings (.drf). They hold the level maps, the
// random seed of every life and the controls of every frame, which makes them
// long, varied test inputs. The core replays them through its playback hook.

import { Dir } from "../../src/contracts";
import type { LevelMap } from "../../src/assets/types";
import type { PlaybackSource } from "../../src/core/index";

class Drf implements PlaybackSource {
  readonly players: 1 | 2;
  readonly startLevel: number;
  readonly bonusScore: number;
  readonly levels: LevelMap[];
  private pos = 0;
  private runLeft = 0;
  private runChar = "s";

  constructor(
    private readonly body: string,
    header: { players: 1 | 2; startLevel: number; bonusScore: number; levels: LevelMap[] },
  ) {
    this.players = header.players;
    this.startLevel = header.startLevel;
    this.bonusScore = header.bonusScore;
    this.levels = header.levels;
  }

  nextSeed(): number {
    if (this.body[this.pos] === "*") this.pos += 4; // initials of a finished game
    let r = 0;
    for (let i = 0; i < 8; i++) {
      const c = this.body[this.pos++];
      const d = parseInt(c ?? "0", 16);
      if (!Number.isNaN(d)) r |= d << ((7 - i) << 2);
    }
    return r | 0;
  }

  nextControl(): { dir: Dir; fire: boolean } | null {
    if (this.runLeft > 0) {
      this.runLeft--;
      return decode(this.runChar);
    }
    const c = this.body[this.pos];
    if (c === undefined || c === "E" || c === "e") return null;
    this.runChar = this.body[this.pos++];
    let n = 0;
    while (this.pos < this.body.length && this.body[this.pos] >= "0" && this.body[this.pos] <= "9")
      n = n * 10 + Number(this.body[this.pos++]);
    this.runLeft = n;
    if (this.runLeft > 0) this.runLeft--;
    return decode(this.runChar);
  }

  endOfLife(): void {
    this.pos += 3; // "EOL"
  }
}

function decode(d: string): { dir: Dir; fire: boolean } {
  const fire = d >= "A" && d <= "Z";
  switch (d.toLowerCase()) {
    case "r":
      return { dir: Dir.Right, fire };
    case "u":
      return { dir: Dir.Up, fire };
    case "l":
      return { dir: Dir.Left, fire };
    case "d":
      return { dir: Dir.Down, fire };
    default:
      return { dir: Dir.None, fire };
  }
}

/** Parses a .drf file. Recordings of the two-digger mode are not supported. */
export function loadDrf(text: string): PlaybackSource {
  const lines = text.split(/\r?\n/);
  if (!lines[0].startsWith("DRF")) throw new Error("not a DRF recording");
  const mode = lines[2];
  let players: 1 | 2 = 1;
  let x = 0;
  if (mode[0] === "1") {
    players = 1;
    x = 1;
  } else if (mode[0] === "2") {
    players = 2;
    x = 1;
  } else throw new Error(`unsupported recording mode "${mode}"`);
  if (mode[x] === "U") x++;
  const startLevel = mode[x] === "I" ? parseInt(mode.slice(x + 1), 10) : 1;
  const bonusScore = parseInt(lines[3], 10);
  const levels: LevelMap[] = [];
  for (let l = 0; l < 8; l++) {
    const rows: string[] = [];
    for (let y = 0; y < 10; y++) rows.push(lines[4 + l * 10 + y].padEnd(15, " ").slice(0, 15));
    levels.push(rows);
  }
  // The rest is one long string; line breaks are only there for mailing.
  const body = lines
    .slice(84)
    .join("")
    .replace(/[^\x20-\x7e]/g, "");
  return new Drf(body, { players, startLevel, bonusScore, levels });
}
