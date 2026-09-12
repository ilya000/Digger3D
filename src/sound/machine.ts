// The sound "interrupt" of the original Digger: once per tick (72.8 Hz) it
// applies the commands the game posted since the previous tick, advances the
// music and every effect, decides who gets the speaker and programs the PIT.
//
// The machine is deterministic and knows nothing about samples: it drives a
// `SpeakerPort`. The same class runs inside the AudioWorklet (driving the
// speaker model) and on the main thread as a silent mirror that tells the
// game when a jingle is over.

import type { SoundEvent } from "../contracts";
import {
  LEVEL_DONE_DETUNE,
  LEVEL_DONE_NOTES,
  LEVEL_DONE_NOTE_TICKS,
  MUSIC_MIN_DIVISOR,
  PIT_MAX_DIVISOR,
  PULSE_MAX,
  REST,
  T2_IDLE,
  type TuneName,
} from "./data";
import {
  BagBreak,
  BagFall,
  BagWobble,
  BonusSiren,
  DiggerDeath,
  EatMonster,
  EmeraldClick,
  EmeraldStreak,
  Explosions,
  Fireballs,
  Gold,
  OneUp,
  SoundRandom,
  type Effect,
  type EffectContext,
} from "./effects";
import { TunePlayer, type Pulse } from "./music";
import type { SoundName } from "./names";
import type { SpeakerSource } from "./speaker";

/** What the machine programs. `PcSpeaker` implements it; the mirror uses a no-op. */
export interface SpeakerPort {
  setTimer0(divisor: number, pulse: number): void;
  setTimer2(divisor: number): void;
  setTimer2Beat(divisor: number): void;
  connect(source: SpeakerSource): void;
  disconnect(): void;
}

export const NULL_SPEAKER: SpeakerPort = {
  setTimer0() {},
  setTimer2() {},
  setTimer2Beat() {},
  connect() {},
  disconnect() {},
};

/** Enabling/disabling sound or music (the original's F-key toggles). */
export interface EnableCommand {
  kind: "enable";
  what: "sound" | "music";
  on: boolean;
}

export type SoundCommand = SoundEvent | EnableCommand;

/** Things the game may wait for. */
export type Waitable = "levelDone" | "dirge";

interface Queued {
  cmd: SoundCommand;
  /** The game will wait for this command's completion. */
  waits: boolean;
}

export class SoundMachine {
  /** Ticks run so far; the tick being run has index `ticks` during `tick()`. */
  ticks = 0;
  /** Called when a waitable completes (tick = index of the tick). */
  onFinished: ((what: Waitable, tick: number) => void) | null = null;

  private readonly queue: Queued[] = [];
  private soundOn = true; // user setting
  private musicOn = true; // user setting (the dirge may force it on)
  private active = true; // sound actually running
  private held = false; // paused (also held during the level-done jingle)
  private toMusic = false; // speaker currently connected to the music pulses
  private musicEverPlayed = false;
  private readonly pulse: Pulse = { width: 8 };
  private readonly player = new TunePlayer();
  private dirgeWait = false;
  private restoreMusicOff = false;
  private jingle: { note: number; left: number } | null = null;

  private readonly click = new EmeraldClick();
  private readonly streak = new EmeraldStreak();
  private readonly wobble = new BagWobble();
  private readonly death = new DiggerDeath();
  private readonly bagBreak = new BagBreak();
  private readonly gold = new Gold();
  private readonly explosions = new Explosions();
  private readonly fireballs = new Fireballs();
  private readonly eat = new EatMonster();
  private readonly fall = new BagFall();
  private readonly oneUp = new OneUp();
  private readonly siren = new BonusSiren();
  /** Lowest priority first: a later effect overrides an earlier one. */
  private readonly byPriority: readonly Effect[] = [
    this.streak,
    this.wobble,
    this.death,
    this.bagBreak,
    this.gold,
    this.click,
    this.explosions,
    this.fireballs,
    this.eat,
    this.fall,
    this.oneUp,
    this.siren,
  ];
  private readonly byName: Readonly<Partial<Record<SoundName, Effect & { start(arg?: number): void }>>> = {
    emerald: this.click,
    emeraldStreak: this.streak,
    eatMonster: this.eat,
    fire: this.fireballs,
    explode: this.explosions,
    gold: this.gold,
    bagWobble: this.wobble,
    bagFall: this.fall,
    bagBreak: this.bagBreak,
    diggerDeath: this.death,
    oneUp: this.oneUp,
    bonus: this.siren,
  };
  private readonly random = new SoundRandom();
  private readonly ctx: EffectContext = {
    rand: (n) => this.random.next(n),
    musicOff: () => this.musicOff(),
  };

