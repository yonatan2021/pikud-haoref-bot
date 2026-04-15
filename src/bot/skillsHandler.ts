import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { getDb } from '../db/schema.js';
import {
  listSkillsForUser,
  upsertSkill,
  removeSkill,
  findUsersWithSkill,
  type UserSkillRow,
} from '../db/userSkillsRepository.js';
import { listActiveSkills, getSkillByKey } from '../db/skillCatalogRepository.js';
import { listContacts } from '../db/contactRepository.js';
import { log } from '../logger.js';
import { escapeHtml } from '../textUtils.js';

const RESULTS_PER_PAGE = 5;
const NOTE_PENDING_TTL_MS = 5 * 60_000;

interface PendingNote {
  skillKey: string;
  expiresAt: number;
}

const pendingSkillNote = new Map<number, PendingNote>();

function isPendingExpired(entry: PendingNote): boolean {
  return Date.now() > entry.expiresAt;
}

/** Exposed for testing */
export function clearPendingSkillNote(chatId: number): void {
  pendingSkillNote.delete(chatId);
}

/** Exposed for testing */
export function hasPendingSkillNote(chatId: number): boolean {
  const entry = pendingSkillNote.get(chatId);
  if (!entry) return false;
  if (isPendingExpired(entry)) {
    pendingSkillNote.delete(chatId);
    return false;
  }
  return true;
}

const VIS_LABELS: Record<UserSkillRow['visibility'], string> = {
  public:   '🌐 ציבורי',
  contacts: '👥 אנשי קשר',
  private:  '🔒 פרטי',
};

const VIS_CODES: Array<{ v: UserSkillRow['visibility']; code: number }> = [
  { v: 'public',   code: 0 },
  { v: 'contacts', code: 1 },
  { v: 'private',  code: 2 },
];

function codeToVisibility(code: number): UserSkillRow['visibility'] {
  return VIS_CODES.find((x) => x.code === code)?.v ?? 'contacts';
}

function getAcceptedContactIds(chatId: number): number[] {
  const contacts = listContacts(chatId, 'accepted');
  return contacts.map((c) =>
    c.user_id === chatId ? c.contact_id : c.user_id
  );
}

function buildSkillsListMessage(db: ReturnType<typeof getDb>, chatId: number): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const skills = listSkillsForUser(db, chatId);
  const keyboard = new InlineKeyboard();

  if (skills.length === 0) {
    const text = '🛠 <b>הכישורים שלי</b>\n\nעדיין לא הוספת כישורים.';
    keyboard.text('➕ הוסף כישור', 'sk:pick').row();
    keyboard.text('↩️ חזור', 'menu:main');
    return { text, keyboard };
  }

  const lines = ['🛠 <b>הכישורים שלי</b>', ''];
  for (const s of skills) {
    const visLabel = VIS_LABELS[s.visibility];
    const notePart = s.note ? ` — <i>${escapeHtml(s.note)}</i>` : '';
    lines.push(`• ${escapeHtml(s.skillKey)}${notePart} (${visLabel})`);
  }

  const text = lines.join('\n');

  for (const s of skills) {
    keyboard.text(`✏️ ${s.skillKey}`, `sk:vis:${s.skillKey}:1`);
    keyboard.text(`🗑 הסר`, `sk:rm:${s.skillKey}`).row();
  }
  keyboard.text('➕ הוסף עוד', 'sk:pick').row();
  keyboard.text('↩️ חזור', 'menu:main');
  return { text, keyboard };
}

function buildCatalogKeyboard(db: ReturnType<typeof getDb>, forNeed: boolean): InlineKeyboard {
  const skills = listActiveSkills(db);
  const keyboard = new InlineKeyboard();
  for (const s of skills) {
    const cbData = forNeed ? `need:${s.key}:0` : `sk:add:${s.key}`;
    keyboard.text(s.labelHe, cbData).row();
  }
  if (!forNeed) keyboard.text('↩️ חזור', 'sk:list');
  return keyboard;
}

function buildVisibilityKeyboard(skillKey: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const { v, code } of VIS_CODES) {
    keyboard.text(VIS_LABELS[v], `sk:vis:${skillKey}:${code}`);
  }
  keyboard.row();
  keyboard.text('📝 ערוך הערה', `sk:note:${skillKey}`);
  keyboard.text('🗑 הסר', `sk:rm:${skillKey}`).row();
  keyboard.text('↩️ חזור לרשימה', 'sk:list');
  return keyboard;
}

