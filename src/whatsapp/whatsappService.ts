import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs/promises';
import { spawnSync } from 'child_process';
import QRCode from 'qrcode';
import { log } from '../logger.js';
import type { IncomingWhatsAppMsg } from './whatsappListenerService.js';

export type WhatsAppStatus = 'disconnected' | 'qr' | 'connecting' | 'ready';

export interface WhatsAppGroup {
  id: string;
  name: string;
}

// ─── Browser-context helper (runs inside Puppeteer via pupPage.evaluate) ─────
// This function is serialized and sent to the browser — it has no access to
// Node.js scope. `window.Store` is injected by whatsapp-web.js.
async function scanWhatsAppStoresForChannels(): Promise<Array<{ id: string; name: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = globalThis as any;
  const results: Array<{ id: string; name: string }> = [];

  // Strategy 1: WAWebNewsletterMetadataCollection
  const nlCollection = w.Store?.WAWebNewsletterMetadataCollection;
  if (nlCollection) {
    const models = nlCollection.getModelsArray?.() ?? [];
    for (const m of models) {
      const id = m.id?._serialized;
      const name = m.name || m.channelMetadata?.name;
      if (id && name) results.push({ id, name });
    }
  }

  // Strategy 2: scan Store.Chat for @newsletter entries
  if (results.length === 0) {
    const chatModels = w.Store?.Chat?.getModelsArray?.() ?? [];
    for (const chat of chatModels) {
      const id = chat.id?._serialized;
      if (id?.endsWith?.('@newsletter') && chat.name) {
        results.push({ id, name: chat.name });
      }
    }
  }

  return results;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let client: Client | null = null;
let status: WhatsAppStatus = 'disconnected';
let currentQr: string | null = null;
let phone: string | null = null;
let cachedGroups: WhatsAppGroup[] = [];
let onMessageCallback: ((msg: IncomingWhatsAppMsg) => void) | null = null;
let isInitializing = false;

// Module-level timer reference so disconnect() can always cancel it, even if
// the initialize() call that created it is no longer in scope. This prevents
// a stale 90s timeout from killing a subsequent initialization.
let initTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Kill the Chromium process by PID via the Puppeteer browser object.
// This is a best-effort fast path — works when pupBrowser is already set.
async function forceKillByPid(c: Client): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pid: number | undefined = (c as any).pupBrowser?.process()?.pid;
    // Guard: pid must be a positive integer — process.kill(0) would signal the
    // current process group, which would crash the entire Node.js process.
    if (pid && pid > 0) {
      process.kill(pid, 'SIGKILL');
      log('info', 'WhatsApp', `Chromium (PID ${pid}) נהרג בכוח`);
    }
  } catch {
    // process already dead — fine
  }
}

