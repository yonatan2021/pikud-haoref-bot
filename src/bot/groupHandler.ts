import crypto from 'crypto';
import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { upsertUser } from '../db/userRepository.js';
import {
  createGroup,
  findGroupByInviteCode,
  findGroupById,
  getGroupsForUser,
  getMembersOfGroup,
  addMember,
  removeMember,
  deleteGroup,
  countGroupsOwnedBy,
  countMembersOfGroup,
} from '../db/groupRepository.js';
import { getDb } from '../db/schema.js';
import { log } from '../logger.js';
import { escapeHtml } from '../textUtils.js';

// ─── Constants (fallbacks until Task 4 #225 wires configResolver) ────────────

/** Max groups a single user may own. Task 4 will replace with hot-config. */
export const MAX_GROUPS_PER_USER_FALLBACK = 5;
/** Max members per group, including owner. Task 4 will replace with hot-config. */
export const MAX_MEMBERS_PER_GROUP_FALLBACK = 20;

const JOIN_COOLDOWN_MS = 5_000;
const MAX_JOIN_FAILURES = 5;
const JOIN_FAILURE_BLOCK_MS = 60_000;
const MAX_GROUP_NAME_LENGTH = 50;
const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_CODE_RETRIES = 5;

// Unambiguous alphabet — no 0/O/I/1 to avoid copy-paste confusion
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ─── Anti-spam state (mirror of connectHandler) ──────────────────────────────

/** chatId → cooldown expiry timestamp. Exposed for test reset. */
export const joinCooldownMap = new Map<number, number>();
/** chatId → { count, blockedUntil }. Exposed for test reset. */
export const joinFailures = new Map<number, { count: number; blockedUntil: number }>();

function isJoinOnCooldown(chatId: number): boolean {
  const expiry = joinCooldownMap.get(chatId);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) {
    joinCooldownMap.delete(chatId);
    return false;
  }
  return true;
}

function setJoinCooldown(chatId: number): void {
  joinCooldownMap.set(chatId, Date.now() + JOIN_COOLDOWN_MS);
}

function isJoinBlocked(chatId: number): boolean {
  const entry = joinFailures.get(chatId);
  if (!entry) return false;
  if (Date.now() >= entry.blockedUntil) {
    joinFailures.delete(chatId);
    return false;
  }
  return entry.count >= MAX_JOIN_FAILURES;
}

function recordJoinFailure(chatId: number): void {
  const entry = joinFailures.get(chatId);
  const count = (entry?.count ?? 0) + 1;
  joinFailures.set(chatId, {
    count,
    blockedUntil:
      count >= MAX_JOIN_FAILURES
        ? Date.now() + JOIN_FAILURE_BLOCK_MS
        : entry?.blockedUntil ?? 0,
  });
}

function clearJoinFailures(chatId: number): void {
  joinFailures.delete(chatId);
}

// ─── Callback data byte-length guard ─────────────────────────────────────────

/**
 * Runtime guard — Telegram silently rejects callback_data > 64 bytes UTF-8
 * with a vague "BUTTON_DATA_INVALID" error. Throw early at button construction
 * time so any developer mistake (e.g. accidentally embedding a Hebrew name)
 * fails loud in tests instead of silent in production.
 */
export function cb(data: string): string {
  const bytes = Buffer.byteLength(data, 'utf8');
  if (bytes > 64) {
    throw new Error(`callback_data too long (${bytes} bytes): ${data}`);
  }
  return data;
}

// ─── Invite code generator ───────────────────────────────────────────────────

