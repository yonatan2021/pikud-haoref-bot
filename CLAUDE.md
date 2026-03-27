# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the bot (tsx src/index.ts)
npm run dev        # Run with file-watching (auto-restart on change)
npm run build      # Compile TypeScript to dist/
npx tsx test-alert.ts   # Send one test alert per topic category (5 total) to Telegram for manual testing
npx tsx --test src/__tests__/topicRouter.test.ts  # Run topic router tests
npx tsx --test src/__tests__/telegramBot.test.ts  # Run message formatter tests (escapeHtml, buildCityList)
npx tsx --test "src/__tests__/*.test.ts"          # Run all unit tests
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

If none are set, all alerts go to the main chat.

## Directory Structure

```
src/
├── index.ts              # Entry point — async IIFE, starts bot.start() + alertPoller
├── alertPoller.ts        # Polls pikud-haoref-api, emits "newAlert"
├── telegramBot.ts        # Channel broadcast: formatAlertMessage, sendAlert, getBot
├── mapService.ts         # Mapbox static map generation
├── cityLookup.ts         # City/polygon data + search/zone helpers
├── topicRouter.ts        # Alert type → Telegram topic ID
├── types.ts              # Shared TypeScript interfaces
├── db/                   # SQLite layer (better-sqlite3, synchronous)
│   ├── schema.ts         # initDb(), getDb() singleton
│   ├── userRepository.ts
│   └── subscriptionRepository.ts
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
AlertPoller (polls pikud-haoref-api every 2s)
    → emits "newAlert" event
        → mapService.generateMapImage()   # builds Mapbox static map URL
        → topicRouter.getTopicId()        # resolves Telegram thread ID from alert type
        → telegramBot.sendAlert()         # sends photo+caption or text-only to correct topic
        → dmDispatcher.notifySubscribers() # sends text-only DM to subscribed users
```

### Key Design Decisions

**Deduplication via fingerprints** (`alertPoller.ts`): Each alert is hashed as `type:city1|city2|...` (sorted). The in-memory `seenFingerprints` set prevents duplicate sends. It resets automatically when no active alerts are returned — meaning after an all-clear, the same alert type can fire again.

**Alert grouping** (`alertPoller.ts`): Before fingerprinting, all Alert objects with the same `type` in a single poll response are merged into one (union of cities). This prevents the API returning separate per-city objects from triggering multiple Telegram messages for the same event.

**Map URL fallback strategy** (`mapService.ts`): Mapbox Static API has an 8000-char URL limit. The service tries three strategies in order:
1. Simplified city polygons (turf simplify)
2. Bounding box rectangle if URL still too long
3. No image (text-only message) if bounding box URL is also too long

**City/polygon data** (`cityLookup.ts`): City coordinates and boundary polygons come from `pikud-haoref-api/cities.json` and `pikud-haoref-api/polygons.json` (bundled with the npm package). Polygon coords are stored as `[lat, lng]` and must be swapped to `[lng, lat]` for GeoJSON.

**Message formatting** (`telegramBot.ts`): Messages use HTML parse mode (`parse_mode: 'HTML'`). Dynamic content is escaped via `escapeHtml()` — only `&`, `<`, `>` need escaping. Up to 25 cities are displayed as a comma-separated string via `buildCityList()`; if more cities exist, an italic `ועוד X ערים נוספות` line is appended. Both `escapeHtml` and `buildCityList` are exported for unit testing. Message structure: `{emoji} **title** / 🕐 time · 📍 zone / cities / 🛡 instructions`.

**Bot singleton**: `getBot()` lazily creates one `grammy` Bot instance with `autoRetry` middleware to handle Telegram rate limits.

**Alert instructions** (`telegramBot.ts`): The `instructions` field from the Pikud HaOref API contains official Hebrew safety guidance per alert. It is shown at the bottom of every message (🛡 prefix). Do NOT add countdown/shelter times derived from city data — real times vary by threat origin (Lebanon vs. Iran/Yemen) and the DB values are misleading.

**`newsFlash` type** (`telegramBot.ts`): Can mean either "go to shelter" or "all-clear" — there is no sub-type enum. The only distinguishing signal is the `instructions` field content at runtime; display it as-is.

**Drill labels** (`telegramBot.ts`): Use "תרגיל — X" (not "אימון X") as the Hebrew prefix for drill alert types.

**Topic routing** (`topicRouter.ts`): Maps alert types to 5 Telegram forum topic categories via `TELEGRAM_TOPIC_ID_*` env vars. All vars are optional — if unset, `getTopicId()` returns `undefined` and the alert falls back to the main chat. Tests live in `src/__tests__/topicRouter.test.ts` (Node.js built-in runner, no test framework needed).

**Topic ID lookup**: Open the topic in Telegram → copy the URL → the number after `?thread=` is the `message_thread_id`. Avoid setting any topic to ID `1` — in Telegram forum groups, thread 1 is reserved/invalid and will return `400: message thread not found`.

**Error handling** (`telegramBot.ts`): `sendAlert()` logs the error then re-throws it, so callers must handle it. `index.ts` wraps the call in try/catch; `test-alert.ts` does the same per test case so a single failure doesn't abort the run.

**Subscription DB** (`src/db/`): SQLite via `better-sqlite3` (synchronous — no async/await). DB file at `data/subscriptions.db` (auto-created on first run, gitignored). Tables: `users` (chat_id, format), `subscriptions` (chat_id, city_name).

**DM bot handlers** (`src/bot/`): grammy handlers for interactive DM menus. All handlers must be registered on the bot instance BEFORE calling `bot.start()`. `bot.start()` runs concurrently with `alertPoller.start()` in `index.ts`.

**DM notifications** (`src/services/dmDispatcher.ts`): Text-only (no Mapbox image) to avoid per-request costs. Short format: `"🔴 {title} | cities"`. Detailed format reuses `formatAlertMessage()`. If send fails with "bot was blocked", user is deleted from DB automatically.

**Zone hierarchy** (`src/config/zones.ts`): `cities.json` has 28 flat zones (no sub-zones in the data). Manually mapped to 6 super-regions. Edit this file to adjust groupings.

**Telegram callback_data limit**: 64 bytes UTF-8. Hebrew chars = 2 bytes each. Always use numeric city IDs (e.g. `ct:511`) in callback_data, never raw Hebrew city names.

**Security hook false positive**: `database.exec()` (better-sqlite3 method) triggers the shell-injection security hook — it is a false positive, safe to proceed.

**Grammy middleware order** (`src/bot/`): handlers run in registration order. `bot.on('message:text')` MUST call `await next()` when not consuming the message — otherwise it blocks all subsequent command handlers. This was a live bug: the text handler registered before command handlers was silently swallowing all `/command` messages.
