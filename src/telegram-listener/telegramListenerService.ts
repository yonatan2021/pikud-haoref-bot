import type { Bot } from 'grammy';
import type Database from 'better-sqlite3';
import { getActiveListenersForChat } from '../db/telegramListenerRepository.js';
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
      if (listeners.length === 0) return;

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

      for (const listener of listeners) {
        // Topic filter: if a specific source topic is configured, only forward messages from that topic
        if (listener.sourceTopicId !== null && msg.topicId !== listener.sourceTopicId) continue;

        const shouldForward =
          listener.keywords.length === 0 ||
          listener.keywords.some((kw) => msg.body.includes(kw));

        if (!shouldForward) continue;

        anyForwarded = true;
        if (listener.forwardToWhatsApp) anyWAForward = true;
        const headerLine = `📡 <b>${escapeHtml(listener.chatName)}</b>\n🕐 ${timeStr}`;
        const bodyLine = truncatedBody ? `\n\n${escapeHtml(truncatedBody)}` : '';
        const caption = `${headerLine}${bodyLine}`;
        const topicId = listener.telegramTopicId ?? getDefaultTopicId() ?? undefined;

        const sendOpts = topicId ? { message_thread_id: topicId } : {};
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

      if (anyWAForward && broadcastToWAFn) {
        const plainHeader = `📡 ${listeners[0]?.chatName ?? ''}\n🕐 ${timeStr}`;
        const plainBody = truncatedBody ? `\n\n${truncatedBody}` : '';
        broadcastToWAFn(`${plainHeader}${plainBody}`).catch((err: unknown) => {
          try {
            log('error', 'TG→WA', `שגיאה בשידור: ${String(err)}`);
          } catch {
            // prevent log failure from becoming an unhandled rejection
          }
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
  await initialize(db);

  const broadcastToWAFn: WaBroadcastFn = (text) =>
    broadcastToWhatsAppGroups(db, text, 'telegram-listener', defaultWABroadcastDeps, null);

  setMessageCallback(createMessageHandler(db, bot, broadcastToWAFn));
}