function buildNeedResultsText(
  db: ReturnType<typeof getDb>,
  skillKey: string,
  chatId: number,
  page: number
): { text: string; keyboard: InlineKeyboard } {
  const skill = getSkillByKey(db, skillKey);
  if (!skill || !skill.isActive) {
    return {
      text: '❌ כישור לא נמצא.',
      keyboard: new InlineKeyboard(),
    };
  }

  const contactIds = getAcceptedContactIds(chatId);
  const results = findUsersWithSkill(db, skillKey, chatId, contactIds, RESULTS_PER_PAGE + 1, page * RESULTS_PER_PAGE);
  const hasMore = results.length > RESULTS_PER_PAGE;
  const pageResults = results.slice(0, RESULTS_PER_PAGE);

  const lines = [`🔍 <b>מי יכול לעזור עם ${escapeHtml(skill.labelHe)}?</b>`, ''];
  if (pageResults.length === 0) {
    lines.push('לא נמצאו משתמשים.');
  } else {
    for (const r of pageResults) {
      const citySuffix = r.homeCity ? ` — ${escapeHtml(r.homeCity)}` : '';
      lines.push(`• ${escapeHtml(r.displayName)}${citySuffix}`);
    }
  }

  const keyboard = new InlineKeyboard();
  if (page > 0) keyboard.text('◀️ הקודם', `need:${skillKey}:${page - 1}`);
  if (hasMore) keyboard.text('הבא ▶️', `need:${skillKey}:${page + 1}`);
  if (page > 0 || hasMore) keyboard.row();

  return { text: lines.join('\n'), keyboard };
}

