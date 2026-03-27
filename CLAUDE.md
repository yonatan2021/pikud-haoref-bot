# CLAUDE.md

## Repository

Public repo: `https://github.com/yonatan2021/pikud-haoref-bot` (fork of `eladnava/pikud-haoref-api`, Apache 2.0).
Default branch: `main`. License files: `LICENSE` (Apache 2.0) + `NOTICE` (attribution for pikud-haoref-api).

## Commands

```bash
npm test           # Run all unit tests
npm start          # Run the bot (tsx src/index.ts)
npm run dev        # Run with file-watching (auto-restart on change)
npm run build      # Compile TypeScript to dist/
npx tsx test-alert.ts   # Send one test alert per topic category (5 total) to Telegram for manual testing
npx tsx --test src/__tests__/topicRouter.test.ts         # Topic routing tests
npx tsx --test src/__tests__/telegramBot.test.ts         # Message formatter tests (escapeHtml, buildCityList)
npx tsx --test src/__tests__/dmDispatcher.test.ts        # DM dispatcher tests
npx tsx --test src/__tests__/subscriptionService.test.ts # Subscription service tests
npx tsx --test src/__tests__/zoneConfig.test.ts          # Zone config tests
npx tsx --test src/__tests__/alertWindowTracker.test.ts  # Alert window tracker tests
```

## Environment Setup

Copy `env.example` to `.env` and fill in:
- `TELEGRAM_BOT_TOKEN` — from BotFather
- `TELEGRAM_CHAT_ID` — negative number for channels, positive for DMs
- `MAPBOX_ACCESS_TOKEN` — for map image generation
- `PROXY_URL` _(optional)_ — required when running outside Israel, as the Pikud HaOref API is geo-restricted
- `TELEGRAM_TOPIC_ID_SECURITY` _(optional)_ — thread ID for 🔴 ביטחוני topic (missiles, aircraft, infiltration)
- `TELEGRAM_TOPIC_ID_NATURE` _(optional)_ — thread ID for 🌍 אסונות טבע topic (earthquake, tsunami)
- `TELEGRAM_TOPIC_ID_ENVIRONMENTAL` _(optional)_ — thread ID for ☢️ סביבתי topic (hazmat, radiological)
- `TELEGRAM_TOPIC_ID_DRILLS` _(optional)_ — thread ID for 🔵 תרגילים topic (all drill types)
- `TELEGRAM_TOPIC_ID_GENERAL` _(optional)_ — thread ID for 📢 הודעות כלליות topic (newsFlash, general, unknown)
- `TELEGRAM_INVITE_LINK` _(optional)_ — invite link shown in DM menu "הצטרף לערוץ" button
- `MAPBOX_MONTHLY_LIMIT` _(optional)_ — monthly Mapbox request cap (recommended: 40000); alerts fall back to text-only when reached
- `MAPBOX_IMAGE_CACHE_SIZE` _(optional)_ — in-memory map image cache size per fingerprint (default: 20)
- `MAPBOX_SKIP_DRILLS` _(optional)_ — set `true` to send drill alerts as text-only (no map)
- `ALERT_UPDATE_WINDOW_SECONDS` _(optional)_ — seconds a sent message stays editable; new alerts of the same type within this window edit the existing message instead of sending a new one (default: 120)

If none are set, all alerts go to the main chat.

## Docker

```bash
# Build image locally
docker build -t pikud-haoref-bot:local .

# Run (mount data/ for SQLite persistence)
docker run --env-file .env -v $(pwd)/data:/app/data pikud-haoref-bot:local
```

## CI/CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`) — runs on every push/PR: type-check + tests + docker build validation (two parallel jobs)
- **Release** (`.github/workflows/release.yml`) — runs on push to `main`: builds and pushes image to `ghcr.io/yonatan2021/pikud-haoref-bot` and Docker Hub
- Requires two GitHub Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

## Directory Structure

```
src/
├── index.ts              # Entry point — async IIFE, starts bot.start() + alertPoller
├── alertPoller.ts        # Polls pikud-haoref-api (library) + direct fetch fallback in parallel, emits "newAlert"; `pollCitylessNewsFlash()` catches cityless newsFlash the library drops
├── alertWindowTracker.ts # Per-type active message tracker with TTL — used by index.ts to decide edit-vs-send
├── telegramBot.ts        # Channel broadcast: formatAlertMessage, sendAlert, editAlert, getBot
├── mapService.ts         # Mapbox static map generation, in-memory FIFO image cache, monthly quota enforcement
├── cityLookup.ts         # City/polygon data + search/zone helpers
├── topicRouter.ts        # Alert type → Telegram topic ID
├── types.ts              # Shared TypeScript interfaces
├── db/                   # SQLite layer (better-sqlite3, synchronous)
│   ├── schema.ts                  # initDb(), getDb() singleton
│   ├── userRepository.ts
│   ├── subscriptionRepository.ts
│   └── mapboxUsageRepository.ts   # monthly Mapbox request counter (SQLite)
├── bot/                  # grammy DM interaction handlers
│   ├── botSetup.ts       # Registers all handlers + setMyCommands
│   ├── menuHandler.ts    # /start, main menu
│   ├── zoneHandler.ts    # Zone/city browsing with pagination
│   ├── searchHandler.ts  # Free-text city search
│   └── settingsHandler.ts # Format settings, /mycities
├── services/
│   ├── dmDispatcher.ts   # Notifies subscribers on alert (text-only)
│   └── subscriptionService.ts
└── config/
    └── zones.ts          # 6 super-regions → 28 zones manual mapping
```

## Architecture