  constructor(private readonly speaker: SpeakerPort = NULL_SPEAKER) {
    speaker.setTimer2(T2_IDLE);
    speaker.connect("effects");
    speaker.setTimer0(PIT_MAX_DIVISOR, 1); // timer 0 back at the interrupt rate
  }

  /** Queues a command; it takes effect at the next tick. */
  post(cmd: SoundCommand): void {
    if (cmd.kind === "start" && cmd.sound === "levelDone") {
      // the original stops everything, then plays the jingle only if sound
      // is running (otherwise the game does not wait at all)
      this.queue.push({ cmd: { kind: "stop", sound: "all" }, waits: false });
      if (this.active) this.queue.push({ cmd, waits: true });
      return;
    }
    const waits = cmd.kind === "music" && cmd.tune === "dirge" && this.active;
    this.queue.push({ cmd, waits });
  }

  /** True while the game should keep waiting for `what`. */
  isBusy(what: Waitable): boolean {
    if (what === "levelDone" && this.jingle) return true;
    if (what === "dirge" && this.dirgeWait) return true;
    return this.queue.some(
      (q) =>
        q.waits &&
        (what === "levelDone" ? q.cmd.kind === "start" : q.cmd.kind === "music"),
    );
  }

  get soundEnabled(): boolean {
    return this.soundOn;
  }
  get musicEnabled(): boolean {
    return this.musicOn;
  }
  /** Currently playing tune, if any. */
  get tune(): TuneName | null {
    return this.player.playing ? this.player.tune : null;
  }

  /** One sound interrupt. */
  tick(): void {
    for (const q of this.queue.splice(0)) this.apply(q);

    if (this.soundOn && !this.active) {
      this.active = true;
      this.musicOn = true;
    }
    if (!this.soundOn && this.active) {
      this.active = false;
      this.speaker.setTimer2(T2_IDLE);
      this.routeEffects();
      this.speaker.disconnect();
    }

    if (this.active && !this.held) {
      let t0 = REST;
      if (this.musicOn && this.player.playing) {
        const r = this.player.tick(this.pulse);
        this.musicEverPlayed = true;
        t0 = r.divisor;
        if (r.ended) this.dirgeMelodyOver();
      }
      let t2 = T2_IDLE;
      for (const e of this.byPriority) {
        const d = e.tick(this.ctx);
        if (d !== undefined) t2 = d;
      }
      if (t0 === REST || t2 !== T2_IDLE) {
        this.routeEffects();
      } else {
        this.routeMusic();
        this.speaker.setTimer2(T2_IDLE);
        this.speaker.setTimer0(Math.max(t0, MUSIC_MIN_DIVISOR), this.pulseWidth());
      }
      this.speaker.setTimer2(t2);
    }

    if (this.jingle) this.jingleTick();
    this.ticks++;
  }

  private apply({ cmd, waits }: Queued): void {
    switch (cmd.kind) {
      case "enable":
        if (cmd.what === "sound") this.soundOn = cmd.on;
        else this.musicOn = cmd.on;
        return;
      case "music":
        if (cmd.tune === "off") this.musicOff();
        else this.startTune(cmd.tune, waits);
        return;
      case "start":
        return this.start(cmd.sound as SoundName, cmd.arg);
      case "stop":
        return this.stop(cmd.sound as SoundName, cmd.arg);
    }
  }

