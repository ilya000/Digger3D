import { initialOf } from "./keyboard";
import { Cmd, Tune } from "./sound";
import { TitleAnimation } from "./title";
import { WHOLE_FRAME, type Flow, type World } from "./world";

/**
 * The program of the original, as frame-stepped flows: title screen with the
 * attract animation, the game itself, the pause, the end of a game and the
 * entry of initials for a high score. Everything that "waits" in the original
 * yields here, so the core never blocks.
 */
export function* mainProgram(w: World): Flow {
  w.scores.loadTable();
  w.keys.escape = false;
  if (w.playback) {
    w.nPlayers = w.playback.players;
    yield* playGame(w);
    return;
  }
  const title = new TitleAnimation(w);
  for (;;) {
    w.snd.post(Cmd.Stop);
    title.reset();
    w.createSprites();
    w.screen.clear();
    w.levelOnScreen = false;
    w.screen.showTitle();
    if (w.originalTitlePalette) {
      // the original shows the title in palette 1 at high intensity
      w.screen.setPalette(1);
      w.screen.setIntensity(1);
    }
    w.text("D I G G E R", 100, 0, 3);
    w.showPlayers();
    w.scores.showTable();
    let frame = 0;
    let started = false;
    yield* w.newFrame();
    w.keys.takeStart();
    while (!started) {
      started = w.keys.takeStart();
      if (w.keys.playersChange) {
        w.nPlayers = w.nPlayers === 1 ? 2 : 1;
        w.showPlayers();
        w.scores.showTable();
        w.keys.playersChange = false;
      }
      title.step(frame);
      yield* w.newFrame();
      frame++;
      if (frame > TitleAnimation.LAST_FRAME) frame = 0;
    }
    title.reset();
    if (w.keys.escape) {
      // F10 on the title screen ends the program in the original; in a browser
      // there is nothing to end, so the title simply starts again.
      w.keys.escape = false;
      continue;
    }
    yield* playGame(w);
    w.keys.escape = false;
  }
}

/** One game: levels, lives, both players in turn. */
function* playGame(w: World): Flow {
  w.inGame = true;
  w.digger.initLives();
  w.level[0] = w.startLevel;
  if (w.nPlayers === 2) w.level[1] = w.startLevel;
  w.allDead = false;
  w.screen.clear();
  w.levelOnScreen = false;
  // Both players' levels are set up, even in a one-player game (the second
  // player's "level 0" has an empty map).
  w.curPlayer = 0;
  w.initLevel();
  w.curPlayer = 1;
  w.initLevel();
  w.curPlayer = 0;
  w.scores.zero();
  w.bonusVisible = true;
  let flashPlayer = w.nPlayers === 2;
  while (w.digger.allLives() !== 0 && !w.keys.escape) {
    while (!w.allDead && !w.keys.escape) {
      w.initSprites();
      w.rng.reseed(w.newSeed());
      if (w.levNotDrawn) {
        w.levNotDrawn = false;
        yield* drawScreen(w);
        if (flashPlayer) {
          flashPlayer = false;
          const label = `PLAYER ${w.curPlayer + 1}`;
          w.clearTopLine();
          for (let t = 0; t < 15; t++)
            for (let c = 1; c <= 3; c++) {
              w.text(label, 108, 0, c);
              w.scores.writeCurrent(c);
              yield* w.newFrame();
              if (w.keys.escape) {
                w.inGame = false;
                return;
              }
            }
          w.scores.drawScores();
          w.scores.add(0, 0);
        }
      } else {
        w.initSprites();
        w.digger.init();
        w.monsters.init();
      }
      w.eraseText(8, 108, 0, 3);
      w.scores.initScores();
      w.drawLives();
      w.snd.music(Tune.Main);
      w.keys.flush();
      w.keys.resetDirections();
      const cur = w.curPlayer;
      while (!w.allDead && !w.levDone[cur] && !w.keys.escape) {
        w.penalty = 0;
        yield* w.newFrame();
        if (w.keys.escape) break;
        w.digger.doDiggers();
        w.monsters.doMonsters();
        w.bags.doBags();
        if (w.penalty > 8) w.monsters.incTime(w.penalty - 8);
        w.checkLevelDone();
        yield* testPause(w);
        if (w.keys.escape) break;
      }
      w.digger.eraseAll();
      w.snd.post(Cmd.MusicOff);
      let t = 20;
      while ((w.bags.movingCount() !== 0 || t !== 0) && !w.keys.escape) {
        if (t !== 0) t--;
        w.penalty = 0;
        yield* w.newFrame();
        if (w.keys.escape) break;
        w.bags.doBags();
        w.digger.doDiggers();
        w.monsters.doMonsters();
        if (w.penalty < 8) t = 0;
      }
      w.snd.post(Cmd.Stop);
      w.digger.killFire(0);
      w.eraseBonus();
      w.bags.cleanup();
      w.field.store(cur);
      w.monsters.erase();
      w.playback?.endOfLife();
      if (w.levDone[cur]) yield* levelDoneJingle(w);
      if (w.countEmeralds() === 0 || w.levDone[cur]) {
        if (w.digger.lives(cur) > 0 && !w.digger.alive(cur)) w.digger.decLife(cur);
        w.drawLives();
        w.level[cur]++;
        if (w.level[cur] > 1000) w.level[cur] = 1000;
        w.initLevel();
      } else if (w.allDead) {
        if (w.digger.lives(cur) > 0) w.digger.decLife(cur);
        w.drawLives();
      }
      if (w.allDead && w.digger.allLives() === 0 && !w.keys.escape) yield* endOfGame(w);
    }
    w.allDead = false;
    if (w.nPlayers === 2 && w.digger.lives(1 - w.curPlayer) !== 0) {
      w.curPlayer = 1 - w.curPlayer;
      flashPlayer = true;
      w.levNotDrawn = true;
    }
  }
  w.inGame = false;
}

