import type { BrowserKeyboard } from "./input";

/**
 * The on-screen buttons of a phone. Each one holds down the key the game
 * already reads (the cursor keys, F1 to fire, Space to pause), so the core sees
 * exactly what it sees from a keyboard - and the first press also starts the
 * game, as any key does.
 */
export function touchControls(keyboard: BrowserKeyboard, root: HTMLElement): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
    const code = button.dataset.key ?? "";
    const release = (): void => {
      if (!button.classList.contains("down")) return;
      button.classList.remove("down");
      keyboard.release(code);
    };
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        // captures are a convenience
      }
      button.classList.add("down");
      keyboard.press(code);
    });
    for (const end of ["pointerup", "pointercancel", "pointerleave"] as const)
      button.addEventListener(end, release);
    button.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  // a finger that leaves the screen entirely must not leave a key held
  addEventListener("blur", () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>("button.down")) button.classList.remove("down");
    keyboard.reset();
  });
}
