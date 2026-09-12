import type { SoundEvent } from "../contracts";
import type { SoundName } from "./soundNames";

/** Tunes the game asks for. */
export const enum Tune {
  Bonus = 0,
  Main = 1,
  Dirge = 2,
}

/** Commands the game sends to the sound system (mirrors the effect set of the original). */
export const enum Cmd {
  Stop,
  LevelDoneStart,
  LevelDoneOff,
  FallOn,
  FallOff,
  Break,
  WobbleOn,
  WobbleOff,
  FireOn,
  FireOff,
  Explode,
  BonusOn,
  BonusOff,
  Em,
  Emerald,
  Gold,
  EatMonster,
  DiggerDie,
  ExtraLife,
  Music,
  MusicOff,
  SoundToggle,
  MusicToggle,
  PauseOn,
  PauseOff,
}

const TUNE_NAMES = ["bonus", "main", "dirge"] as const;

/** Samples per second of the modelled sound clock, and samples per sound tick (~72.8 Hz). */
const SAMPLE_RATE_NUM = 441; // samples per 10 ms
const TICK_SAMPLES = 606;

/** The dirge: [note, length] pairs; lengths are in units of 10 sound ticks. */
const DIRGE: readonly number[] = [
  0x7d00, 2, 0x11d1, 6, 0x11d1, 4, 0x11d1, 2, 0x11d1, 6, 0x0efb, 4, 0x0fdf, 2, 0x0fdf, 4, 0x11d1, 2,
  0x11d1, 4, 0x12e0, 2, 0x11d1, 12, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16,
  0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d64,
];
const REST = 0x7d00;
const END = 0x7d64;

interface Pending {
  cmd: Cmd;
  arg: number;
  ack: number;
}

/**
 * Sound output of the core.
 *
 * Every command becomes a SoundEvent for the sound engine. In addition the core
 * keeps a timing model of the original sound driver, because the game itself
 * waits for two sounds to finish: the level-completed jingle and (in the
 * 1-digger game) the dirge after a death. The model runs a 44.1 kHz sample clock
 * advanced by the game's waits, with a sound tick every 606 samples (the
 * original's ~72.8 Hz timer), and reproduces when those sounds end - so the game
 * progresses identically with or without a sound engine. With
 * `external` timing the ends come from the sound engine instead
 * (Game.soundFinished).
 */
export class SoundOut {
  private events: SoundEvent[] = [];
  /** Compact log of commands for trace comparisons (only when enabled). */
  traceLog: string[] | null = null;

  // --- timing model of the sound driver ---
  private queue: Pending[] = [];
  private step = 0;
  private deviceOn = false;
  private sndOn = false;
  private soundFlag = true;
  private musicFlag = true;
  private restoreMusicFlag = false;
  private paused = false;
  private levActive = false;
  private levNote = 0;
  private levLeft = 0;
  private levAck = 0;
  private musicPlaying = false;
  private tune: Tune = Tune.Bonus;
  private musicPos = 0;
  private noteLeft = 0;
  private musicUnit = 0;
  private musicAck = 0;
  private dieOn = false;
  private dieN = 0;
  private dieValue = 0;
  /** Acknowledgements delivered by the driver and not yet collected (FIFO). */
  private acks = 0;
  private nextAckId = 0;

  constructor(private readonly external: boolean) {}

  drain(): SoundEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Power-up: the sound driver is running (one tick happens immediately). */
  start(): void {
    this.sndOn = true;
    this.speakerOn(true);
  }

  /** Whether background music is switched on (decides how long a death takes). */
  get musicOn(): boolean {
    return this.musicFlag;
  }

  // ------------------------------------------------------------ game side

  post(cmd: Cmd, arg = 0, ack = 0): void {
    this.emit(cmd, arg, ack);
    this.queue.push({ cmd, arg, ack });
  }

  /** Whether sound is currently on (the game skips waiting for sounds otherwise). */
  get available(): boolean {
    return this.sndOn;
  }

  /** Starts a tune and returns a ticket that becomes ready when it has played through. */
  musicWithAck(tune: Tune): number {
    if (!this.available) {
      this.post(Cmd.Music, tune);
      return 0;
    }
    const id = this.allocAck();
    this.post(Cmd.Music, tune, id);
    return id;
  }

  music(tune: Tune): void {
    this.post(Cmd.Music, tune);
  }

  allocAck(): number {
    this.nextAckId = (this.nextAckId + 1) & 0xffff;
    if (this.nextAckId === 0) this.nextAckId = 1;
    return this.nextAckId;
  }

  /** Collects an acknowledgement for a ticket (0 = nothing to wait for). */
  ackReady(id: number): boolean {
    if (id === 0) return true;
    return this.pollAck();
  }