/** Paints the level: earth, tunnels, bags, emeralds, and places the characters. */
function* drawScreen(w: World): Flow {
  w.screen.clear();
  w.createSprites();
  w.levelOnScreen = true;
  w.field.restore(w.curPlayer);
  w.screen.setPalette(0);
  w.screen.setIntensity(0);
  w.drawBackground(w.levelPlan());
  yield* w.drawField();
  yield* w.bags.drawAll();
  yield* w.drawEmeralds();
  w.digger.init();
  w.monsters.init();
}

function* testPause(w: World): Flow {
  if (!w.keys.pauseRequested) {
    w.snd.post(Cmd.PauseOff);
    return;
  }
  w.paused = true;
  w.snd.post(Cmd.PauseOn);
  w.clearTopLine();
  w.text("PRESS ANY KEY", 80, 0, 1);
  yield* w.waitKey();
  w.clearTopLine();
  w.scores.drawScores();
  w.scores.add(0, 0);
  w.drawLives();
  yield WHOLE_FRAME;
  w.keys.pauseRequested = false;
  w.paused = false;
  w.snd.post(Cmd.PauseOff);
}

/** Waits for the level-completed jingle to play through. */
function* levelDoneJingle(w: World): Flow {
  w.snd.post(Cmd.Stop);
  if (!w.snd.available) return;
  const ack = w.snd.allocAck();
  w.snd.post(Cmd.LevelDoneStart, 0, ack);
  while (!w.keys.escape) {
    if (w.snd.pollAck()) break;
    yield WHOLE_FRAME;
    w.keys.poll();
  }
  w.snd.post(Cmd.LevelDoneOff, 0, ack);
}

function* endOfGame(w: World): Flow {
  w.scores.add(0, 0);
  if (w.playback) return;
  let entered = false;
  const n = w.curPlayer;
  const score = w.scores.score[n];
  if (w.scores.isHighScore(score)) {
    w.screen.clear();
    w.levelOnScreen = false;
    w.scores.drawScores();
    w.text(`PLAYER ${n + 1}`, 108, 0, 2);
    w.text(" NEW HIGH SCORE ", 64, 40, 2);
    const initials = yield* getInitials(w);
    w.scores.insert(score, initials);
    entered = true;
  }
  if (!entered) {
    w.clearTopLine();
    w.text("GAME OVER", 104, 0, 3);
    for (let i = 0; i < 50 && !w.keys.escape; i++) yield* w.newFrame();
    w.eraseText(9, 104, 0, 3);
  }
}

/** Types three initials for the high-score table. */
function* getInitials(w: World): Flow<string> {
  yield* w.newFrame();
  w.text("ENTER YOUR", 100, 70, 3);
  w.text(" INITIALS", 100, 90, 3);
  w.text("_ _ _", 128, 130, 3);
  const initials = [".", ".", "."];
  w.snd.speakerOff();
  for (let i = 0; i < 3; i++) {
    let k = 0;
    while (k === 0) {
      k = yield* getInitial(w, i * 24 + 128, 130);
      if (k === 8) {
        if (i > 0) i--;
        k = 0;
      }
    }
    const ch = String.fromCharCode(k);
    w.screen.writeChar(i * 24 + 128, 130, ch, 3);
    initials[i] = ch;
  }
  for (let i = 0; i < 20; i++) yield* flashyWait(w);
  w.snd.speakerOn(true);
  w.screen.clear();
  w.levelOnScreen = false;
  w.screen.setPalette(0);
  w.screen.setIntensity(0);
  return initials.join("");
}

/** One character: only letters and digits count, backspace (8) goes back. */
function* getInitial(w: World, x: number, y: number): Flow<number> {
  w.screen.writeChar(x, y, "_", 3);
  for (;;) {
    for (let i = 0; i < 40; i++) {
      if (w.keys.hasKey()) {
        const k = initialOf(w.keys.takeKey()!);
        if (k === null || k === 8) continue;
        return k;
      }
      yield* flashyWait(w);
    }
    for (let i = 0; i < 40; i++) {
      if (w.keys.hasKey()) {
        w.screen.writeChar(x, y, "_", 3);
        return initialOf(w.keys.takeKey()!) ?? 0;
      }
      yield* flashyWait(w);
    }
  }
}

/** A frame of the flashing wait used while initials are being typed. */
function* flashyWait(w: World): Flow {
  yield WHOLE_FRAME;
  // The original flashes between the two palettes within the frame and ends on 0.
  w.screen.setPalette(0);
}
