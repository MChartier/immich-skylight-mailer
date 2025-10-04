import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = process.env.STATE_DIR || "/app/state";
const STATE_FILE = join(STATE_DIR, "sent.json");

type SentState = {
  sentAssetIds: Record<string, string>; // assetId -> ISO date sent
};

/**
 * Ensures the state directory and file exist.
 */
function ensure() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) writeFileSync(STATE_FILE, JSON.stringify({ sentAssetIds: {} }, null, 2));
}

/**
 * Loads the sent state from the state file.
 * @returns The loaded state from the state file.
 */
export function loadState(): SentState {
  ensure();
  return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as SentState;
}

/**
 * Saves the sent state to the state file.
 * @param state The state to save to the state file.
 */
export function saveState(state: SentState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
