import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import type Database from 'better-sqlite3';
import { getActiveListenersForChat, getKnownChatById } from '../db/telegramListenerRepository.js';
import { isRoutingCacheLoaded, getWhatsAppTopicIdCached } from '../config/routingCache.js';
import { truncateToCaptionLimit } from '../telegramBot.js';
import {
  initialize,
  setMessageCallback,
  type IncomingTelegramMsg,
} from './telegramListenerClient.js';
import {
  broadcastToWhatsAppGroups,
  type ListenerBroadcastDeps,
} from '../whatsapp/whatsappListenerService.js';
import { getStatus as getWAStatus, getClient as getWAClient } from '../whatsapp/whatsappService.js';
import { getEnabledGroupsForAlertType } from '../db/whatsappGroupRepository.js';
import { log } from '../logger.js';

const MESSAGE_BODY_MAX = 3900;

// Simple wrapper type — keeps TG listener decoupled from WA internals
type WaBroadcastFn = (plainText: string) => Promise<void>;

const defaultWABroadcastDeps: ListenerBroadcastDeps = {
  getStatusFn: getWAStatus,
  getClientFn: getWAClient as ListenerBroadcastDeps['getClientFn'],
  getEnabledGroupsFn: getEnabledGroupsForAlertType,
};

function getDefaultTopicId(): number | undefined {
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
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('day')}.${get('month')} · ${get('hour')}:${get('minute')}`;
}

export function createMessageHandler(
  db: Database.Database,
  bot: Bot,
  broadcastToWAFn?: WaBroadcastFn
): (msg: IncomingTelegramMsg) => Promise<void> {
  return async function handleIncomingMessage(msg: IncomingTelegramMsg): Promise<void> {
    try {
      const listeners = getActiveListenersForChat(db, msg.chatId);
      if (listeners.length === 0) {
        log('warn', 'TG Listener', `לא נמצאו כללים פעילים עבור chatId: ${msg.chatId}`);
        return;
      }

      const targetChatId =
        process.env['TELEGRAM_FORWARD_GROUP_ID'] ?? process.env['TELEGRAM_CHAT_ID'];
      if (!targetChatId) {
        log('error', 'TG Listener', 'TELEGRAM_FORWARD_GROUP_ID or TELEGRAM_CHAT_ID not configured');
        return;
      }

      const truncatedBody =
        msg.body.length > MESSAGE_BODY_MAX
          ? msg.body.slice(0, MESSAGE_BODY_MAX) + '…'
          : msg.body;

      const timeStr = formatTimestampIsrael(msg.timestamp);
      let anyForwarded = false;
      let anyWAForward = false;

      // Telegram forum groups: the General topic (id=1) sends messages without
      // replyToTopId, so topicId arrives as null. Normalise null → 1 for forum groups.
      const chat = getKnownChatById(db, msg.chatId);
      const effectiveTopicId = (chat?.isForum && msg.topicId === null) ? 1 : msg.topicId;

      for (const listener of listeners) {
        // Topic filter: if a specific source topic is configured, only forward messages from that topic
        if (listener.sourceTopicId !== null && effectiveTopicId !== listener.sourceTopicId) {
          log('info', 'TG Listener', `listener ${listener.id}: נושא לא תואם (נדרש ${listener.sourceTopicId}, התקבל ${effectiveTopicId})`);
          continue;
        }

        const shouldForward =
          listener.keywords.length === 0 ||
          listener.keywords.some((kw) => msg.body.includes(kw));

        if (!shouldForward) {
          log('info', 'TG Listener', `listener ${listener.id}: מילות מפתח לא תואמות`);
          continue;
        }

        anyForwarded = true;
        if (listener.forwardToWhatsApp) anyWAForward = true;
        const headerLine = `📡 <b>${escapeHtml(listener.chatName)}</b>\n🕐 ${timeStr}`;
        const bodyLine = truncatedBody ? `\n\n${escapeHtml(truncatedBody)}` : '';
        const caption = `${headerLine}${bodyLine}`;
        const topicId = listener.telegramTopicId ?? getDefaultTopicId() ?? undefined;

        const sendOpts = topicId ? { message_thread_id: topicId } : {};

        if (msg.mediaBuffer && msg.mediaMimetype) {
          const mediaCaption = truncateToCaptionLimit(caption); // photos/docs cap at 1024 chars
          const filename = msg.mediaFilename;

          if (msg.mediaMimetype.startsWith('image/')) {
            bot.api
              .sendPhoto(targetChatId, new InputFile(msg.mediaBuffer, filename ?? 'photo.jpg'), {
                caption: mediaCaption, parse_mode: 'HTML', ...sendOpts,
              })
              .catch((err: unknown) => {
                log('error', 'TG→TG', `שגיאה בשליחת תמונה מ-${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`);
                bot.api.sendMessage(targetChatId, caption, { parse_mode: 'HTML', ...sendOpts }).catch((fallbackErr: unknown) => {
                  log('error', 'TG→TG', `fallback sendMessage נכשל מ-${msg.chatId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
                });
              });
          } else {
            bot.api
              .sendDocument(targetChatId, new InputFile(msg.mediaBuffer, filename ?? 'file'), {
                caption: mediaCaption, parse_mode: 'HTML', ...sendOpts,
              })
              .catch((err: unknown) => {
                log('error', 'TG→TG', `שגיאה בשליחת קובץ מ-${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`);
                bot.api.sendMessage(targetChatId, caption, { parse_mode: 'HTML', ...sendOpts }).catch((fallbackErr: unknown) => {
                  log('error', 'TG→TG', `fallback sendMessage נכשל מ-${msg.chatId}: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
                });
              });
          }
        } else {
          bot.api
            .sendMessage(targetChatId, caption, { parse_mode: 'HTML', ...sendOpts })
            .catch((err: unknown) => {
              log(
                'error',
                'TG→TG',
                `שגיאה בהעברת הודעה מ-${msg.chatId}: ${err instanceof Error ? err.message : String(err)}`
              );
            });
        }
      }

      if (anyWAForward && broadcastToWAFn) {
        const plainHeader = `📡 ${listeners[0]?.chatName ?? ''}\n🕐 ${timeStr}`;
        const plainBody = truncatedBody ? `\n\n${truncatedBody}` : '';
        broadcastToWAFn(`${plainHeader}${plainBody}`).catch((err: unknown) => {
          log('error', 'TG→WA', `שגיאה בשידור: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    } catch (err: unknown) {
      log('error', 'TG Listener', `שגיאה בלתי צפויה: ${String(err)}`);
    }
  };
}

export async function initializeTelegramListener(
  db: Database.Database,
  bot: Bot
): Promise<void> {
  // Set the callback BEFORE initialize() calls attachMessageListener(), so no message
  // can arrive between handler registration and callback assignment.
  const broadcastToWAFn: WaBroadcastFn = (text) =>
    broadcastToWhatsAppGroups(db, text, 'telegram-listener', defaultWABroadcastDeps, null);

  setMessageCallback(createMessageHandler(db, bot, broadcastToWAFn));

  await initialize(db);
}
