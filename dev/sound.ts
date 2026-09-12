// Dev page: one button per effect and tune of the original Digger.
import type { SoundEvent } from "../src/contracts";
import { createSoundEngine, type OutputMode } from "../src/sound";

const engine = createSoundEngine();
const $ = (id: string) => document.getElementById(id)!;

function button(parent: string, label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = async () => {
    await engine.unlock();
    onClick(b);
  };
  $(parent).appendChild(b);
  return b;
}

const send = (ev: SoundEvent) => engine.handle(ev);

for (const tune of ["main", "bonus", "dirge", "off"] as const) {
  button("tunes", tune === "off" ? "music off" : tune, () => send({ kind: "music", tune }));
}

let streak = 0;
button("oneshots", "emerald (click + streak note)", (b) => {
  send({ kind: "start", sound: "emerald" });
  send({ kind: "start", sound: "emeraldStreak", arg: streak });
  b.textContent = `emerald (next note ${((streak + 1) % 8) + 1}/8)`;
  streak = (streak + 1) % 8;
});
button("oneshots", "emerald click only", () => send({ kind: "start", sound: "emerald" }));
for (const [label, sound, arg] of [
  ["eat monster", "eatMonster"],
  ["gold", "gold"],
  ["bag break", "bagBreak"],
  ["digger death", "diggerDeath"],
  ["1-up", "oneUp"],
  ["explode 0", "explode", 0],
  ["explode 1", "explode", 1],
] as const) {
  button("oneshots", label, () => send(arg === undefined ? { kind: "start", sound } : { kind: "start", sound, arg }));
}

for (const [label, sound, arg] of [
  ["fire 0", "fire", 0],
  ["fire 1", "fire", 1],
  ["bag wobble", "bagWobble"],
  ["bag fall", "bagFall"],
  ["bonus siren", "bonus"],
  ["pause", "pause"],
] as const) {
  let on = false;
  button("loops", label, (b) => {
    on = !on;
    b.classList.toggle("on", on);
    send({ kind: on ? "start" : "stop", sound, arg });
  });
}

button("control", "level done", () => send({ kind: "start", sound: "levelDone" }));
button("control", "death + dirge", () => {
  send({ kind: "start", sound: "diggerDeath" });
  setTimeout(() => send({ kind: "music", tune: "dirge" }), 800);
});
button("control", "stop all", () => {
  send({ kind: "stop", sound: "all" });
  document.querySelectorAll("#loops button.on").forEach((b) => b.classList.remove("on"));
});

$("sound").onchange = (e) => engine.setSoundEnabled((e.target as HTMLInputElement).checked);
$("music").onchange = (e) => engine.setMusicEnabled((e.target as HTMLInputElement).checked);
$("output").onchange = (e) => engine.setOutput((e.target as HTMLSelectElement).value as OutputMode);
$("volume").oninput = (e) => engine.setVolume(Number((e.target as HTMLInputElement).value));

let last = performance.now();
function frame(now: number) {
  engine.advance(Math.min((now - last) / 1000, 0.25));
  last = now;
  $("status").textContent =
    `audio: ${engine.audible ? "running" : "locked (click a button)"} | ` +
    `levelDone busy: ${engine.isBusy("levelDone")} | dirge busy: ${engine.isBusy("dirge")} | ` +
    `music ${engine.musicEnabled ? "on" : "off"}, sound ${engine.soundEnabled ? "on" : "off"}`;
  (($("music") as HTMLInputElement).checked = engine.musicEnabled);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
