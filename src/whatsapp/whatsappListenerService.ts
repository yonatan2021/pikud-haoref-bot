import type Database from 'better-sqlite3';
import { getActiveListenersForChannel } from '../db/whatsappListenerRepository.js';
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

export function createMessageHandler(
  db: Database.Database,
  sendMessageFn: SendMessageFn,
  sendMediaFn?: SendMediaFn
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

      for (const listener of listeners) {
        const shouldForward =
          listener.keywords.length === 0 ||
          listener.keywords.some((kw) => msg.body.includes(kw));

        if (!shouldForward) continue;

        const headerLine = `📲 <b>${escapeHtml(listener.channelName)}</b>\n🕐 ${timeStr}`;
        const bodyLine = truncatedBody ? `\n\n${escapeHtml(truncatedBody)}` : '';
        const caption = `${headerLine}${bodyLine}`;
        const topicId = listener.telegramTopicId ?? getWhatsAppDefaultTopicId() ?? undefined;

        // Attempt media forward first
        if (msg.hasMedia && sendMediaFn) {
          try {
            const media = await msg.downloadMedia();
            if (media?.data) {
              const buffer = Buffer.from(media.data, 'base64');
              const mediaCaption = truncateToCaptionLimit(caption);
              await sendMediaFn(targetChatId, buffer, media.mimetype, mediaCaption, topicId);
              continue;
            }
          } catch (mediaErr) {
            log(
              'warn',
              'WhatsApp→TG',
              `מדיה נכשלה — שולח טקסט: ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)}`
            );
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
    })().catch((err: unknown) => {
      log('error', 'WhatsApp→TG', `שגיאה בלתי צפויה: ${String(err)}`);
    });
  };
}
