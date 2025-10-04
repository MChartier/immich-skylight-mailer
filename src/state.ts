import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = process.env.STATE_DIR || "/app/state";
const STATE_FILE = join(STATE_DIR, "sent.json");

export type SentState = {
  assetRecipients: Record<string, Record<string, string>>; // assetId -> recipient email -> ISO date sent
};

/**
 * Ensures the state directory and file exist.
 */
function ensure() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) writeFileSync(STATE_FILE, JSON.stringify({ assetRecipients: {} }, null, 2));
}

/**
 * Loads the sent state from the state file.
 * @returns The loaded state from the state file.
 */
export function loadState(recipients: string[]): SentState {
  ensure();
  const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as unknown;
  const { state, mutated } = migrateState(raw, recipients);
  if (mutated) saveState(state);
  return state;
}

/**
 * Saves the sent state to the state file.
 * @param state The state to save to the state file.
 */
export function saveState(state: SentState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function hasAssetBeenSent(state: SentState, assetId: string, recipient: string): boolean {
  return Boolean(state.assetRecipients[assetId]?.[recipient]);
}

export function markAssetSent(state: SentState, assetId: string, recipient: string, timestamp: string) {
  if (!state.assetRecipients[assetId]) state.assetRecipients[assetId] = {};
  state.assetRecipients[assetId][recipient] = timestamp;
}

function migrateState(raw: unknown, recipients: string[]): { state: SentState; mutated: boolean } {
  const initial: SentState = { assetRecipients: {} };

  if (!raw || typeof raw !== "object") return { state: initial, mutated: false };

  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.assetRecipients === "object" && candidate.assetRecipients !== null) {
    const assetRecipients: SentState["assetRecipients"] = {};
    for (const [assetId, value] of Object.entries(candidate.assetRecipients as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const perRecipient: Record<string, string> = {};
      for (const [email, timestamp] of Object.entries(value as Record<string, unknown>)) {
        if (typeof timestamp === "string" && timestamp) {
          perRecipient[email] = timestamp;
        }
      }
      if (Object.keys(perRecipient).length > 0) {
        assetRecipients[assetId] = perRecipient;
      }
    }
    return { state: { assetRecipients }, mutated: false };
  }

  if (typeof candidate.sentAssetIds === "object" && candidate.sentAssetIds !== null) {
    const assetRecipients: SentState["assetRecipients"] = {};
    for (const [assetId, timestamp] of Object.entries(candidate.sentAssetIds as Record<string, unknown>)) {
      if (typeof timestamp !== "string" || !timestamp) continue;
      const perRecipient: Record<string, string> = {};
      for (const email of recipients) {
        perRecipient[email] = timestamp;
      }
      assetRecipients[assetId] = perRecipient;
    }
    return { state: { assetRecipients }, mutated: true };
  }

  return { state: initial, mutated: false };
}
