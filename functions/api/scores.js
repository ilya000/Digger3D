/**
 * The shared high-score table of Digger 3D (Cloudflare Pages Function + D1).
 *
 *   GET  /api/scores  -> { scores: [ { initials, score }, ... ] }   the top 10
 *   POST /api/scores  { initials, score }  -> the same list, with the entry in it
 *
 * The table is the original's: ten places, best first, and an equal score goes
 * below the one that was there first (ORDER BY score DESC, id ASC).
 */

const TOP = 10;
/** A recorded game of the original reaches ~3.3M points; well above that is a lie. */
const MAX_SCORE = 10_000_000;
/** Entries one address may add per hour. */
const PER_HOUR = 30;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** The original writes "." for a letter that was not typed. */
function initialsOf(value) {
  if (typeof value !== "string") return null;
  const s = value.toUpperCase().slice(0, 3).padEnd(3, ".");
  return /^[A-Z0-9.]{3}$/.test(s) ? s : null;
}

function scoreOf(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 && n <= MAX_SCORE ? n : null;
}

/** A short, non-reversible mark of the address, only to count recent entries. */
async function addressMark(request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const data = new TextEncoder().encode(`digger:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function top(db) {
  const { results } = await db
    .prepare(`SELECT initials, score FROM scores ORDER BY score DESC, id ASC LIMIT ?`)
    .bind(TOP)
    .all();
  return results ?? [];
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ scores: [] });
  try {
    return json({ scores: await top(env.DB) });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "no database" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const initials = initialsOf(body?.initials);
  const score = scoreOf(body?.score);
  if (initials === null || score === null) return json({ error: "bad entry" }, 400);

  const mark = await addressMark(request);
  try {
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM scores WHERE mark = ? AND created_at > datetime('now', '-1 hour')`,
    )
      .bind(mark)
      .first();
    if ((recent?.n ?? 0) >= PER_HOUR) return json({ error: "too many" }, 429);

    await env.DB.prepare(`INSERT INTO scores (initials, score, mark) VALUES (?, ?, ?)`)
      .bind(initials, score, mark)
      .run();
    return json({ scores: await top(env.DB) });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

/** Any other method: GET and POST are taken by the handlers above. */
export async function onRequest() {
  return json({ error: "method not allowed" }, 405);
}
