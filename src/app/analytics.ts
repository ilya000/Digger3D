/**
 * How much the game is played, counted on our own site: one "visit" when the
 * page is opened and one "game" when a game begins. The server (see
 * functions/api/play.js) keeps nothing but a day and a mark that cannot be
 * followed from one day to the next; where there is no server (the dev page, a
 * published build without the API) nothing is sent at all.
 */
const API = "/api/play";

export interface Plays {
  gameStarted(): void;
}

export function countPlays(): Plays {
  let alive = true;
  const send = (kind: "visit" | "game"): void => {
    if (!alive) return;
    void fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
      keepalive: true,
    })
      .then((r) => {
        if (!r.ok) alive = false; // no counting here: stop trying
      })
      .catch(() => {
        alive = false;
      });
  };
  send("visit");
  return { gameStarted: () => send("game") };
}
