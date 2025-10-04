import cron from "node-cron";
import pLimit from "p-limit";
import dayjs from "dayjs";
import { findAlbumIdByName, listAlbumAssets, downloadOriginal } from "./immich.js";
import { toFrameJpeg } from "./image.js";
import { hasAssetBeenSent, loadState, markAssetSent, saveState } from "./state.js";
import { packBatches, recipientEmails, sendBatch } from "./mail.js";
import { safeBaseName } from "./util.js";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const CRON_EXPRESSION = process.env.CRON_EXPRESSION || ""; // if empty, run once and exit
const DRY_RUN = process.env.DRY_RUN === "1";

async function runOnce() {
  const started = Date.now();
  const recipients = recipientEmails;
  const state = loadState(recipients);

  const albumId = await findAlbumIdByName(process.env.IMMICH_ALBUM_NAME!);
  log("info", `Album resolved: ${albumId}`);

  const allAssets = await listAlbumAssets(albumId);

  // Filter to IMAGES only; you can later handle videos separately if desired
  const imageAssets = allAssets.filter(a => a.type === "IMAGE");
  const candidates = imageAssets.filter(a => recipients.some(recipient => !hasAssetBeenSent(state, a.id, recipient)));

  if (!candidates.length) {
    log("info", "No new photos to send for any recipient. ✅");
    return;
  }
  log("info", `Found ${candidates.length} assets needing delivery for at least one recipient.`);

  // Download + convert in parallel with a cap (sharp benefits from some concurrency, but not too much)
  const limit = pLimit(4);
  const processed = await Promise.all(
    candidates.map(a => limit(async () => {
      const original = await downloadOriginal(a.id);
      const jpeg = await toFrameJpeg(original);
      const date = a.exifInfo?.dateTimeOriginal || undefined;
      const datePrefix = date ? dayjs(date).format("YYYYMMDD_HHmmss") : undefined;
      const base = safeBaseName(a.originalFileName || `${a.id}.jpg`);
      const filename = datePrefix ? `${datePrefix}_${base}` : base;
      return {
        asset: a,
        attachment: {
          filename: filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? filename : `${filename}.jpg`,
          content: jpeg,
          contentType: "image/jpeg"
        }
      };
    }))
  );
  for (const recipient of recipients) {
    const unsentForRecipient = processed.filter(p => !hasAssetBeenSent(state, p.asset.id, recipient));
    if (!unsentForRecipient.length) {
      log("debug", `No new photos for ${recipient}.`);
      continue;
    }

    const attachments = unsentForRecipient.map(p => p.attachment);
    const batches = packBatches(attachments);
    log("info", `Prepared ${attachments.length} files into ${batches.length} email batch(es) for ${recipient}.`);

    for (let i = 0; i < batches.length; i++) {
      await sendBatch(recipient, batches[i], i, batches.length);
    }

    if (!DRY_RUN) {
      const sentAt = new Date().toISOString();
      for (const p of unsentForRecipient) {
        markAssetSent(state, p.asset.id, recipient, sentAt);
      }
    }
  }

  if (!DRY_RUN) saveState(state);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  log("info", `Done in ${secs}s.`);
}

function log(level: "info" | "debug" | "error", message: string) {
  const levels = { error: 0, info: 1, debug: 2 };
  if (levels[level] <= levels[LOG_LEVEL as keyof typeof levels]) {
    console.log(`[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`);
  }
}

// Entrypoint
(async () => {
  if (CRON_EXPRESSION) {
    log("info", `Starting scheduler with CRON "${CRON_EXPRESSION}" (TZ=${process.env.TZ || "system"})`);
    await runOnce(); // run immediately on boot
    cron.schedule(CRON_EXPRESSION, async () => {
      try {
        await runOnce();
      } catch (e: any) {
        log("error", `Run failed: ${e?.message || e}`);
      }
    });
    // Keep process alive
  } else {
    // One-shot mode
    try {
      await runOnce();
    } catch (e: any) {
      log("error", `Run failed: ${e?.message || e}`);
      process.exitCode = 1;
    }
  }
})();