// Kill ALL Puppeteer-managed Chrome processes. Uses ASCII-only patterns so
// pkill -f works correctly even when the session path contains non-ASCII
// characters (Hebrew directories). Falls back to multiple strategies.
function killChromeBySessionPath(_sessionPath: string): void {
  // Strategy 1: match Puppeteer's cache directory — always ASCII, always works
  try {
    spawnSync('pkill', ['-9', '-f', '.cache/puppeteer'], { timeout: 3000 });
  } catch { /* ignore */ }
  // Strategy 2: match the Chrome for Testing app bundle (macOS)
  try {
    spawnSync('pkill', ['-9', '-f', 'Google Chrome for Testing'], { timeout: 3000 });
  } catch { /* ignore */ }
  log('info', 'WhatsApp', 'כל תהליכי Chrome for Testing נהרגו');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStatus(): WhatsAppStatus {
  return status;
}

export function getQr(): string | null {
  return currentQr;
}

export function getPhone(): string | null {
  return phone;
}

export function getCachedGroups(): WhatsAppGroup[] {
  return [...cachedGroups];
}

export function getClient(): Client | null {
  return client;
}

export function setMessageCallback(
  cb: (msg: IncomingWhatsAppMsg) => void
): void {
  onMessageCallback = cb;
}

export async function refreshGroups(): Promise<void> {
  if (!client) return;

  let groupEntries: WhatsAppGroup[] = [];
  let channelEntries: WhatsAppGroup[] = [];

  // ── Groups: from getChats(), filter for isGroup ────────────────────────────
  try {
    const chats = await client.getChats();
    groupEntries = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({ id: chat.id._serialized, name: chat.name }));
  } catch (err: unknown) {
    log('error', 'WhatsApp', `שגיאה בטעינת קבוצות: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }

  // ── Channels: try getChannels() first, fall back to Store.Chat scan ────────
  try {
    const channels = await client.getChannels();
    channelEntries = channels
      .filter((ch) => ch.name?.trim())
      .map((ch) => ({ id: ch.id._serialized, name: ch.name }));
  } catch (err: unknown) {
    log('warn', 'WhatsApp', `getChannels() נכשל: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fallback: scan internal WhatsApp Web stores for @newsletter entries.
  // getChannels() reads from WAWebNewsletterMetadataCollection which may be
  // empty in headless sessions. Scan Store.Chat as a secondary source.
  if (channelEntries.length === 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pupPage = (client as any).pupPage as { evaluate: (fn: () => Promise<Array<{ id: string; name: string }>>) => Promise<Array<{ id: string; name: string }>> };
      const chatNewsletters: WhatsAppGroup[] = await pupPage.evaluate(scanWhatsAppStoresForChannels);
      channelEntries = chatNewsletters.filter((ch) => ch.name?.trim());
      if (channelEntries.length > 0) {
        log('info', 'WhatsApp', `נטענו ${channelEntries.length} ערוצים דרך fallback`);
      }
    } catch (err: unknown) {
      log('warn', 'WhatsApp', `שגיאה בטעינת ערוצים (fallback): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (channelEntries.length === 0) {
    log('info', 'WhatsApp', 'לא נמצאו ערוצים — ייתכן שה-store לא נטען עדיין');
  } else {
    log('info', 'WhatsApp', `נטענו ${channelEntries.length} ערוצים`);
  }

  cachedGroups = [...groupEntries, ...channelEntries];
}

export async function disconnect(): Promise<void> {
  // Cancel any pending init timeout before anything else — a stale 90s timer
  // from a previous initialize() call must never fire against a new session.
  if (initTimeoutHandle !== null) {
    clearTimeout(initTimeoutHandle);
    initTimeoutHandle = null;
  }

  isInitializing = false;
  if (!client) return;

  // Null client immediately so concurrent initialize() calls are blocked
  const c = client;
  client = null;
  status = 'disconnected';
  phone = null;
  cachedGroups = [];
  currentQr = null;

  // Attempt graceful shutdown first (5s timeout), then force-kill by PID.
  try {
    await Promise.race([
      c.destroy(),
      new Promise<void>(resolve => setTimeout(resolve, 5000)),
    ]);
  } catch { /* ignore destroy errors */ }
  await forceKillByPid(c);
}

export async function clearSession(): Promise<void> {
  const sessionPath = path.join(__dirname, '../../data/whatsapp-session');

  // Kill all Chromium processes referencing this session BEFORE disconnect()
  // so that pkill handles the case where pupBrowser is null (mid-launch).
  killChromeBySessionPath(sessionPath);

  await disconnect();

  // Wait for the OS to release all file locks after SIGKILL. 2s is conservative
  // but avoids EACCES on fs.rm when Chromium hasn't fully exited yet.
  await new Promise<void>(resolve => setTimeout(resolve, 2000));
  await fs.rm(sessionPath, { recursive: true, force: true });
  log('info', 'WhatsApp', 'Session נמחק — QR חדש יופיע לאחר אתחול');
}

export function initialize(): void {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    return;
  }

  if (client !== null) {
    log('info', 'WhatsApp', 'כבר מחובר — מרענן קבוצות');
    refreshGroups().catch((err: unknown) => {
      log('warn', 'WhatsApp', `refreshGroups retry נכשל: ${err instanceof Error ? err.message : String(err)}`);
    });
    return;
  }

  // Prevent concurrent initializations — e.g. when disconnect() nulls client
  // but the previous Chromium process is still launching.
  if (isInitializing) {
    log('info', 'WhatsApp', 'אתחול כבר מתבצע — מדלג');
    return;
  }
  isInitializing = true;

  const sessionPath = path.join(__dirname, '../../data/whatsapp-session');

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
    },
  });

  // Store timeout at module scope so disconnect() can cancel it regardless of
  // which initialize() call created it. Prevents stale timers from killing a
  // subsequent initialization (e.g. after clear-session).
  if (initTimeoutHandle !== null) clearTimeout(initTimeoutHandle);
  initTimeoutHandle = setTimeout(() => {
    initTimeoutHandle = null;
    if (status === 'connecting') {
      log('warn', 'WhatsApp', 'אתחול פג זמן (90s) — מנתק ומאפס');
      disconnect().catch((err: unknown) => {
        isInitializing = false;
        log('error', 'WhatsApp', `ניתוק אחרי timeout נכשל: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }, 90_000);

  client.on('qr', (qr: string) => {
    const isRefresh = currentQr !== null;
    status = 'qr';
    currentQr = qr;
    log(
      'info',
      'WhatsApp',
      isRefresh ? 'קוד QR התחדש — יש לסרוק שוב' : 'קוד QR התקבל — יש לסרוק עם הטלפון'
    );
    QRCode.toString(qr, { type: 'terminal', small: true })
      .then((qrText) => { process.stdout.write('\n' + qrText + '\n'); })
      .catch(() => { /* terminal rendering failed — text log above is sufficient */ });
  });

  client.on('authenticated', () => {
    status = 'connecting';
    currentQr = null;
    log('info', 'WhatsApp', 'מאומת — ממתין לאתחול');
  });

  client.on('ready', async () => {
    if (initTimeoutHandle !== null) {
      clearTimeout(initTimeoutHandle);
      initTimeoutHandle = null;
    }
    isInitializing = false;
    status = 'ready';
    currentQr = null;
    phone = client!.info.wid.user;
    log('success', 'WhatsApp', `מחובר — טלפון: ${phone}`);
    await refreshGroups();
    if (cachedGroups.length === 0) {
      log('info', 'WhatsApp', 'לא נמצאו קבוצות — מנסה שוב בעוד 3 שניות');
      setTimeout(() => {
        refreshGroups().catch((err: unknown) => {
          log('warn', 'WhatsApp', `refreshGroups retry נכשל: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, 3000);
    }
  });

  client.on('disconnected', (reason: string) => {
    if (initTimeoutHandle !== null) {
      clearTimeout(initTimeoutHandle);
      initTimeoutHandle = null;
    }
    isInitializing = false;
    client = null;
    status = 'disconnected';
    phone = null;
    cachedGroups = [];
    log('warn', 'WhatsApp', `מנותק — סיבה: ${reason}`);
  });

  client.on('loading_screen', () => {
    status = 'connecting';
  });

  client.on('message', (msg) => {
    if (msg.fromMe) return;                              // prevent forwarding the bot's own messages
    if (!msg.body?.trim() && !msg.hasMedia) return;      // allow media-only messages
    onMessageCallback?.({
      from: msg.from,
      body: msg.body ?? '',
      timestamp: msg.timestamp,
      hasMedia: msg.hasMedia,
      downloadMedia: () => msg.downloadMedia().then((m) => {
        if (!m) return null;
        return { data: m.data, mimetype: m.mimetype, filename: m.filename ?? undefined };
      }),
    });
  });

  status = 'connecting';
  client.initialize().catch((err: unknown) => {
    if (initTimeoutHandle !== null) {
      clearTimeout(initTimeoutHandle);
      initTimeoutHandle = null;
    }
    isInitializing = false;
    client = null;
    status = 'disconnected';
    log('error', 'WhatsApp', `שגיאה באתחול: ${err instanceof Error ? err.message : String(err)}`);
  });
}
