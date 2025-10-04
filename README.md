# Immich Skylight Mailer

Automates pulling new photos from an Immich album and emailing them to a Skylight frame (or any email destination). Assets are fetched with the official `@immich/sdk`, converted to JPEG, batched under size limits, and sent via SMTP. A lightweight state file keeps track of which Immich assets have already been delivered.

## Highlights
- Uses Immich's TypeScript SDK for album lookup and asset downloads
- Converts images with `sharp` to frame-friendly JPEGs
- Sends emails through `nodemailer`, batching attachments under configurable caps
- Persists per-recipient delivery state in `state/sent.json` so new frames can opt-in without resending to others
- Supports one-shot runs or scheduled execution via cron expressions

## Requirements
- Node.js 20+ (for local development) or Docker
- Access to an Immich instance and an API key with at least `album.read`, `albumAsset.read`, `asset.read`, and `asset.download` permissions
- SMTP credentials (Skylight frames accept email attachments)

## Configuration
Supply the following environment variables (via `.env`, Docker secrets, or your process manager):

- `IMMICH_BASE_URL`: Immich base URL (with or without trailing `/api`)
- `IMMICH_API_KEY`: Immich API key
- `IMMICH_ALBUM_NAME`: Album display name to monitor
- `SMTP_HOST`, `SMTP_PORT`: SMTP server host/port
- `SMTP_USER`, `SMTP_PASS`: SMTP credentials (Skylight requires an app password when using Gmail)
- `FROM_EMAIL`: Message sender
- `TO_EMAILS`: Comma-delimited list of recipients (Skylight addresses)
- `TARGET_WIDTH`, `TARGET_HEIGHT`, `JPEG_QUALITY`, `STRIP_METADATA`: Image conversion options consumed by `src/image.ts`
- `MAX_EMAIL_TOTAL_BYTES`, `MAX_ATTACHMENTS_PER_EMAIL`: Batching thresholds
- `CRON_EXPRESSION`: Optional cron schedule (`node-cron` syntax); leave unset for a single run on start
- `TZ`: Timezone for cron-based runs (defaults to container/system timezone)
- `DRY_RUN`: Set to `1` to skip email delivery while testing
- `LOG_LEVEL`: `error`, `info`, or `debug`

State is stored under `state/sent.json`. Mount or back up this directory if you want continuity between runs.

## Local Development
```bash
npm install
npm run build
IMMICH_BASE_URL=https://immich.example.com \
IMMICH_API_KEY=your-key \
IMMICH_ALBUM_NAME="Skylight Outbox" \
SMTP_HOST=smtp.example.com \
SMTP_PORT=587 \
SMTP_USER=user@example.com \
SMTP_PASS=app-password \
FROM_EMAIL=user@example.com \
TO_EMAILS=frame@example.com \
node dist/index.js
```

For iterative work, run `npm run dev` (uses `ts-node` with `--watch`).

## Docker Compose Example
Place secrets in a `.env` file alongside the compose file:

```env
IMMICH_BASE_URL=https://immich.example.com
IMMICH_API_KEY=replace-me
IMMICH_ALBUM_NAME=Skylight Outbox
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
FROM_EMAIL=you@gmail.com
TO_EMAILS=frame1@ourskylight.com,frame2@ourskylight.com
DRY_RUN=0
LOG_LEVEL=info
CRON_EXPRESSION=0 20 * * * # 8pm every day
TZ=America/Los_Angeles
TARGET_WIDTH=1280
TARGET_HEIGHT=800
JPEG_QUALITY=85
STRIP_METADATA=1
MAX_EMAIL_TOTAL_BYTES=24000000
MAX_ATTACHMENTS_PER_EMAIL=20
```

Then use the compose definition below (adjust volumes and restart policy as needed):

```yaml
services:
  skylight-mailer:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      # Override or add inline values here if needed
      DRY_RUN: ${DRY_RUN:-0}
    volumes:
      - ./state:/app/state
      - /etc/localtime:/etc/localtime:ro
      - /etc/timezone:/etc/timezone:ro
```

Start the service with `docker compose up --build`. The first run executes immediately; subsequent runs follow the cron schedule. Logs include asset counts, batching summaries, and failures.

## Operational Notes
- If you rotate SMTP or Immich credentials, restart the service so it picks up the new environment values.
- A `DRY_RUN=1` launch will download and process assets without sending email—useful for validating your Immich API permissions.
- To resend a photo for a specific frame, remove that frame's email entry under the corresponding asset ID in `state/sent.json`.
