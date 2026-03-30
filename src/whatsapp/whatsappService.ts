import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import { log } from '../logger.js';
import type { IncomingWhatsAppMsg } from './whatsappListenerService.js';

export type WhatsAppStatus = 'disconnected' | 'qr' | 'connecting' | 'ready';

export interface WhatsAppGroup {
  id: string;
  name: string;
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
  try {
    const chats = await client.getChats();
    cachedGroups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({ id: chat.id._serialized, name: chat.name }));
  } catch (err: unknown) {
    log('error', 'WhatsApp', `שגיאה בטעינת קבוצות: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }
}

export function initialize(): void {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    return;
  }

  if (client !== null) {
    log('warn', 'WhatsApp', 'כבר מחובר — מדלג על אתחול נוסף');
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
  });

  client.on('disconnected', (reason: string) => {
    client = null;
    status = 'disconnected';
    phone = null;
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
      }).catch(() => null),
    });
  });

  status = 'connecting';
  client.initialize().catch((err: unknown) => {
    client = null;
    status = 'disconnected';
    log('error', 'WhatsApp', `שגיאה באתחול: ${err instanceof Error ? err.message : String(err)}`);
  });
}
