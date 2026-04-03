import type Database from 'better-sqlite3';
import { MessageMedia, type Chat } from 'whatsapp-web.js';
import { getActiveListenersForChannel } from '../db/whatsappListenerRepository.js';
import { getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository.js';
import { isRoutingCacheLoaded, getWhatsAppTopicIdCached } from '../config/routingCache.js';
import { getStatus, getClient } from './whatsappService.js';
import { log } from '../logger.js';
import { truncateToCaptionLimit } from '../telegramBot.js';

const MESSAGE_BODY_MAX = 3900; // leaves room for header within Telegram 4096 text limit

export type SendMessageFn = (
  chatId: string,
  text: string,
  threadId?: number
) => Promise<void>;

export interface IncomingWhatsAppMsg {
  from: string;
  body: string;
  timestamp: number; // Unix seconds (whatsapp-web.js msg.timestamp)
  hasMedia: boolean;
  downloadMedia: () => Promise<{ data: string; mimetype: string; filename?: string } | null>;
}

export type SendMediaFn = (
  chatId: string,
  buffer: Buffer,
  mimetype: string,
  caption: string,
  threadId?: number
) => Promise<void>;

function getWhatsAppDefaultTopicId(): number | undefined {
  if (isRoutingCacheLoaded()) return getWhatsAppTopicIdCached();
  const raw = process.env['TELEGRAM_TOPIC_ID_WHATSAPP'];
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed === 1) return undefined;
  return parsed;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTimestampIsrael(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('day')}.${get('month')} · ${get('hour')}:${get('minute')}`;
}

export interface ListenerBroadcastDeps {
  getStatusFn: () => string;
  getClientFn: () => { getChatById: (id: string) => Promise<Chat> } | null;
  getEnabledGroupsFn: (db: Database.Database, alertType: string) => string[];
}

const defaultBroadcastDeps: ListenerBroadcastDeps = {
  getStatusFn: getStatus,
  getClientFn: getClient as () => { getChatById: (id: string) => Promise<Chat> } | null,
  getEnabledGroupsFn: getEnabledGroupsForAlertType,
};

export async function broadcastToWhatsAppGroups(
  db: Database.Database,
  text: string,
  sourceGroupId: string,
  deps: ListenerBroadcastDeps,
  mediaData?: { data: string; mimetype: string; filename?: string } | null
): Promise<void> {
  if (deps.getStatusFn() !== 'ready') return;

  const groupIds = deps.getEnabledGroupsFn(db, 'whatsappForward');
  // Exclude the source group to avoid echoing the message back
  const targets = groupIds.filter(id => id !== sourceGroupId);
  if (targets.length === 0) return;

  const client = deps.getClientFn();
  if (!client) return;

  let media: MessageMedia | undefined;
  if (mediaData?.data) {
    media = new MessageMedia(mediaData.mimetype, mediaData.data, mediaData.filename);
  }

  let sent = 0;
  await Promise.all(
    targets.map(async (groupId) => {
      try {
        const chat = await client.getChatById(groupId);
        if (media) {
          await chat.sendMessage(media, { caption: text });
        } else {
          await chat.sendMessage(text);
        }
        sent++;
      } catch (err: unknown) {
        log('error', 'WA→WA', `שגיאה בשליחה לקבוצה ${groupId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  if (sent > 0) {
    log('info', 'WA→WA', `הועבר ל-${sent} קבוצות WhatsApp (whatsappForward)`);
  }
}

export function createMessageHandler(
  db: Database.Database,
  sendMessageFn: SendMessageFn,
  sendMediaFn?: SendMediaFn,
  broadcastDeps: ListenerBroadcastDeps = defaultBroadcastDeps
): (msg: IncomingWhatsAppMsg) => void {
  return function handleIncomingMessage(msg: IncomingWhatsAppMsg): void {
    void (async () => {
      const listeners = getActiveListenersForChannel(db, msg.from);
      if (listeners.length === 0) return;

      const targetChatId =
        process.env['TELEGRAM_FORWARD_GROUP_ID'] ?? process.env['TELEGRAM_CHAT_ID']!;

      const truncatedBody =
        msg.body.length > MESSAGE_BODY_MAX
          ? msg.body.slice(0, MESSAGE_BODY_MAX) + '…'
          : msg.body;

      const timeStr = formatTimestampIsrael(msg.timestamp);
      let anyForwarded = false;
      let downloadedMedia: { data: string; mimetype: string; filename?: string } | null = null;
      let triedDownload = false;

      for (const listener of listeners) {
        const shouldForward =
          listener.keywords.length === 0 ||
          listener.keywords.some((kw) => msg.body.includes(kw));

        if (!shouldForward) continue;

        anyForwarded = true;
        const headerLine = `📲 <b>${escapeHtml(listener.channelName)}</b>\n🕐 ${timeStr}`;
        const bodyLine = truncatedBody ? `\n\n${escapeHtml(truncatedBody)}` : '';
        const caption = `${headerLine}${bodyLine}`;
        const topicId = listener.telegramTopicId ?? getWhatsAppDefaultTopicId() ?? undefined;

        // Attempt media forward first
        if (msg.hasMedia && sendMediaFn) {
          if (!triedDownload) {
            triedDownload = true;
            try {
              downloadedMedia = await msg.downloadMedia();
            } catch (mediaErr) {
              log('warn', 'WhatsApp→TG', `מדיה נכשלה בהורדה: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)}`);
            }
          }

          if (downloadedMedia?.data) {
            try {
              const buffer = Buffer.from(downloadedMedia.data, 'base64');
              const mediaCaption = truncateToCaptionLimit(caption);
              await sendMediaFn(targetChatId, buffer, downloadedMedia.mimetype, mediaCaption, topicId);
              continue;
            } catch (tgMediaErr) {
                log('warn', 'WhatsApp→TG', `שילוח מדיה לטלגרם נכשל — שולח טקסט: ${tgMediaErr instanceof Error ? tgMediaErr.message : String(tgMediaErr)}`);
            }
          }
        }

        // Text fallback
        sendMessageFn(targetChatId, caption, topicId).catch((err: unknown) => {
          log(
            'error',
            'WhatsApp→TG',
            `שגיאה בהעברת הודעה מ-${msg.from}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }

      // Broadcast matched messages to WhatsApp groups subscribed to whatsappForward
      if (anyForwarded) {
        const plainHeader = `📲 ${listeners[0]?.channelName ?? ''}\n🕐 ${timeStr}`;
        const plainBody = truncatedBody ? `\n\n${truncatedBody}` : '';
        const plainText = `${plainHeader}${plainBody}`;
        broadcastToWhatsAppGroups(db, plainText, msg.from, broadcastDeps, downloadedMedia).catch((err: unknown) => {
          try {
            log('error', 'WA→WA', `שגיאה בשידור: ${String(err)}`);
          } catch {
            // prevent log failure from becoming an unhandled rejection
          }
        });
      }
    })().catch((err: unknown) => {
      log('error', 'WhatsApp→TG', `שגיאה בלתי צפויה: ${String(err)}`);
    });
  };
}
