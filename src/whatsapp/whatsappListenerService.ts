import type Database from 'better-sqlite3';
import { getActiveListenersForChannel } from '../db/whatsappListenerRepository.js';
import { log } from '../logger.js';

const MESSAGE_BODY_MAX = 3900; // leaves room for header within Telegram 4096 char limit

export type SendMessageFn = (
  chatId: string,
  text: string,
  threadId?: number
) => Promise<void>;

export function createMessageHandler(
  db: Database.Database,
  sendMessageFn: SendMessageFn
): (from: string, body: string) => void {
  return function handleIncomingMessage(from: string, body: string): void {
    const listeners = getActiveListenersForChannel(db, from);
    if (listeners.length === 0) return;

    const targetChatId =
      process.env['TELEGRAM_FORWARD_GROUP_ID'] ?? process.env['TELEGRAM_CHAT_ID']!;

    const truncatedBody =
      body.length > MESSAGE_BODY_MAX ? body.slice(0, MESSAGE_BODY_MAX) + '…' : body;

    for (const listener of listeners) {
      const shouldForward =
        listener.keywords.length === 0 ||
        listener.keywords.some((kw) => body.includes(kw));

      if (!shouldForward) continue;

      const text = `📲 *${listener.channelName}*\n\n${truncatedBody}`;

      sendMessageFn(
        targetChatId,
        text,
        listener.telegramTopicId ?? undefined
      ).catch((err: unknown) => {
        log(
          'error',
          'WhatsApp→TG',
          `שגיאה בהעברת הודעה מ-${from}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  };
}
