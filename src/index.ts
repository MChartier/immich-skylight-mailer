import cron from "node-cron";
import pLimit from "p-limit";
import dayjs from "dayjs";
import { findAlbumIdByName, listAlbumAssets, downloadOriginal } from "./immich.js";
import { toFrameJpeg } from "./image.js";
import { loadState, saveState } from "./state.js";
import { packBatches, sendBatch } from "./mail.js";
import { safeBaseName } from "./util.js";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const CRON_EXPRESSION = process.env.CRON_EXPRESSION || ""; // if empty, run once and exit
const DRY_RUN = process.env.DRY_RUN === "1";

async function runOnce() {
  const started = Date.now();
  const state = loadState();

  const albumId = await findAlbumIdByName(process.env.IMMICH_ALBUM_NAME!);
  log("info", `Album resolved: ${albumId}`);

  const allAssets = await listAlbumAssets(albumId);

  // Filter to IMAGES only; you can later handle videos separately if desired
  const candidates = allAssets.filter(a => a.type === "IMAGE" && !state.sentAssetIds[a.id]);

  if (!candidates.length) {
    log("info", "No new photos to send. ✅");
    return;
  }
  log("info", `Found ${candidates.length} unsent images.`);

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
      return { asset: a, jpeg, filename };
    }))
  );

  // Batch by total bytes
  const attachments = processed.map(p => ({
    filename: p.filename.endsWith(".jpg") || p.filename.endsWith(".jpeg") ? p.filename : (p.filename + ".jpg"),
    content: p.jpeg,
    contentType: "image/jpeg"
  }));
  const batches = packBatches(attachments);
  log("info", `Prepared ${attachments.length} files into ${batches.length} email batch(es).`);

  // Send batches
  for (let i = 0; i < batches.length; i++) {
    await sendBatch(batches[i], i, batches.length);
  }

  // Mark sent
  const nowIso = new Date().toISOString();
  for (const p of processed) state.sentAssetIds[p.asset.id] = nowIso;
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
