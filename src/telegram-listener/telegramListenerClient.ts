import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import { computeCheck } from 'telegram/Password.js';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from '../dashboard/settingsRepository.js';
import {
  upsertKnownChat,
  clearKnownChats,
} from '../db/telegramListenerRepository.js';
import { log } from '../logger.js';

export type TelegramListenerStatus =
  | 'connected'
  | 'connecting'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'disconnected';

export interface IncomingTelegramMsg {
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: number; // Unix seconds
  hasMedia: boolean;
}

const SETTINGS_SESSION_KEY = 'telegram_listener_session';
const SETTINGS_PHONE_KEY = 'telegram_listener_phone';

let client: TelegramClient | null = null;
let status: TelegramListenerStatus = 'disconnected';
let isInitializing = false;
let isDisconnecting = false;
let messageCallback: ((msg: IncomingTelegramMsg) => Promise<void>) | null = null;

// Stored between sendCode() and signIn() calls (within the same session)
let pendingPhone: string | null = null;

function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiIdStr = process.env['TELEGRAM_API_ID'];
  const apiHash = process.env['TELEGRAM_API_HASH'];
  if (!apiIdStr || !apiHash) {
    throw new Error(
      'TELEGRAM_API_ID and TELEGRAM_API_HASH are required when TELEGRAM_LISTENER_ENABLED=true'
    );
  }
  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) {
    throw new Error('TELEGRAM_API_ID must be a valid integer');
  }
  return { apiId, apiHash };
}

async function refreshKnownChats(db: Database.Database): Promise<void> {
  if (!client) return;
  try {
    clearKnownChats(db);
    let offsetDate = 0;
    while (true) {
      const batch = await client.getDialogs({ limit: 100, offsetDate });
      if (!batch.length) break;

      for (const dialog of batch) {
        const entity = dialog.entity;
        if (!entity) continue;

        // Only groups, channels, and supergroups — skip DMs and bots
        const entityType = entity.className;
        if (entityType !== 'Chat' && entityType !== 'Channel') continue;

        const isChannel = entityType === 'Channel';
        const megagroup = !!(entity as { megagroup?: boolean }).megagroup;
        const chatType = isChannel ? (megagroup ? 'supergroup' : 'channel') : 'group';

        const rawId = entity.id;
        // Convert to signed 64-bit Telegram chat ID format
        const chatId = isChannel ? `-100${rawId.toString()}` : `-${rawId.toString()}`;
        const chatName = (entity as { title?: string }).title ?? String(rawId);

        upsertKnownChat(db, { chatId, chatName, chatType });
      }

      const lastDialog = batch[batch.length - 1];
      const lastDate = (lastDialog?.date as number | undefined) ?? 0;
      if (!lastDate || lastDate >= offsetDate) break;
      offsetDate = lastDate;
    }
    log('info', 'TG Listener', 'רשימת צ\'אטים מוכרים עודכנה');
  } catch (err: unknown) {
    log('warn', 'TG Listener', `getDialogs נכשל: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function attachMessageListener(db: Database.Database): void {
  if (!client) return;

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      if (!message?.message) return;

      const peerId = message.peerId;
      if (!peerId) return;

      // Only handle group/channel messages (not DMs)
      const peerType = peerId.className;
      if (peerType !== 'PeerChannel' && peerType !== 'PeerChat') return;

      // Build chatId in the same format as refreshKnownChats
      const rawId = (peerId as { channelId?: { toString(): string }; chatId?: { toString(): string } }).channelId
        ?? (peerId as { chatId?: { toString(): string } }).chatId;
      if (!rawId) return;

      const chatId = peerType === 'PeerChannel'
        ? `-100${rawId.toString()}`
        : `-${rawId.toString()}`;

      // Get chat name from the event's input chat
      let chatName = chatId;
      try {
        const entity = await client!.getEntity(message.peerId!);
        chatName = (entity as { title?: string }).title ?? chatId;
      } catch {
        // non-fatal — use chatId as fallback name
      }

      // Build sender info
      const fromId = message.fromId;
      const senderId = fromId
        ? String((fromId as { userId?: { toString(): string } }).userId ?? rawId.toString())
        : String(rawId);
      let senderName = senderId;
      if (fromId) {
        try {
          const sender = await client!.getEntity(fromId);
          const s = sender as { firstName?: string; lastName?: string; username?: string };
          senderName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username || senderId;
        } catch {
          // non-fatal
        }
      }

      const msg: IncomingTelegramMsg = {
        chatId,
        chatName,
        senderId,
        senderName,
        body: message.message,
        timestamp: message.date ?? Math.floor(Date.now() / 1000),
        hasMedia: message.media != null,
      };

      if (messageCallback) {
        await messageCallback(msg);
      }
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בטיפול בהודעה: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, new NewMessage({}));

  // Refresh known chats in background (non-blocking)
  void refreshKnownChats(db);
}

export async function initialize(db: Database.Database): Promise<void> {
  if (isDisconnecting || isInitializing) return;
  isInitializing = true;
  status = 'connecting';

  try {
    const { apiId, apiHash } = getApiCredentials();
    const savedSession = getSetting(db, SETTINGS_SESSION_KEY) ?? '';

    if (!savedSession) {
      status = 'disconnected';
      return;
    }

    const session = new StringSession(savedSession);
    client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    status = 'connected';
    log('success', 'TG Listener', 'מחובר עם session קיים');
    attachMessageListener(db);
  } catch (err: unknown) {
    status = 'disconnected';
    client = null;
    log('warn', 'TG Listener', `חיבור ראשוני נכשל: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    isInitializing = false;
  }
}

export async function startPhoneAuth(
  db: Database.Database,
  phone: string
): Promise<{ phoneCodeHash: string }> {
  if (isDisconnecting) throw new Error('מתנתק כרגע — נסה שוב בעוד רגע');

  const { apiId, apiHash } = getApiCredentials();
  const session = new StringSession('');
  client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
  await client.connect();

  pendingPhone = phone;
  status = 'awaiting_code';

  const result = await client.sendCode({ apiId, apiHash }, phone);
  return { phoneCodeHash: result.phoneCodeHash };
}

export async function submitCode(
  db: Database.Database,
  code: string,
  phoneCodeHash: string
): Promise<void> {
  if (!client || !pendingPhone) {
    throw new Error('לא התחיל תהליך אימות — קרא ל-startPhoneAuth תחילה');
  }

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: pendingPhone,
        phoneCodeHash,
        phoneCode: code,
      })
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('SESSION_PASSWORD_NEEDED')) {
      status = 'awaiting_password';
      throw err;
    }
    throw err;
  }

  await saveSessionAndFinish(db);
}

