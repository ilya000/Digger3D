/**
 * Source of `dist/_worker.js` (Cloudflare Pages "advanced mode"), built by
 * `npm run build`. A direct upload through the dashboard has no way to compile
 * the `functions/` directory, so the same handlers are bundled into one module
 * that serves /api/scores and hands everything else to the static assets.
 */
import { onRequestGet as scoresGet, onRequestPost as scoresPost } from "./api/scores.js";
import { onRequestPost as playPost } from "./api/play.js";
import { onRequestGet as statsGet } from "./api/stats.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };
    const routes = {
      "/api/scores": { GET: scoresGet, POST: scoresPost },
      "/api/play": { POST: playPost },
      "/api/stats": { GET: statsGet },
    };
    const route = routes[url.pathname];
    if (route) {
      const handler = route[request.method];
      if (handler) return handler(context);
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
