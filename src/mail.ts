import nodemailer from "nodemailer";
import { fileExtension } from "./util.js";

const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER!;
const pass = process.env.SMTP_PASS!;
const fromEmail = process.env.FROM_EMAIL || user;
const toEmails = (process.env.TO_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
const maxBytes = Number(process.env.MAX_EMAIL_TOTAL_BYTES || 24_000_000);
const maxAttachmentsPerEmail = Number(process.env.MAX_ATTACHMENTS_PER_EMAIL || 20);
const DRY_RUN = process.env.DRY_RUN === "1";

// Validate config
if (!host || !user || !pass || toEmails.length === 0) {
  throw new Error("Missing SMTP_HOST/SMTP_USER/SMTP_PASS/TO_EMAILS");
}

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false,
  auth: { user, pass }
});

export type Attachment = { filename: string; content: Buffer; contentType?: string; };
export const recipientEmails = toEmails;

/**
 * Packs items into batches based on size and attachment limits.
 * @param items Items to pack into batches
 * @returns An array of batches, each containing a subset of the original items
 */
export function packBatches(items: Attachment[]): Attachment[][] {
  const batches: Attachment[][] = [];
  let current: Attachment[] = [];
  let total = 0;

  for (const it of items) {
    const size = it.content.byteLength;
    const wouldExceed = total + size > maxBytes || (current.length + 1) > maxAttachmentsPerEmail;

    if (wouldExceed && current.length > 0) {
      batches.push(current);
      current = [];
      total = 0;
    }
    if (size > maxBytes) {
      // Single huge item: still send alone
      batches.push([it]);
      continue;
    }
    current.push(it);
    total += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Sends a batch of email attachments.
 * @param attachments Attachments to send
 * @param batchIndex The index of the current batch
 * @param totalBatches The total number of batches
 * @returns A promise that resolves when the email is sent
 */
export async function sendBatch(recipient: string, attachments: Attachment[], batchIndex: number, totalBatches: number) {
  const subject = totalBatches > 1
    ? `New photos for your Skylight (Batch ${batchIndex + 1} of ${totalBatches})`
    : `New photos for your Skylight`;

  const sizeMB = (attachments.reduce((n, a) => n + a.content.byteLength, 0) / (1024 * 1024)).toFixed(1);

  if (DRY_RUN) {
    console.log(`[DRY_RUN] Would send: ${attachments.length} attachments, ~${sizeMB} MB, subject="${subject}" to=${recipient}`);
    return;
  }

  await transporter.sendMail({
    from: fromEmail,
    to: recipient,
    subject,
    text: `Enjoy the latest photos! This email contains ${attachments.length} images (~${sizeMB} MB).`,
    attachments: attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || `image/${fileExtension(a.filename).toLowerCase() === "png" ? "png" : "jpeg"}`
    }))
  });

  console.log(`Sent batch ${batchIndex + 1}/${totalBatches} to ${recipient}: ${attachments.length} files, ~${sizeMB} MB`);
}