export async function submitPassword(
  db: Database.Database,
  password: string
): Promise<void> {
  if (!client) throw new Error('לא מחובר');

  const passwordSrpParams = await client.invoke(new Api.account.GetPassword());
  const passwordCheck = await computeCheck(passwordSrpParams, password);
  await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
  await saveSessionAndFinish(db);
}

async function saveSessionAndFinish(db: Database.Database): Promise<void> {
  if (!client) return;
  const sessionStr = client.session.save() as unknown as string;
  setSetting(db, SETTINGS_SESSION_KEY, sessionStr);
  if (pendingPhone) {
    setSetting(db, SETTINGS_PHONE_KEY, pendingPhone);
  }
  pendingPhone = null;
  status = 'connected';
  log('success', 'TG Listener', 'אימות הצליח — מחובר');
  attachMessageListener(db);
}

export async function disconnect(db: Database.Database): Promise<void> {
  isDisconnecting = true;
  try {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // best-effort
      }
      client = null;
    }
    setSetting(db, SETTINGS_SESSION_KEY, '');
    setSetting(db, SETTINGS_PHONE_KEY, '');
    pendingPhone = null;
    status = 'disconnected';
    log('info', 'TG Listener', 'מנותק — session נמחק');
  } finally {
    isDisconnecting = false;
  }
}

export function getStatus(): TelegramListenerStatus {
  return status;
}

export function getPhone(db: Database.Database): string | null {
  return getSetting(db, SETTINGS_PHONE_KEY) ?? null;
}

export function setMessageCallback(
  fn: (msg: IncomingTelegramMsg) => Promise<void>
): void {
  messageCallback = fn;
}
