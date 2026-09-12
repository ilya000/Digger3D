/**
 * GET /api/stats?days=30
 *
 * What /api/play counted: per day, how many people opened the game, how many
 * of them started a game, and how many games were played. Plain numbers - no
 * addresses, no browsers, nothing about a single visitor.
 */

const MAX_DAYS = 180;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "max-age=60" },
  });

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ days: [] });
  const asked = Number(new URL(request.url).searchParams.get("days")) || 30;
  const days = Math.min(MAX_DAYS, Math.max(1, Math.trunc(asked)));
  try {
    const { results } = await env.DB.prepare(
      `SELECT day,
              COUNT(DISTINCT mark)                                      AS people,
              COUNT(DISTINCT CASE WHEN kind = 'game' THEN mark END)     AS players,
              SUM(CASE WHEN kind = 'game'  THEN 1 ELSE 0 END)           AS games,
              SUM(CASE WHEN kind = 'visit' THEN 1 ELSE 0 END)           AS visits
         FROM plays
        WHERE day > date('now', ?)
        GROUP BY day
        ORDER BY day DESC`,
    )
      .bind(`-${days} day`)
      .all();
    const rows = results ?? [];
    const total = rows.reduce((a, r) => a + (r.games ?? 0), 0);
    return json({ days: rows, totalGames: total });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

export async function onRequest() {
  return json({ error: "method not allowed" }, 405);
}
