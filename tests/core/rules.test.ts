// Rules of the original that the recorded games do not reach, so that they are
// pinned down here instead: the score wrapping at a million and what that does
// to extra lives, the limit of four spare lives, the extra life player 2 gets
// one point late, and the order the eight level maps repeat in.
//
// Every one of them is described in the reference's own documentation
// (vendor/digger/digger.txt, "Frequently asked questions") and implemented the
// same way in the reference sources (scores.c: addscore, main.c: levelplan).

import { describe, expect, it } from "vitest";
import { standinAssets } from "../../src/assets/standin";
import { World } from "../../src/core/world";

function world(players = 1): World {
  const w = new World(standinAssets, {});
  w.nPlayers = players;
  w.digger.initLives();
  w.scores.zero();
  return w;
}

/** Adds points the way the game does, in amounts that fit in an int16. */
function score(w: World, player: number, points: number): void {
  let left = points;
  while (left > 0) {
    const step = Math.min(25000, left);
    w.scores.add(player, step);
    left -= step;
  }
}

describe("rules of the original the recordings do not reach", () => {
  it("gives an extra life every 20,000 points, at most four spare ones", () => {
    const w = world();
    expect(w.digger.lives(0)).toBe(3);
    score(w, 0, 20000);
    expect(w.digger.lives(0)).toBe(4);
    score(w, 0, 20000);
    expect(w.digger.lives(0)).toBe(5);
    // the fifth life is the last one the original hands out
    score(w, 0, 20000);
    expect(w.digger.lives(0)).toBe(5);
    score(w, 0, 20000);
    expect(w.digger.lives(0)).toBe(5);
  });

  it("makes player 2 wait one point longer for the extra life", () => {
    const w = world(2);
    score(w, 1, 19999);
    w.scores.add(1, 1); // exactly 20,000 - not enough for player 2
    expect(w.digger.lives(1)).toBe(3);
    w.scores.add(1, 1); // 20,001
    expect(w.digger.lives(1)).toBe(4);
  });

  it("wraps the score at a million and then gives no more lives", () => {
    const w = world();
    score(w, 0, 980000);
    expect(w.scores.score[0]).toBe(980000);
    expect(w.digger.lives(0)).toBe(5); // the four spare ones are long since collected
    score(w, 0, 25000); // over the million
    expect(w.scores.score[0]).toBe(0);
    // the game keeps counting from zero while the next bonus stays above a
    // million, so no extra life is ever given again
    score(w, 0, 500000);
    expect(w.digger.lives(0)).toBe(5);
  });

  it("repeats the level maps as 1-8, then 6,7,8, then 5,6,7,8", () => {
    const w = world();
    const plans: number[] = [];
    for (let level = 1; level <= 20; level++) {
      w.level[0] = level;
      plans.push(w.levelPlan());
    }
    expect(plans).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8, 5]);
  });

  it("stops making the game harder after level 10", () => {
    const w = world();
    for (const [level, difficulty] of [
      [1, 1],
      [9, 9],
      [10, 10],
      [11, 10],
      [1000, 10],
    ]) {
      w.level[0] = level;
      expect(w.levof10()).toBe(difficulty);
    }
  });
});