  pollAck(): boolean {
    if (this.acks > 0) {
      this.acks--;
      return true;
    }
    return false;
  }

  /** Sound engine report (external timing): a waited-for sound has ended. */
  externalFinished(which: "levelDone" | "dirge"): void {
    if (!this.external) return;
    if (which === "levelDone" && this.levActive) this.levelDoneOff();
    if (which === "dirge" && this.musicAck !== 0) {
      this.acks++;
      this.musicAck = 0;
    }
  }

  /** The speaker is switched off (sound clock stops) / on again (with one immediate tick). */
  speakerOff(): void {
    this.deviceOn = false;
    this.emitSpeaker(false);
  }

  speakerOn(withTick: boolean): void {
    if (withTick) this.tick();
    this.deviceOn = true;
    this.emitSpeaker(true);
  }

  /** Time passes: `framePeriodUs / mult` of sound clock. */
  advance(framePeriodUs: number, mult: number): void {
    if (!this.deviceOn) return;
    const n = Math.floor(Math.floor((framePeriodUs * SAMPLE_RATE_NUM) / 10000) / mult);
    const ticks = Math.floor((this.step + n) / TICK_SAMPLES) - Math.floor(this.step / TICK_SAMPLES);
    this.step += n;
    for (let i = 0; i < ticks; i++) this.tick();
  }

  // ------------------------------------------------------------ driver model

  private tick(): void {
    const q = this.queue;
    this.queue = [];
    for (const p of q) this.apply(p);
    if (this.soundFlag && !this.sndOn) {
      this.sndOn = true;
      this.musicFlag = true;
    }
    if (!this.soundFlag && this.sndOn) this.sndOn = false;
    if (this.sndOn && !this.paused) {
      if (this.musicFlag) this.musicUpdate();
      this.dieUpdate();
    }
    if (this.levActive) this.levelDoneUpdate();
  }

  private pushAck(id: number): void {
    if (id !== 0) this.acks++;
  }

  private apply(p: Pending): void {
    switch (p.cmd) {
      case Cmd.Stop:
        this.levelDoneOff();
        if (this.musicAck !== 0) {
          this.pushAck(this.musicAck);
          this.musicAck = 0;
        }
        this.musicOff();
        this.dieOn = false;
        break;
      case Cmd.LevelDoneStart:
        if (this.sndOn) {
          this.levNote = 0;
          this.levLeft = 20;
          this.levActive = true;
          this.levAck = p.ack;
          this.paused = true;
        } else {
          this.levActive = false;
          this.levAck = 0;
          this.pushAck(p.ack);
        }
        break;
      case Cmd.LevelDoneOff:
        this.levelDoneOff();
        break;
      case Cmd.DiggerDie:
        this.dieN = 0;
        this.dieValue = 20000;
        this.dieOn = true;
        break;
      case Cmd.Music:
        this.startMusic(p.arg as Tune, p.ack);
        break;
      case Cmd.MusicOff:
        this.musicOff();
        break;
      case Cmd.SoundToggle:
        this.soundFlag = !this.soundFlag;
        break;
      case Cmd.MusicToggle:
        this.musicFlag = !this.musicFlag;
        break;
      case Cmd.PauseOn:
        this.paused = true;
        break;
      case Cmd.PauseOff:
        this.paused = false;
        break;
      default:
        break;
    }
  }

  private levelDoneOff(): void {
    this.levActive = false;
    this.paused = false;
    if (this.levAck !== 0) {
      this.pushAck(this.levAck);
      this.levAck = 0;
    }
  }

  private levelDoneUpdate(): void {
    if (!this.sndOn) {
      this.levelDoneOff();
      return;
    }
    if (this.levLeft > 0) this.levLeft--;
    else {
      this.levLeft = 20;
      this.levNote++;
      if (this.levNote > 10 && !this.external) this.levelDoneOff();
    }
  }

  private startMusic(tune: Tune, ack: number): void {
    if (this.musicAck !== 0) {
      this.pushAck(this.musicAck);
      this.musicAck = 0;
    }
    if (!this.sndOn) {
      this.pushAck(ack);
      return;
    }
    this.musicPos = 0;
    this.noteLeft = 0;
    this.tune = tune;
    if (tune === Tune.Dirge) {
      if (!this.musicFlag) {
        this.musicFlag = true;
        this.restoreMusicFlag = true;
      }
      this.musicUnit = 10;
    }
    this.musicPlaying = true;
    if (tune === Tune.Dirge) {
      this.dieOn = false;
      this.musicAck = ack;
    }
  }

  private musicOff(): void {
    this.musicPlaying = false;
    this.musicPos = 0;
    if (this.musicAck !== 0) {
      this.pushAck(this.musicAck);
      this.musicAck = 0;
    }
    if (this.restoreMusicFlag) {
      this.musicFlag = false;
      this.restoreMusicFlag = false;
    }
  }

