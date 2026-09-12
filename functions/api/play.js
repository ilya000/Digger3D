/**
 * POST /api/play  { kind: "visit" | "game" }
 *
 * Counts how much the game is played: one "visit" per page load and one "game"
 * per game started. Nothing about the player is stored - only a mark that is
 * the day, the address and the browser hashed together, so the same person
 * counts once a day and no day can be linked to another.
 *
 * GET /api/stats returns what was counted.
 */

/** Rows one mark may add in a day; beyond that the counting simply stops. */
const PER_DAY = 500;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function markOf(request, day) {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const agent = request.headers.get("user-agent") ?? "";
  const data = new TextEncoder().encode(`digger:${day}:${ip}:${agent}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false }, 503);
  let kind = "visit";
  try {
    const body = await request.json();
    if (body?.kind === "game") kind = "game";
  } catch {
    // an empty body counts as a visit
  }
  const day = today();
  const mark = await markOf(request, day);
  try {
    const seen = await env.DB.prepare(`SELECT COUNT(*) AS n FROM plays WHERE day = ? AND mark = ?`)
      .bind(day, mark)
      .first();
    if ((seen?.n ?? 0) >= PER_DAY) return json({ ok: true, counted: false });
    await env.DB.prepare(`INSERT INTO plays (day, mark, kind) VALUES (?, ?, ?)`).bind(day, mark, kind).run();
    return json({ ok: true, counted: true });
  } catch {
    return json({ ok: false }, 503);
  }
}

export async function onRequest() {
  return json({ error: "method not allowed" }, 405);
}