function generateInviteCode(db: ReturnType<typeof getDb>): string {
  for (let i = 0; i < MAX_INVITE_CODE_RETRIES; i++) {
    let code = '';
    for (let j = 0; j < INVITE_CODE_LENGTH; j++) {
      code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
    if (!findGroupByInviteCode(db, code)) return code;
  }
  log('error', 'Groups', `Invite code generation exhausted ${MAX_INVITE_CODE_RETRIES} retries`);
  throw new Error('Failed to generate unique invite code after retries');
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleList(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const db = getDb();
  const groups = getGroupsForUser(db, chatId);

  if (groups.length === 0) {
    await ctx.reply(
      '👥 <b>הקבוצות שלי</b>\n\nאינך חבר באף קבוצה.\nליצירה: <code>/group create &lt;שם&gt;</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const lines = ['👥 <b>הקבוצות שלי</b>', ''];
  const kb = new InlineKeyboard();
  for (const g of groups) {
    const memberCount = countMembersOfGroup(db, g.id);
    lines.push(`• <b>${escapeHtml(g.name)}</b> — ${memberCount} חברים`);
    kb.text(`📋 ${g.name}`, cb(`g:c:${g.id}`)).row();
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function handleCreate(ctx: Context, name: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    await ctx.reply(
      '❌ חסר שם לקבוצה.\nשימוש: <code>/group create &lt;שם&gt;</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    await ctx.reply(`❌ השם ארוך מדי (מקסימום ${MAX_GROUP_NAME_LENGTH} תווים).`);
    return;
  }

  const db = getDb();
  if (countGroupsOwnedBy(db, chatId) >= MAX_GROUPS_PER_USER_FALLBACK) {
    await ctx.reply(
      `❌ הגעת לגבול: ניתן ליצור עד ${MAX_GROUPS_PER_USER_FALLBACK} קבוצות.\nמחק קבוצה קיימת לפני יצירת חדשה.`
    );
    return;
  }

  let inviteCode: string;
  try {
    inviteCode = generateInviteCode(db);
  } catch (err) {
    log('error', 'Groups', `generateInviteCode failed for ${chatId}: ${String(err)}`);
    await ctx.reply('❌ שגיאת שרת ביצירת קוד הזמנה. נסה שוב.');
    return;
  }

  let group;
  try {
    group = createGroup(db, { name: trimmed, ownerId: chatId, inviteCode });
  } catch (err) {
    log('error', 'Groups', `createGroup failed for ${chatId}: ${String(err)}`);
    await ctx.reply('❌ שגיאת שרת ביצירת הקבוצה. נסה שוב.');
    return;
  }

  log('info', 'Groups', `User ${chatId} created group ${group.id} (${trimmed})`);

  const kb = new InlineKeyboard().text('📋 כרטיס הקבוצה', cb(`g:c:${group.id}`));
  await ctx.reply(
    `✅ <b>קבוצה נוצרה: ${escapeHtml(trimmed)}</b>\n\n` +
      `קוד הזמנה: <code>${inviteCode}</code>\n\n` +
      `שתפו את הקוד עם בני המשפחה / חברים — הם יוכלו להצטרף עם:\n` +
      `<code>/group join ${inviteCode}</code>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function handleJoin(ctx: Context, codeArg: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (isJoinBlocked(chatId)) {
    await ctx.reply('⏳ יותר מדי ניסיונות שגויים. נסה שוב בעוד דקה.');
    return;
  }
  if (isJoinOnCooldown(chatId)) {
    await ctx.reply('⏳ נסה שוב בעוד כמה שניות.');
    return;
  }
  setJoinCooldown(chatId);

  const code = codeArg.trim().toUpperCase();
  if (code.length === 0) {
    await ctx.reply(
      '❌ חסר קוד הזמנה.\nשימוש: <code>/group join &lt;קוד&gt;</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const db = getDb();
  const group = findGroupByInviteCode(db, code);
  if (!group) {
    recordJoinFailure(chatId);
    await ctx.reply('❌ קוד לא תקין. בדקו שהעתקתם נכון.');
    return;
  }

  // Already a member?
  const members = getMembersOfGroup(db, group.id);
  if (members.some((m) => m.userId === chatId)) {
    clearJoinFailures(chatId);
    await ctx.reply(`ℹ️ אתה כבר חבר בקבוצה <b>${escapeHtml(group.name)}</b>.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  if (members.length >= MAX_MEMBERS_PER_GROUP_FALLBACK) {
    await ctx.reply(
      `❌ הקבוצה מלאה (מקסימום ${MAX_MEMBERS_PER_GROUP_FALLBACK} חברים).`
    );
    return;
  }

  try {
    addMember(db, group.id, chatId);
  } catch (err) {
    log('error', 'Groups', `addMember failed for ${chatId} → ${group.id}: ${String(err)}`);
    await ctx.reply('❌ שגיאת שרת בהצטרפות. נסה שוב.');
    return;
  }

  clearJoinFailures(chatId);
  log('info', 'Groups', `User ${chatId} joined group ${group.id} (${group.name})`);

  await ctx.reply(`✅ הצטרפת לקבוצה <b>${escapeHtml(group.name)}</b>!`, {
    parse_mode: 'HTML',
  });
}

async function handleLeave(ctx: Context, groupIdArg: string | undefined): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const db = getDb();

  if (!groupIdArg) {
    // No id — show picker
    const groups = getGroupsForUser(db, chatId);
    if (groups.length === 0) {
      await ctx.reply('אינך חבר באף קבוצה.');
      return;
    }
    const kb = new InlineKeyboard();
    for (const g of groups) kb.text(`❌ ${g.name}`, cb(`g:leaveY:${g.id}`)).row();
    await ctx.reply('בחר קבוצה לעזיבה:', { reply_markup: kb });
    return;
  }

  const groupId = Number(groupIdArg);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    await ctx.reply('❌ מזהה קבוצה לא תקין.');
    return;
  }

  const group = findGroupById(db, groupId);
  if (!group) {
    await ctx.reply('❌ הקבוצה לא נמצאה.');
    return;
  }
  const members = getMembersOfGroup(db, groupId);
  if (!members.some((m) => m.userId === chatId)) {
    await ctx.reply('❌ אינך חבר בקבוצה זו.');
    return;
  }

  await performLeave(ctx, groupId, chatId);
}

async function performLeave(
  ctx: Context,
  groupId: number,
  chatId: number
): Promise<void> {
  const db = getDb();
  const group = findGroupById(db, groupId);
  if (!group) {
    await ctx.reply('❌ הקבוצה לא נמצאה.');
    return;
  }

  const isOwner = group.ownerId === chatId;
  const memberCount = countMembersOfGroup(db, groupId);

  if (isOwner && memberCount > 1) {
    await ctx.reply(
      '❌ אינך יכול לעזוב — אתה הבעלים. העבר בעלות או מחק את הקבוצה.\n' +
        '<i>(מחיקת קבוצות תיתמך בגרסה הבאה)</i>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (isOwner && memberCount === 1) {
    // Last member + owner: delete the whole group (CASCADE removes membership)
    deleteGroup(db, groupId);
    log('info', 'Groups', `Group ${groupId} (${group.name}) deleted by owner ${chatId} (last member)`);
    await ctx.reply(`🗑 הקבוצה <b>${escapeHtml(group.name)}</b> נמחקה.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  // Regular member leaving
  removeMember(db, groupId, chatId);
  log('info', 'Groups', `User ${chatId} left group ${groupId} (${group.name})`);
  await ctx.reply(`✅ עזבת את הקבוצה <b>${escapeHtml(group.name)}</b>.`, {
    parse_mode: 'HTML',
  });
}

// ─── Main dispatch ───────────────────────────────────────────────────────────

async function handleGroupCommand(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const chatId = ctx.chat.id;

  try {
    upsertUser(chatId);
  } catch (err) {
    log('error', 'Groups', `Failed to upsert user ${chatId}: ${String(err)}`);
    await ctx.reply('❌ שגיאת שרת — נסה שוב.');
    return;
  }

  const args = (ctx.message?.text ?? '').split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();
  const rest = args.slice(1).join(' ');

  switch (sub) {
    case undefined:
    case 'list':
      await handleList(ctx);
      return;
    case 'create':
      await handleCreate(ctx, rest);
      return;
    case 'join':
      await handleJoin(ctx, rest);
      return;
    case 'leave':
      await handleLeave(ctx, args[1]);
      return;
    default:
      await ctx.reply(
        '❌ פקודה לא מוכרת.\n\n' +
          'שימוש:\n' +
          '<code>/group</code> — רשימת הקבוצות שלי\n' +
          '<code>/group create &lt;שם&gt;</code> — יצירת קבוצה\n' +
          '<code>/group join &lt;קוד&gt;</code> — הצטרפות עם קוד\n' +
          '<code>/group leave [id]</code> — עזיבת קבוצה',
        { parse_mode: 'HTML' }
      );
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerGroupHandler(bot: Bot): void {
  bot.command('group', async (ctx) => {
    try {
      await handleGroupCommand(ctx);
    } catch (err) {
      log('error', 'Groups', `handler error: ${String(err)}`);
      await ctx.reply('⚠️ שגיאה בטיפול בקבוצה').catch(() => undefined);
    }
  });

  // g:c:<id> — show group card
  bot.callbackQuery(/^g:c:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const raw = ctx.match?.[1];
    if (!raw) return;
    const groupId = parseInt(raw, 10);
    if (isNaN(groupId)) return;

    const db = getDb();
    const group = findGroupById(db, groupId);
    if (!group) {
      await ctx.editMessageText('❌ הקבוצה לא נמצאה.').catch(() => undefined);
      return;
    }
    const members = getMembersOfGroup(db, groupId);
    if (!members.some((m) => m.userId === chatId)) {
      await ctx.editMessageText('❌ אינך חבר בקבוצה זו.').catch(() => undefined);
      return;
    }

    const isOwner = group.ownerId === chatId;
    const lines = [
      `📋 <b>${escapeHtml(group.name)}</b>`,
      '',
      `חברים: ${members.length}`,
      `נוצרה: ${group.createdAt.split(' ')[0] ?? group.createdAt}`,
    ];
    if (isOwner) {
      lines.push('', `קוד הזמנה: <code>${group.inviteCode}</code>`);
    }

    const kb = new InlineKeyboard().text('🚪 עזיבה', cb(`g:leaveY:${groupId}`));
    await ctx
      .editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb })
      .catch((err) => {
        log('warn', 'Groups', `editMessageText (g:c) failed: ${String(err)}`);
      });
  });

  // g:leaveY:<id> — confirm leave
  bot.callbackQuery(/^g:leaveY:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const raw = ctx.match?.[1];
    if (!raw) return;
    const groupId = parseInt(raw, 10);
    if (isNaN(groupId)) return;

    const db = getDb();
    const group = findGroupById(db, groupId);
    if (!group) return;
    const members = getMembersOfGroup(db, groupId);
    if (!members.some((m) => m.userId === chatId)) return;

    await performLeave(ctx, groupId, chatId);
  });
}