  /** Only the dirge's progress matters for timing; other tunes just play. */
  private musicUpdate(): void {
    if (!this.musicPlaying || this.tune !== Tune.Dirge) return;
    if (this.noteLeft !== 0) {
      this.noteLeft--;
      return;
    }
    this.noteLeft = DIRGE[this.musicPos + 1] * this.musicUnit;
    if (this.musicPos > 0 && DIRGE[this.musicPos] === REST) {
      if (this.musicAck !== 0 && !this.external) {
        this.pushAck(this.musicAck);
        this.musicAck = 0;
      }
      if (this.restoreMusicFlag) {
        this.musicFlag = false;
        this.restoreMusicFlag = false;
      }
    }
    this.musicPos += 2;
    if (DIRGE[this.musicPos] === END) this.musicPos = 0;
  }

  private dieUpdate(): void {
    if (!this.dieOn) return;
    this.dieN++;
    if (this.dieN === 1) this.musicOff();
    if (this.dieN >= 1 && this.dieN <= 10) this.dieValue = 20000 - this.dieN * 1000;
    if (this.dieN > 10) this.dieValue += 500;
    if (this.dieValue > 30000) this.dieOn = false;
  }

  // ------------------------------------------------------------ events

  private emitSpeaker(on: boolean): void {
    this.events.push({ kind: "speaker", on });
    this.traceLog?.push(on ? "ki" : "ko");
  }

  private emit(cmd: Cmd, arg: number, ack: number): void {
    const ev = (kind: "start" | "stop", sound: SoundName, a?: number): void => {
      this.events.push(a === undefined ? { kind, sound } : { kind, sound, arg: a });
    };
    const log = this.traceLog;
    switch (cmd) {
      case Cmd.Stop:
        ev("stop", "all");
        log?.push("st");
        break;
      case Cmd.LevelDoneStart:
        ev("start", "levelDone");
        log?.push("ls");
        break;
      case Cmd.LevelDoneOff:
        ev("stop", "levelDone");
        log?.push("lo");
        break;
      case Cmd.FallOn:
        ev("start", "bagFall");
        log?.push("f1");
        break;
      case Cmd.FallOff:
        ev("stop", "bagFall");
        log?.push("f0");
        break;
      case Cmd.Break:
        ev("start", "bagBreak");
        log?.push("br");
        break;
      case Cmd.WobbleOn:
        ev("start", "bagWobble");
        log?.push("w1");
        break;
      case Cmd.WobbleOff:
        ev("stop", "bagWobble");
        log?.push("w0");
        break;
      case Cmd.FireOn:
        ev("start", "fire", arg);
        log?.push(`fi${arg}`);
        break;
      case Cmd.FireOff:
        ev("stop", "fire", arg);
        log?.push(`fo${arg}`);
        break;
      case Cmd.Explode:
        ev("start", "explode", arg);
        log?.push(`ex${arg}`);
        break;
      case Cmd.BonusOn:
        ev("start", "bonus");
        log?.push("b1");
        break;
      case Cmd.BonusOff:
        ev("stop", "bonus");
        log?.push("b0");
        break;
      case Cmd.Em:
        ev("start", "emerald");
        log?.push("em");
        break;
      case Cmd.Emerald:
        ev("start", "emeraldStreak", arg);
        log?.push(`e${arg}`);
        break;
      case Cmd.Gold:
        ev("start", "gold");
        log?.push("go");
        break;
      case Cmd.EatMonster:
        ev("start", "eatMonster");
        log?.push("ea");
        break;
      case Cmd.DiggerDie:
        ev("start", "diggerDeath");
        log?.push("dd");
        break;
      case Cmd.ExtraLife:
        ev("start", "oneUp");
        log?.push("up");
        break;
      case Cmd.Music:
        this.events.push({ kind: "music", tune: TUNE_NAMES[arg] });
        log?.push(`m${arg}${ack ? "a" : ""}`);
        break;
      case Cmd.MusicOff:
        this.events.push({ kind: "music", tune: "off" });
        log?.push("mo");
        break;
      case Cmd.SoundToggle:
        // the flag itself flips in the driver (apply); the engine is told the
        // state the game is switching to
        this.events.push({ kind: "enable", what: "sound", on: !this.soundFlag });
        log?.push("ts");
        break;
      case Cmd.MusicToggle:
        this.events.push({ kind: "enable", what: "music", on: !this.musicFlag });
        log?.push("tm");
        break;
      case Cmd.PauseOn:
        ev("start", "pause");
        log?.push("p1");
        break;
      case Cmd.PauseOff:
        ev("stop", "pause");
        log?.push("p0");
        break;
    }
  }
}