  private start(name: SoundName, arg?: number): void {
    switch (name) {
      case "levelDone":
        if (this.active) {
          this.jingle = { note: 0, left: LEVEL_DONE_NOTE_TICKS - 1 };
          this.held = true;
        } else {
          this.finish("levelDone");
        }
        return;
      case "pause":
        if (this.held) return;
        this.held = true;
        if (this.active) {
          this.speaker.setTimer2(T2_IDLE);
          this.routeEffects();
          this.speaker.disconnect();
        }
        return;
      case "explode":
        this.explosions.start(arg);
        this.fireballs.stop(arg ?? 0);
        return;
      case "all":
        return;
      default:
        this.byName[name]?.start(arg);
    }
  }

  private stop(name: SoundName, arg?: number): void {
    switch (name) {
      case "all":
        return this.stopAll();
      case "levelDone":
        return this.endJingle();
      case "pause":
        this.held = false;
        return;
      case "fire":
      case "explode":
        this.byName[name]!.stop(arg ?? 0);
        return;
      default:
        this.byName[name]?.stop(arg);
    }
  }

  private stopAll(): void {
    this.endJingle();
    this.releaseDirge();
    for (const e of this.byPriority) e.stop();
    this.musicOff();
  }

  private startTune(tune: TuneName, waits: boolean): void {
    this.releaseDirge();
    if (!this.active) return;
    this.player.start(tune);
    if (tune === "dirge") {
      if (!this.musicOn) {
        this.musicOn = true;
        this.restoreMusicOff = true;
      }
      this.death.stop();
      if (waits) this.dirgeWait = true;
    }
  }

  private musicOff(): void {
    this.player.stop();
    this.releaseDirge();
    this.restoreMusic();
  }

  private dirgeMelodyOver(): void {
    this.releaseDirge();
    this.restoreMusic();
  }

  private restoreMusic(): void {
    if (this.restoreMusicOff) {
      this.musicOn = false;
      this.restoreMusicOff = false;
    }
  }

  private releaseDirge(): void {
    if (this.dirgeWait) {
      this.dirgeWait = false;
      this.finish("dirge");
    }
  }

  private jingleTick(): void {
    const j = this.jingle!;
    if (!this.active) return this.endJingle();
    const note = LEVEL_DONE_NOTES[Math.min(j.note, LEVEL_DONE_NOTES.length - 1)]!;
    this.pulse.width = PULSE_MAX;
    this.routeMusic();
    this.speaker.setTimer0(Math.max(note + LEVEL_DONE_DETUNE, MUSIC_MIN_DIVISOR), PULSE_MAX);
    this.speaker.setTimer2Beat(note);
    if (j.left > 0) {
      j.left--;
    } else {
      j.left = LEVEL_DONE_NOTE_TICKS - 1;
      if (++j.note >= LEVEL_DONE_NOTES.length) this.endJingle();
    }
  }

  private endJingle(): void {
    this.held = false;
    if (this.jingle) {
      this.jingle = null;
      this.finish("levelDone");
    }
  }

  private finish(what: Waitable): void {
    this.onFinished?.(what, this.ticks);
  }

  private pulseWidth(): number {
    return Math.min(Math.max(this.pulse.width, 1), PULSE_MAX);
  }

  /** Speaker to channel 2 (effects). */
  private routeEffects(): void {
    if (this.toMusic) {
      this.toMusic = false;
      this.speaker.connect("effects");
    }
  }

  /** Speaker to the channel-0 music pulses. Before any tune has ever played
   *  the original's speaker mode is "none" (reference quirk, kept). */
  private routeMusic(): void {
    if (!this.toMusic && this.active) {
      this.toMusic = true;
      this.speaker.connect(this.musicEverPlayed ? "music" : "none");
    }
  }
}
