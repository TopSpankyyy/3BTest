import { rename } from "node:fs/promises";
import type { DemoState } from "./types";
import { buildSeed } from "./seed";

const DIR = "/storage/onboarding";
const STATE = `${DIR}/state.json`;

// Atomic load. Bootstraps the deterministic seed on first run.
export async function loadState(): Promise<DemoState> {
  const f = Bun.file(STATE);
  if (await f.exists()) {
    try {
      return JSON.parse(await f.text()) as DemoState;
    } catch {
      // Corrupt file — rebuild from seed rather than serve garbage.
    }
  }
  const seed = buildSeed();
  await saveState(seed);
  return seed;
}

// Atomic save: write to a temp file, then rename over the live file so readers
// never observe a half-written state.
export async function saveState(state: DemoState): Promise<void> {
  await Bun.write(`${DIR}/.keep`, "");
  const tmp = `${STATE}.tmp-${crypto.randomUUID()}`;
  await Bun.write(tmp, JSON.stringify(state));
  // rename is atomic on the same filesystem.
  await rename(tmp, STATE);
}

// Reset: build a fresh deterministic seed and atomically replace the live state.
// If anything throws before the rename, the previous state remains intact.
export async function resetState(): Promise<DemoState> {
  const seed = buildSeed();
  await saveState(seed);
  return seed;
}