export function registerSkillsHandler(bot: Bot): void {
  // /need [skill] command
  bot.command('need', async (ctx: Context) => {
    if (ctx.chat?.type !== 'private') return;
    const chatId = ctx.chat.id;
    const db = getDb();
    const matchVal = ctx.match;
    const arg = (typeof matchVal === 'string' ? matchVal : '').trim();

    try {
      if (!arg) {
        const keyboard = buildCatalogKeyboard(db, true);
        await ctx.reply(
          '🔍 <b>עזרה בשעת חירום</b>\n\nבחר את סוג הכישור שאתה מחפש:',
          { parse_mode: 'HTML', reply_markup: keyboard }
        );
        return;
      }

      // Normalize arg to key format
      const key = arg.toLowerCase().replace(/\s+/g, '_');
      const skill = getSkillByKey(db, key);
      if (!skill || !skill.isActive) {
        await ctx.reply('❌ כישור לא נמצא. נסה /need ללא ארגומנט לצפייה ברשימה.');
        return;
      }

      const { text, keyboard } = buildNeedResultsText(db, key, chatId, 0);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Skills', `/need failed for ${chatId}: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Skills', `Failed to send error reply: ${e}`)
      );
    }
  });

  // sk:list — show user's skills
  bot.callbackQuery('sk:list', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    try {
      const db = getDb();
      const { text, keyboard } = buildSkillsListMessage(db, chatId);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Skills', `sk:list failed for ${chatId}: ${err}`);
    }
  });

  // sk:pick — show catalog for adding a skill
  bot.callbackQuery('sk:pick', async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    try {
      const db = getDb();
      const keyboard = buildCatalogKeyboard(db, false);
      await ctx.editMessageText(
        '🛠 <b>בחר כישור להוספה:</b>',
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'Skills', `sk:pick failed for ${chatId}: ${err}`);
    }
  });

  // sk:add:<key> — add skill with default visibility=contacts
  bot.callbackQuery(/^sk:add:([a-z0-9_]{1,32})$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    const skillKey = ctx.match![1];
    try {
      const db = getDb();
      upsertSkill(db, chatId, skillKey, 'contacts', null);
      log('info', 'Skills', `User ${chatId} added skill ${skillKey}`);
      const keyboard = buildVisibilityKeyboard(skillKey);
      await ctx.editMessageText(
        `✅ <b>${escapeHtml(skillKey)}</b> נוסף!\n\nבחר רמת נראות:`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'Skills', `sk:add failed for ${chatId}: ${err}`);
    }
  });

  // sk:vis:<key>:<v> — update visibility
  bot.callbackQuery(/^sk:vis:([a-z0-9_]{1,32}):([012])$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    const skillKey = ctx.match![1];
    const visCode = Number(ctx.match![2]);
    const visibility = codeToVisibility(visCode);
    try {
      const db = getDb();
      const existing = listSkillsForUser(db, chatId).find((s) => s.skillKey === skillKey);
      upsertSkill(db, chatId, skillKey, visibility, existing?.note ?? null);
      log('info', 'Skills', `User ${chatId} set ${skillKey} visibility=${visibility}`);
      const keyboard = buildVisibilityKeyboard(skillKey);
      await ctx.editMessageText(
        `🛠 <b>${escapeHtml(skillKey)}</b>\n\nנראות: ${VIS_LABELS[visibility]}\n\nבחר פעולה:`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'Skills', `sk:vis failed for ${chatId}: ${err}`);
    }
  });

  // sk:rm:<key> — remove skill
  bot.callbackQuery(/^sk:rm:([a-z0-9_]{1,32})$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    const skillKey = ctx.match![1];
    try {
      const db = getDb();
      const removed = removeSkill(db, chatId, skillKey);
      if (removed) {
        log('info', 'Skills', `User ${chatId} removed skill ${skillKey}`);
      }
      const { text, keyboard } = buildSkillsListMessage(db, chatId);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Skills', `sk:rm failed for ${chatId}: ${err}`);
    }
  });

  // sk:note:<key> — prompt user to type a note
  bot.callbackQuery(/^sk:note:([a-z0-9_]{1,32})$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    const skillKey = ctx.match![1];
    try {
      pendingSkillNote.set(chatId, { skillKey, expiresAt: Date.now() + NOTE_PENDING_TTL_MS });
      await ctx.editMessageText(
        `📝 <b>הוסף הערה לכישור "${escapeHtml(skillKey)}"</b>\n\nשלח הערה קצרה (עד 100 תווים):`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('↩️ ביטול', `sk:vis:${skillKey}:1`),
        }
      );
    } catch (err) {
      log('error', 'Skills', `sk:note failed for ${chatId}: ${err}`);
    }
  });

  // need:<key>:<page> — paginated results
  bot.callbackQuery(/^need:([a-z0-9_]{1,32}):(\d+)$/, async (ctx: Context) => {
    await ctx.answerCallbackQuery().catch((e) => log('warn', 'Skills', `answerCbQ: ${e}`));
    const chatId = ctx.chat?.id;
    if (!chatId || ctx.chat?.type !== 'private') return;
    const skillKey = ctx.match![1];
    const page = Number(ctx.match![2]);
    try {
      const db = getDb();
      const { text, keyboard } = buildNeedResultsText(db, skillKey, chatId, page);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      log('error', 'Skills', `need callback failed for ${chatId}: ${err}`);
    }
  });

  // Text handler — capture note input
  bot.on('message:text', async (ctx: Context, next) => {
    if (ctx.chat?.type !== 'private') { await next(); return; }
    const chatId = ctx.chat.id;
    if (!hasPendingSkillNote(chatId)) { await next(); return; }

    const entry = pendingSkillNote.get(chatId)!;
    const text = ctx.message?.text ?? '';

    if (text.startsWith('/')) {
      pendingSkillNote.delete(chatId);
      await next();
      return;
    }

    try {
      const note = text.trim().slice(0, 100);
      const db = getDb();
      const existing = listSkillsForUser(db, chatId).find((s) => s.skillKey === entry.skillKey);
      upsertSkill(db, chatId, entry.skillKey, existing?.visibility ?? 'contacts', note || null);
      pendingSkillNote.delete(chatId);
      log('info', 'Skills', `User ${chatId} set note for skill ${entry.skillKey}`);
      const keyboard = buildVisibilityKeyboard(entry.skillKey);
      await ctx.reply(
        `✅ ההערה נשמרה עבור <b>${escapeHtml(entry.skillKey)}</b>.`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } catch (err) {
      log('error', 'Skills', `Note text handler failed for ${chatId}: ${err}`);
      await ctx.reply('אירעה שגיאה. נסה שוב מאוחר יותר.').catch((e) =>
        log('error', 'Skills', `Failed to send error reply: ${e}`)
      );
    }
  });
}