The bot polls the IDF Home Front Command (Pikud HaOref) API every 2 seconds and sends real-time alerts to a Telegram channel with a map image.

### Data Flow

```
AlertPoller (polls every 2s — library + direct fetch in parallel)
    → emits "newAlert" event
        → shouldSkipMap(): skips generateMapImage() for newsFlash always; for drills when MAPBOX_SKIP_DRILLS=true
        → topicRouter.getTopicId()        # resolves Telegram thread ID from alert type
        → alertWindowTracker.getActiveMessage() # check for editable message within window
        → if active: merge cities, mapService.generateMapImage(), telegramBot.editAlert()
          else:       mapService.generateMapImage(), telegramBot.sendAlert()
        → alertWindowTracker.trackMessage()     # record sent/edited message reference
        → dmDispatcher.notifySubscribers() # sends text-only DM to subscribed users
```

### Key Design Decisions

**Deduplication via fingerprints** (`alertPoller.ts`): Each alert is hashed as `type:city1|city2|...` (sorted). Fingerprints for alerts no longer in the API response are removed individually each poll — so if alert A disappears while B is active, A's fingerprint expires and it re-fires if it returns. Cityless newsFlash fingerprints are tracked separately in `citylessFingerprints` and managed exclusively by `pollCitylessNewsFlash` — the library's expiry loop skips them, preventing re-emission every 2s when other alerts (e.g. missiles) are concurrently active. `clearCitylessFingerprints()` is called when newsFlash ends (`cat≠10`) or cities appear in the response.

**Alert grouping** (`alertPoller.ts`): All `Alert` objects with the same `type` in one poll are merged (union of cities) before fingerprinting, preventing multiple Telegram messages for the same event.

**Map URL fallback** (`mapService.ts`): Mapbox Static API limit is 8000 chars. Tried in order: (1) simplified polygons, (2) bounding box, (3) text-only.

**Mapbox rate limiting & cache** (`mapService.ts`): Monthly request counter persisted in SQLite (`mapbox_usage` table, key: `YYYY-MM`). Hard cap via `MAPBOX_MONTHLY_LIMIT` — falls back to text-only when reached. In-memory FIFO cache (default 20 entries) keyed by `type:city1|city2|...` — cache hit skips the HTTP call entirely. Counter increments only on successful API response.

**Bot singleton**: `getBot()` lazily creates one `grammy` Bot instance with `autoRetry` middleware. All handlers must be registered BEFORE `bot.start()`.

**`newsFlash` type**: Can mean "go to shelter" or "all-clear" — no sub-type enum. Uses `📌 <b>תוכן ההודעה:</b>` prefix instead of `🛡`. No map image. The library drops cityless newsFlash; `pollCitylessNewsFlash()` catches them via direct fetch.

**Drill labels**: Use "תרגיל — X" (not "אימון X") as the Hebrew prefix.

**DM notifications** (`dmDispatcher.ts`): Text-only. Short format: `"{emoji} {title} | cities"`. Detailed format reuses `formatAlertMessage()`. Auto-deletes user from DB on "bot was blocked" / "user is deactivated" / "chat not found".

**Zone hierarchy** (`config/zones.ts`): 28 flat zones from `cities.json`, manually mapped to 6 super-regions. Edit this file to adjust groupings.

**Alert message editing** (`index.ts` + `alertWindowTracker.ts`): Within `ALERT_UPDATE_WINDOW_SECONDS` (default 120s), a `newAlert` of the same type edits the existing Telegram message via `editMessageMedia` (photo + new image), `editMessageCaption` (photo, caption-only update when no new image available), or `editMessageText` (text-only messages) instead of sending a new one. Cities are merged (union). Falls back to a new message if the edit fails (e.g. message too old).

## Gotchas

- **Telegram callback_data limit**: 64 bytes UTF-8 — Hebrew chars = 2 bytes each. Always use numeric city IDs (`ct:511`), never raw Hebrew names. Bulk zone actions: `ca:srIdx:zoneIdx` (select all), `cr:srIdx:zoneIdx` (remove all).
- **Topic ID `1` is invalid**: In Telegram forum groups, thread 1 is reserved — returns `400: message thread not found`.
- **City polygon coords**: Stored as `[lat, lng]` in the package data — must be swapped to `[lng, lat]` for GeoJSON (`cityLookup.ts`).
- **Zone navigation state**: `zoneStates` Map is in-memory only. Bot restart → pagination buttons silently no-op until user re-enters zone.
- **Grammy middleware order** (`src/bot/`): `bot.on('message:text')` MUST call `await next()` when not consuming the message — was a live bug: text handler silently swallowed all `/command` messages.
- **better-sqlite3 `.exec()` method** triggers the shell-injection security hook — false positive, safe to proceed.
- **Do NOT add shelter countdown times**: Real times vary by threat origin (Lebanon vs. Iran/Yemen); city DB values are misleading.
- **`sendAlert()` re-throws**: Callers must handle errors. `index.ts` and `test-alert.ts` both wrap in try/catch.
- **Mapbox free tier**: 50,000 requests/month. Counter stored in `mapbox_usage` SQLite table (key: `YYYY-MM`). Set `MAPBOX_MONTHLY_LIMIT=40000` to leave a buffer. Cache hits and skipped types (newsFlash, drills when `MAPBOX_SKIP_DRILLS=true`) do not consume quota.
- **`noop` callback_data**: Used for display-only inline keyboard buttons (e.g., the `X/Y` page-count button in city pagination). Must have a registered `bot.callbackQuery('noop', ...)` handler that calls `ctx.answerCallbackQuery()` — without it Telegram shows a loading spinner indefinitely on tap.
