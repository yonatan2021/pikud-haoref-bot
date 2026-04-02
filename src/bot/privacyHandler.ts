import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { upsertUser } from '../db/userRepository.js';
import {
  getContactById,
  getPermissions,
  updatePermissions,
  type ContactPermissions,
} from '../db/contactRepository.js';
import { getSetting, setSetting } from '../dashboard/settingsRepository.js';
import { getDb } from '../db/schema.js';
import { log } from '../logger.js';

const PRIVACY_FIELDS: Array<{ key: keyof ContactPermissions; label: string; emoji: string }> = [
  { key: 'safety_status', label: 'סטטוס ביטחון', emoji: '🛡️' },
  { key: 'home_city', label: 'עיר מגורים', emoji: '🏠' },
  { key: 'update_time', label: 'זמן עדכון', emoji: '🕐' },
];

const DEFAULT_PRIVACY: ContactPermissions = {
  safety_status: true,
  home_city: false,
  update_time: true,
};

export function getPrivacyDefaults(): ContactPermissions {
  const raw = getSetting(getDb(), 'privacy_defaults');
  if (!raw) return { ...DEFAULT_PRIVACY };
  try {
    const parsed = JSON.parse(raw) as Partial<ContactPermissions>;
    return {
      safety_status: parsed.safety_status ?? DEFAULT_PRIVACY.safety_status,
      home_city: parsed.home_city ?? DEFAULT_PRIVACY.home_city,
      update_time: parsed.update_time ?? DEFAULT_PRIVACY.update_time,
    };
  } catch {
    return { ...DEFAULT_PRIVACY };
  }
}

function setPrivacyDefaults(defaults: ContactPermissions): void {
  setSetting(getDb(), 'privacy_defaults', JSON.stringify(defaults));
}

function buildDefaultsMessage(defaults: ContactPermissions): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const lines = ['🔒 <b>הגדרות פרטיות — ברירת מחדל</b>', ''];
  for (const field of PRIVACY_FIELDS) {
    const value = defaults[field.key];
    const status = value ? '✅' : '❌';
    lines.push(`${field.emoji} ${field.label}: ${status}`);
  }
  lines.push('', 'לחץ לשינוי. ברירת המחדל תחול על חיבורים חדשים.');

  const keyboard = new InlineKeyboard();
  for (const field of PRIVACY_FIELDS) {
    const value = defaults[field.key];
    keyboard
      .text(`${value ? '✅' : '❌'} ${field.label}`, `pv:toggle:${field.key}`)
      .row();
  }
  keyboard.text('↩️ חזור', 'menu:main');

  return { text: lines.join('\n'), keyboard };
}

function buildContactPermissionsMessage(
  contactId: number,
  perms: ContactPermissions
): { text: string; keyboard: InlineKeyboard } {
  const lines = ['🔒 <b>הרשאות לאיש קשר</b>', ''];
  for (const field of PRIVACY_FIELDS) {
    const value = perms[field.key];
    const status = value ? '✅' : '❌';
    lines.push(`${field.emoji} ${field.label}: ${status}`);
  }

  const keyboard = new InlineKeyboard();
  for (const field of PRIVACY_FIELDS) {
    const value = perms[field.key];
    keyboard
      .text(`${value ? '✅' : '❌'} ${field.label}`, `cp:toggle:${contactId}:${field.key}`)
      .row();
  }
  keyboard.text('↩️ חזור', 'cx:page:0');

  return { text: lines.join('\n'), keyboard };
}

export function registerPrivacyHandler(bot: Bot): void {
  // /privacy — show default privacy settings
  bot.command('privacy', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    upsertUser(ctx.chat.id);
    const defaults = getPrivacyDefaults();
    const { text, keyboard } = buildDefaultsMessage(defaults);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Toggle default privacy field
  bot.callbackQuery(/^pv:toggle:(\w+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const field = ctx.match![1] as keyof ContactPermissions;
    if (!PRIVACY_FIELDS.some(f => f.key === field)) return;

    const defaults = getPrivacyDefaults();
    const updated: ContactPermissions = { ...defaults, [field]: !defaults[field] };
    setPrivacyDefaults(updated);
    log('info', 'Privacy', `User ${ctx.chat?.id} toggled default ${field} → ${updated[field]}`);

    const { text, keyboard } = buildDefaultsMessage(updated);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Per-contact permission view (from contacts list)
  bot.callbackQuery(/^cx:perm:(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const contactId = parseInt(ctx.match![1]);
    const contact = getContactById(contactId);
    if (!contact) return;

    const chatId = ctx.chat?.id;
    if (chatId !== contact.user_id && chatId !== contact.contact_id) return;

    const perms = getPermissions(contactId);
    if (!perms) return;

    const { text, keyboard } = buildContactPermissionsMessage(contactId, perms);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Toggle per-contact permission
  bot.callbackQuery(/^cp:toggle:(\d+):(\w+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    const contactId = parseInt(ctx.match![1]);
    const field = ctx.match![2] as keyof ContactPermissions;
    if (!PRIVACY_FIELDS.some(f => f.key === field)) return;

    const contact = getContactById(contactId);
    if (!contact) return;

    const chatId = ctx.chat?.id;
    if (chatId !== contact.user_id && chatId !== contact.contact_id) return;

    const perms = getPermissions(contactId);
    if (!perms) return;

    const updated: Partial<ContactPermissions> = { [field]: !perms[field] };
    updatePermissions(contactId, updated);
    log('info', 'Privacy', `User ${chatId} toggled contact ${contactId} ${field} → ${!perms[field]}`);

    const newPerms = getPermissions(contactId);
    if (!newPerms) return;

    const { text, keyboard } = buildContactPermissionsMessage(contactId, newPerms);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
}
