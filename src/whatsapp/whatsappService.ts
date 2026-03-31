import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
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
  if (!client) return;
  try {
    await client.destroy();
  } catch (err: unknown) {
    log('error', 'WhatsApp', `שגיאה בניתוק: ${err instanceof Error ? err.message : String(err)}`);
  }
  client = null;
  status = 'disconnected';
  phone = null;
  cachedGroups = [];
  currentQr = null;
}

export function initialize(): void {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    return;
  }

  if (client !== null) {
    log('info', 'WhatsApp', 'כבר מחובר — מרענן קבוצות');
    refreshGroups().catch(() => {});
    return;
  }

  const sessionPath = path.join(__dirname, '../../data/whatsapp-session');

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
    },
  });

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
    status = 'ready';
    currentQr = null;
    phone = client!.info.wid.user;
    log('success', 'WhatsApp', `מחובר — טלפון: ${phone}`);
    await refreshGroups();
    if (cachedGroups.length === 0) {
      log('info', 'WhatsApp', 'לא נמצאו קבוצות — מנסה שוב בעוד 3 שניות');
      setTimeout(() => { refreshGroups().catch(() => {}); }, 3000);
    }
  });

  client.on('disconnected', (reason: string) => {
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
    client = null;
    status = 'disconnected';
    log('error', 'WhatsApp', `שגיאה באתחול: ${err instanceof Error ? err.message : String(err)}`);
  });
}
