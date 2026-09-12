// Converts the reference harness output (build/out) into compact vitest
// fixtures (tests/sound/fixtures/<scenario>.json):
//   raw  - the unfiltered reference PCM, losslessly run-length encoded
//          (Int32 pairs value,length), gzipped, base64
//   flt  - one second of the SDL-filtered reference PCM (Int16), gzipped,
//          base64, starting shortly before the first sound
//   acks - ticks at which the reference reported levelDone / dirge complete
//
//   node make-fixtures.mjs <scenarios dir> <harness out dir> <fixtures dir>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [scenDir, outDir, fixDir] = process.argv.slice(2);
if (!fixDir) {
  console.error("usage: node make-fixtures.mjs <scenarios> <out> <fixtures>");
  process.exit(2);
}
fs.mkdirSync(fixDir, { recursive: true });

const readS16 = (f) => {
  const b = fs.readFileSync(f);
  return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const pack = (typed) =>
  zlib.gzipSync(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), { level: 9 }).toString("base64");

let total = 0;
for (const file of fs.readdirSync(scenDir).filter((f) => f.endsWith(".txt")).sort()) {
  const name = path.basename(file, ".txt");
  const script = fs.readFileSync(path.join(scenDir, file), "utf8");
  const raw = readS16(path.join(outDir, `${name}.raw.s16`));
  const flt = readS16(path.join(outDir, `${name}.flt.s16`));
  const acks = fs
    .readFileSync(path.join(outDir, `${name}.acks.txt`), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [what, tick] = l.split(" ");
      return { what, tick: Number(tick) };
    });

  const runs = [];
  let start = 0;
  for (let i = 1; i <= raw.length; i++) {
    if (i === raw.length || raw[i] !== raw[start]) {
      runs.push(raw[start], i - start);
      start = i;
    }
  }
  const rate = Number(/^\s*rate\s+(\d+)/m.exec(script)?.[1] ?? 44100);
  let first = raw.findIndex((v) => v !== 0);
  if (first < 0) first = 0;
  const fltStart = Math.max(0, first - 100);
  const fltPart = flt.slice(fltStart, fltStart + rate);

  const fixture = {
    name,
    script,
    rate,
    samples: raw.length,
    acks,
    raw: pack(Int32Array.from(runs)),
    fltStart,
    flt: pack(fltPart),
  };
  const json = JSON.stringify(fixture);
  fs.writeFileSync(path.join(fixDir, `${name}.json`), json);
  total += json.length;
  console.log(`${name}: ${runs.length / 2} runs, ${(json.length / 1024).toFixed(1)} KiB`);
}
console.log(`total ${(total / 1024).toFixed(1)} KiB`);
