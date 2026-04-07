import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage, NewMessageEvent, Raw } from 'telegram/events/index.js';
import { computeCheck } from 'telegram/Password.js';
import bigInt from 'big-integer';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from '../dashboard/settingsRepository.js';
import {
  upsertKnownChat,
  upsertKnownTopic,
  clearKnownTopicsForChat,
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
  mediaBuffer?: Buffer;    // downloaded bytes; undefined if >50MB, download failed, or no media
  mediaMimetype?: string;  // e.g. 'image/jpeg', 'video/mp4', 'application/pdf'
  mediaFilename?: string;  // original filename from DocumentAttributeFilename (documents only)
  topicId: number | null;  // forum topic thread ID, null for non-forum messages
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

// Exponential backoff delays for getDialogs() retries (ms)
const RETRY_DELAYS_MS = [2000, 5000, 12000, 30000] as const;

/** Injected credentials from configResolver; falls back to process.env. */
let injectedApiId: string | undefined;
let injectedApiHash: string | undefined;

export function setApiCredentials(apiId: string, apiHash: string): void {
  injectedApiId = apiId;
  injectedApiHash = apiHash;
}

function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiIdStr = injectedApiId ?? process.env['TELEGRAM_API_ID'];
  const apiHash = injectedApiHash ?? process.env['TELEGRAM_API_HASH'];
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

// Fetch forum topics for a supergroup and persist them.
async function refreshTopicsForChat(db: Database.Database, chatId: string): Promise<void> {
  if (!client) return;
  try {
    clearKnownTopicsForChat(db, chatId);
    let offsetTopic = 0;
    let totalTopics = 0;
    while (true) {
      const result = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: chatId,
          limit: 100,
          offsetId: 0,
          offsetDate: 0,
          offsetTopic,
        })
      );
      const batch = (result as unknown as { topics?: Array<{ id: number; title: string }> }).topics ?? [];
      if (!batch.length) break;
      for (const topic of batch) {
        if (topic.id && topic.title) {
          upsertKnownTopic(db, { topicId: topic.id, chatId, topicName: topic.title });
          totalTopics++;
        }
      }
      if (batch.length < 100) break; // last page
      offsetTopic = batch[batch.length - 1]!.id;
    }
    log('info', 'TG Listener', `נושאים עודכנו עבור ${chatId} — ${totalTopics} נושאים`);
  } catch (err: unknown) {
    // Non-fatal — not all groups support topics
    log('warn', 'TG Listener', `GetForumTopics נכשל עבור ${chatId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function refreshKnownChats(db: Database.Database, retryCount = 0): Promise<void> {
  if (!client) return;

  const authorized = await client.isUserAuthorized();
  if (!authorized) {
    log('warn', 'TG Listener', 'לקוח לא מאומת — מדלג על רענון דיאלוגים');
    return;
  }

  try {
    clearKnownChats(db);
    let offsetDate = 0;
    let offsetId = 0;
    let offsetPeer: Api.TypeInputPeer = new Api.InputPeerEmpty();
    let totalFetched = 0;
    let nullEntityCount = 0;
    let storedCount = 0;
    const forumChatIds: string[] = [];

    while (true) {
      // Use invoke() directly instead of the getDialogs() high-level wrapper.
      // The wrapper (_DialogsIter) builds an internal entity-cache lookup and
      // silently skips dialogs when the peer-ID key format doesn't match — which
      // happens reliably on cold session restores and causes an empty return even
      // though the API response contains dialogs. invoke() gives us the raw
      // response with result.chats always present, so we build our own map.
      const result = await client.invoke(
        new Api.messages.GetDialogs({
          offsetDate,
          offsetId,
          offsetPeer,
          limit: 100,
          hash: bigInt.zero,
        })
      );

      // DialogsNotModified means nothing changed — stop
      if (result.className === 'messages.DialogsNotModified') break;

      const rawDialogs = (result as Api.messages.Dialogs | Api.messages.DialogsSlice).dialogs;
      if (!rawDialogs.length) break;
      totalFetched += rawDialogs.length;

      // Build entity lookup directly from the API response (no GramJS cache dependency)
      const chatMap = new Map<string, Api.TypeChat>();
      for (const chat of (result as Api.messages.Dialogs).chats) {
        chatMap.set(chat.id.toString(), chat);
      }

      let lastRawDialog: Api.Dialog | undefined;

      for (const dialog of rawDialogs) {
        if (!(dialog instanceof Api.Dialog)) continue;
        lastRawDialog = dialog;

        const peer = dialog.peer;
        let isChannelType = false;
        let rawId: string;

        if (peer instanceof Api.PeerChannel) {
          rawId = peer.channelId.toString();
          isChannelType = true;
        } else if (peer instanceof Api.PeerChat) {
          rawId = peer.chatId.toString();
        } else {
          continue; // skip PeerUser (DMs)
        }

        const entity = chatMap.get(rawId);
        if (!entity) {
          nullEntityCount++;
          continue;
        }
        if (
          entity instanceof Api.ChatEmpty ||
          entity instanceof Api.ChatForbidden ||
          entity instanceof Api.ChannelForbidden
        ) continue;

        const megagroup = 'megagroup' in entity && !!(entity as { megagroup?: boolean }).megagroup;
        const isForum = 'forum' in entity && !!(entity as { forum?: boolean }).forum;
        const chatType = isChannelType ? (megagroup ? 'supergroup' : 'channel') : 'group';
        const chatId = isChannelType ? `-100${rawId}` : `-${rawId}`;
        const chatName = (entity as { title?: string }).title ?? rawId;

        upsertKnownChat(db, { chatId, chatName, chatType, isForum });
        storedCount++;
        if (isForum) forumChatIds.push(chatId);
      }

      // Only paginate for DialogsSlice (server has more pages)
      if (result.className !== 'messages.DialogsSlice' || rawDialogs.length < 100) break;
      if (!lastRawDialog) break;

      // Resolve the date of the last dialog's top message for the next page offset
      const lastTopMsgId = lastRawDialog.topMessage;
      const lastMsg = (result as Api.messages.DialogsSlice).messages.find(
        (m): m is Api.Message => m instanceof Api.Message && m.id === lastTopMsgId
      );
      const lastDate = lastMsg?.date ?? 0;
      if (!lastDate || (offsetDate !== 0 && lastDate >= offsetDate)) break;

      offsetDate = lastDate;
      offsetId = lastTopMsgId;

      // Build InputPeer for the last dialog (required by GetDialogs pagination)
      const lastPeer = lastRawDialog.peer;
      if (lastPeer instanceof Api.PeerChannel) {
        const lastEntity = chatMap.get(lastPeer.channelId.toString());
        const accessHash = lastEntity && 'accessHash' in lastEntity
          ? (lastEntity as { accessHash?: ReturnType<typeof bigInt> }).accessHash
          : undefined;
        if (!accessHash) break;
        offsetPeer = new Api.InputPeerChannel({ channelId: lastPeer.channelId, accessHash });
      } else if (lastPeer instanceof Api.PeerChat) {
        offsetPeer = new Api.InputPeerChat({ chatId: lastPeer.chatId });
      } else {
        break;
      }
    }

    log(
      'info', 'TG Listener',
      `סריקת דיאלוגים: ${totalFetched} נמצאו, ${nullEntityCount} entity ריק, ${storedCount} נשמרו`
    );

    // Fetch topics for all forum supergroups in parallel
    await Promise.all(forumChatIds.map((chatId) => refreshTopicsForChat(db, chatId)));

    // Retry with exponential backoff if the server genuinely returned nothing
    if (storedCount === 0 && totalFetched === 0 && retryCount < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryCount]!;
      log(
        'info', 'TG Listener',
        `לא נמצאו דיאלוגים — מנסה שוב בעוד ${delay / 1000} שנ׳ (ניסיון ${retryCount + 1}/${RETRY_DELAYS_MS.length})`
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      await refreshKnownChats(db, retryCount + 1);
      return;
    }

    log('info', 'TG Listener', 'רשימת צ\'אטים מוכרים עודכנה');
  } catch (err: unknown) {
    log('warn', 'TG Listener', `GetDialogs נכשל: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function attachMessageListener(db: Database.Database): void {
  if (!client) return;

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      // Allow media-only messages through (message.message is "" for photos/videos with no caption)
      if (!message?.message && !message?.media) return;

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

      // Extract forum topic thread ID (replyToTopId is set for messages inside a topic)
      const topicId = (message.replyTo as { replyToTopId?: number } | undefined)?.replyToTopId ?? null;

      // Verbose diagnostic: log incoming message receipt — enable with TELEGRAM_LISTENER_VERBOSE=true
      if (process.env['TELEGRAM_LISTENER_VERBOSE'] === 'true') {
        const bodyPreview = message.message?.slice(0, 60) ?? '[מדיה בלבד]';
        log('info', 'TG Listener', `הודעה מ-${chatId} · נושא=${topicId ?? 'ללא'} · "${bodyPreview}"`);
      }

      // Get chat name from the event's input chat
      let chatName = chatId;
      try {
        const entity = await client!.getEntity(message.peerId!);
        chatName = (entity as { title?: string }).title ?? chatId;
      } catch (entityErr: unknown) {
        // non-fatal — chatId used as fallback name
        log('info', 'TG Listener', `getEntity נכשל עבור ${chatId}: ${entityErr instanceof Error ? entityErr.message : String(entityErr)}`);
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
        } catch (senderErr: unknown) {
          // non-fatal — senderId used as fallback name
          log('info', 'TG Listener', `getEntity (sender) נכשל עבור ${senderId}: ${senderErr instanceof Error ? senderErr.message : String(senderErr)}`);
        }
      }

      const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50MB — Telegram bot API upload limit

      const msg: IncomingTelegramMsg = {
        chatId,
        chatName,
        senderId,
        senderName,
        body: message.message,
        timestamp: message.date ?? Math.floor(Date.now() / 1000),
        hasMedia: message.media != null,
        topicId,
      };

      // Download media for forwarding (photos and documents up to 50MB)
      if (message.media) {
        try {
          let skipDownload = false;

          if (message.media instanceof Api.MessageMediaDocument) {
            const doc = message.media.document;
            if (doc && 'size' in doc && Number((doc as { size?: unknown }).size) > MAX_MEDIA_BYTES) {
              log('info', 'TG Listener', `קובץ גדול מדי (${Math.round(Number((doc as { size?: unknown }).size) / 1024 / 1024)}MB) — שולח טקסט בלבד`);
              skipDownload = true;
            }
          }

          if (!skipDownload) {
            const downloaded = await client!.downloadMedia(message, {});
            if (downloaded instanceof Buffer && downloaded.length > 0) {
              msg.mediaBuffer = downloaded;
              if (message.media instanceof Api.MessageMediaPhoto) {
                msg.mediaMimetype = 'image/jpeg';
              } else if (message.media instanceof Api.MessageMediaDocument) {
                const doc = message.media.document as { mimeType?: string; attributes?: Array<{ className: string; fileName?: string }> } | undefined;
                msg.mediaMimetype = doc?.mimeType ?? 'application/octet-stream';
                const filenameAttr = doc?.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                msg.mediaFilename = filenameAttr?.fileName;
              }
            }
          }
        } catch (mediaErr: unknown) {
          log('warn', 'TG Listener', `הורדת מדיה נכשלה — שולח טקסט בלבד: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)}`);
        }
      }

      if (messageCallback) {
        await messageCallback(msg);
      } else {
        log('warn', 'TG Listener', `הודעה התקבלה אך אין messageCallback מוגדר — chatId: ${chatId}`);
      }
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בטיפול בהודעה: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, new NewMessage({}));

  // Monitor connection state changes for observability (reconnect detection)
  client.addEventHandler((update: unknown) => {
    try {
      const upd = update as { className?: string; state?: number } | undefined;
      if (upd?.className === 'UpdateConnectionState') {
        const stateLabel = upd.state === 1 ? 'מחובר' : upd.state === 2 ? 'מתחבר...' : `state=${upd.state}`;
        log('info', 'TG Listener', `שינוי מצב חיבור: ${stateLabel}`);
        if (upd.state === 1) {
          log('success', 'TG Listener', 'חיבור מחדש הצליח — מאזין פעיל');
        }
      }
    } catch (err: unknown) {
      // Never let a logging error disrupt the GramJS update pipeline
      // eslint-disable-next-line no-console
      console.error('[TG Listener] Raw handler error:', err);
    }
  }, new Raw({}));

  // Refresh known chats in background (non-blocking)
  refreshKnownChats(db).catch((err: unknown) => {
    log('error', 'TG Listener', `refreshKnownChats background נכשל: ${err instanceof Error ? err.message : String(err)}`);
  });
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
    // Warm-up: forces a round-trip that completes GramJS session sync before getDialogs() is called
    await client.getMe();
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
  if (isInitializing) throw new Error('אתחול מתבצע כרגע — נסה שוב בעוד רגע');

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
  // Warm-up: ensure session state is settled before attaching the listener
  await client.getMe();
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
