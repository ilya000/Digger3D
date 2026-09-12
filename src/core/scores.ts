import type { World } from "./world";
import { int16 } from "./world";

export interface HighScoreEntry {
  /** Three characters ('.' for an empty slot). */
  readonly initials: string;
  readonly score: number;
}

/**
 * Persistence of the high-score table. The app keeps it in the browser, or on
 * the server when the table is shared by everyone who plays (`added` is the
 * entry that has just been achieved, so a shared table can be merged instead
 * of overwritten).
 */
export interface HighScoreStorage {
  load(): readonly HighScoreEntry[] | null;
  save(table: readonly HighScoreEntry[], added: HighScoreEntry): void;
}

/** Scores of both players, extra lives and the high-score table. */
export class Scores {
  readonly score = [0, 0];
  private readonly nextBonus = [0, 0];
  /** Points beyond 999,999 (the display wraps to 0). */
  private readonly total = [0, 0];
  bonusScore = 20000;
  /** Entries 1..10 of the table (index 0 unused). */
  private readonly highScore = new Array<number>(11).fill(0);
  private readonly highInitials = new Array<string>(11).fill("...");

  constructor(
    private readonly w: World,
    private readonly storage: HighScoreStorage | null,
  ) {}

  loadTable(): void {
    const t = this.storage?.load() ?? null;
    for (let i = 1; i <= 10; i++) {
      const e = t?.[i - 1];
      this.highScore[i] = e ? e.score : 0;
      this.highInitials[i] = e ? e.initials : "...";
    }
  }

  table(): HighScoreEntry[] {
    const out: HighScoreEntry[] = [];
    for (let i = 1; i <= 10; i++) out.push({ initials: this.highInitials[i], score: this.highScore[i] });
    return out;
  }

  isHighScore(score: number): boolean {
    return score > this.highScore[10];
  }

  /** Inserts a new entry (below equal scores already in the table) and saves. */
  insert(score: number, initials: string): void {
    let j: number;
    for (j = 10; j > 1; j--) if (score < this.highScore[j - 1]) break;
    for (let i = 10; i > j; i--) {
      this.highScore[i] = this.highScore[i - 1];
      this.highInitials[i] = this.highInitials[i - 1];
    }
    this.highScore[j] = score;
    this.highInitials[j] = initials;
    this.storage?.save(this.table(), { initials, score });
  }

  zero(): void {
    this.score[0] = this.score[1] = 0;
    this.total[0] = this.total[1] = 0;
    this.nextBonus[0] = this.nextBonus[1] = this.bonusScore;
  }

  private writeScore(n: number, c: number): void {
    const s = this.score[n];
    if (n === 0) this.w.writeNumber(s, 0, 0, 6, c);
    else this.w.writeNumber(s, s < 100000 ? 236 : 248, 0, 6, c);
  }

  /** The current player's score in colour c (the "PLAYER n" flash). */
  writeCurrent(c: number): void {
    this.writeScore(this.w.curPlayer, c);
  }

  drawScores(): void {
    this.writeScore(0, 3);
    if (this.w.nPlayers === 2) this.writeScore(1, 3);
  }

  /** Redraws player 1's score in the active colour (called at the start of a life). */
  initScores(): void {
    this.add(0, 0);
  }

  /** Adds points (a signed 16-bit amount, as in the original) and handles extra lives. */
  add(n: number, points: number): void {
    const w = this.w;
    this.score[n] += int16(points);
    if (this.score[n] > 999999) {
      this.total[n] += this.score[n];
      this.score[n] = 0;
    }
    this.writeScore(n, 1);
    // "+ n": player 2 gets the life only after the multiple, as in the original.
    if (this.score[n] >= this.nextBonus[n] + n) {
      if (w.digger.lives(n) < 5) {
        w.digger.addLife(n);
        w.drawLives();
      }
      this.nextBonus[n] += this.bonusScore;
    }
    w.incPenalty();
    w.incPenalty();
    w.incPenalty();
  }

  kill(n: number): void {
    this.add(n, 250);
  }
  emerald(n: number): void {
    this.add(n, 25);
  }
  octave(n: number): void {
    this.add(n, 250);
  }
  gold(n: number): void {
    this.add(n, 500);
  }
  bonus(n: number): void {
    this.add(n, 1000);
  }
  eatMonster(n: number, multiplier: number): void {
    this.add(n, multiplier * 200);
  }

  /** The table on the title screen. */
  showTable(): void {
    const w = this.w;
    w.eraseText(11, 16, 25, 3);
    for (let i = 0; i < 10; i++) w.eraseText(11, 16, 44 + 13 * i, 3);
    w.text("HIGH SCORES", 16, 25, 3);
    let col = 2;
    for (let i = 1; i <= 10; i++) {
      w.text(`${this.highInitials[i]}  ${String(this.highScore[i]).padStart(6, " ")}`, 16, 31 + 13 * i, col);
      col = 1;
    }
  }
}
