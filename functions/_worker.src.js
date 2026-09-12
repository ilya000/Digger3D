/**
 * Source of `dist/_worker.js` (Cloudflare Pages "advanced mode"), built by
 * `npm run build`. A direct upload through the dashboard has no way to compile
 * the `functions/` directory, so the same handlers are bundled into one module
 * that serves /api/scores and hands everything else to the static assets.
 */
import { onRequestGet, onRequestPost } from "./api/scores.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scores") {
      const context = { request, env, ctx };
      if (request.method === "GET") return onRequestGet(context);
      if (request.method === "POST") return onRequestPost(context);
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
