import type { CoreHighScoreEntry, CoreHighScoreStorage } from "../core";

/** Where the shared table lives when the game is served by our own site. */
const API = "/api/scores";
const KEY = "digger3d.highscores";
const TIMEOUT_MS = 2500;

export interface HighScores extends CoreHighScoreStorage {
  /** True when the table is the shared one on the server. */
  readonly shared: boolean;
  /** Re-reads a shared table; resolves true when it has changed. */
  refresh(): Promise<boolean>;
}

function sanitize(data: unknown): CoreHighScoreEntry[] | null {
  if (!Array.isArray(data)) return null;
  const out: CoreHighScoreEntry[] = [];
  for (const e of data as { initials?: unknown; score?: unknown }[]) {
    if (typeof e?.initials !== "string" || typeof e?.score !== "number") continue;
    out.push({ initials: e.initials.slice(0, 3).toUpperCase(), score: Math.max(0, Math.trunc(e.score)) });
    if (out.length === 10) break;
  }
  return out;
}

function readLocal(): CoreHighScoreEntry[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(table: readonly CoreHighScoreEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(table));
  } catch {
    // private mode / storage full: the table simply does not survive a reload
  }
}

async function call(method: "GET" | "POST", body?: unknown): Promise<CoreHighScoreEntry[] | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(API, {
      method,
      signal: stop.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) return null;
    const data: unknown = await r.json();
    return sanitize((data as { scores?: unknown })?.scores);
  } catch {
    return null; // no server (dev, an artifact, offline): the browser keeps the table
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The high-score table of the original.
 *
 * Where the game is served by our own site the table is shared by everyone who
 * plays: it is read from `/api/scores` at start-up and every new entry is sent
 * there. Anywhere else (the dev server, a published build without the API) it
 * lives in the browser, exactly as before. The core only ever sees the table,
 * never how it travels.
 */
export async function createHighScores(): Promise<HighScores> {
  const server = await call("GET");
  let table: CoreHighScoreEntry[] = server ?? readLocal() ?? [];
  if (server) writeLocal(server);

  return {
    shared: server !== null,

    load(): readonly CoreHighScoreEntry[] {
      return table;
    },

    save(next: readonly CoreHighScoreEntry[], added: CoreHighScoreEntry): void {
      table = [...next];
      writeLocal(table);
      if (server === null) return;
      // the server owns the shared table: send what was achieved and take its answer
      void call("POST", added).then((fresh) => {
        if (fresh) {
          table = fresh;
          writeLocal(fresh);
        }
      });
    },

    async refresh(): Promise<boolean> {
      if (server === null) return false;
      const fresh = await call("GET");
      if (!fresh || JSON.stringify(fresh) === JSON.stringify(table)) return false;
      table = fresh;
      writeLocal(fresh);
      return true;
    },
  };
}
