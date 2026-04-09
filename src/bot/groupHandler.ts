import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { upsertUser, getUser } from '../db/userRepository.js';
import type { User } from '../db/userRepository.js';
import {
  createGroup,
  findGroupByInviteCode,
  findGroupById,
  getGroupsForUser,
  getMembersOfGroup,
  getMemberStatusesForGroup,
  addMember,
  removeMember,
  deleteGroup,
  countGroupsOwnedBy,
  countMembersOfGroup,
  InviteCodeCollisionError,
  type Group,
} from '../db/groupRepository.js';
import { getDb } from '../db/schema.js';
import { log } from '../logger.js';
import { escapeHtml, formatRelativeTime } from '../textUtils.js';

// ─── Constants (fallbacks until Task 4 #225 wires configResolver) ────────────

/** Max groups a single user may own. Task 4 will replace with hot-config. */
export const MAX_GROUPS_PER_USER_FALLBACK = 5;
/** Max members per group, including owner. Task 4 will replace with hot-config. */
export const MAX_MEMBERS_PER_GROUP_FALLBACK = 20;

const JOIN_COOLDOWN_MS = 5_000;
const MAX_JOIN_FAILURES = 5;
const JOIN_FAILURE_BLOCK_MS = 60_000;
/** Human-readable form of JOIN_FAILURE_BLOCK_MS for error messages. */
const JOIN_FAILURE_BLOCK_LABEL_HE = 'דקה';
const MAX_GROUP_NAME_LENGTH = 50;
const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_CODE_RETRIES = 5;
/** Number of times handleCreate will retry the full generate+insert cycle on UNIQUE collision race. */
const MAX_CREATE_GROUP_COLLISION_RETRIES = 3;

// ─── Error formatting ────────────────────────────────────────────────────────

/** Preserve stack trace when available — String(err) drops it. */
function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

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

/**
 * Outcome of a group-creation attempt with collision retry. Distinguishes
 * three branches that the handler must surface differently to the user:
 * - 'ok': group created, inviteCode is the final code that was inserted
 * - 'codegen-failed': generateInviteCode threw (e.g. internal exhaustion);
 *   the generic 'שגיאת שרת ביצירת קוד' message is shown
 * - 'collision-exhausted': the generate+insert cycle hit InviteCodeCollisionError
 *   on every attempt; the more specific exhaustion message is shown
 * - 'createGroup-failed': createGroup threw a non-collision error (FK / lock /
 *   disk); the generic 'שגיאת שרת ביצירת הקבוצה' message is shown
 */
type CreateGroupOutcome =
  | { kind: 'ok'; group: Group; inviteCode: string }
  | { kind: 'codegen-failed'; cause: unknown }
  | { kind: 'collision-exhausted' }
  | { kind: 'createGroup-failed'; cause: unknown };

/**
 * Dependencies for createGroupWithCollisionRetry — the seam that lets tests
 * exercise the exhaustion branch directly without depending on real
 * crypto.randomInt or actually inserting colliding rows.
 */
export interface CreateGroupRetryDeps {
  generateInviteCodeFn?: (db: Database.Database) => string;
  createGroupFn?: (db: Database.Database, input: { name: string; ownerId: number; inviteCode: string }) => Group;
  maxRetries?: number;
}

/**
 * Generates an invite code and inserts the group. On UNIQUE collision the
 * cycle retries up to maxRetries times with a fresh code each time. The
 * loop is extracted from handleCreate so that:
 * (1) the exhaustion branch is unit-testable in isolation via injected deps
 * (2) the return type is a discriminated union — handleCreate no longer
 *     needs the `if (!group || !inviteCode)` dual-undefined guard
 *
 * Exported only for testing — handleCreate is the only production caller.
 */
export function createGroupWithCollisionRetry(
  db: Database.Database,
  input: { name: string; ownerId: number },
  deps: CreateGroupRetryDeps = {},
): CreateGroupOutcome {
  const generateFn = deps.generateInviteCodeFn ?? generateInviteCode;
  const createFn = deps.createGroupFn ?? createGroup;
  const maxRetries = deps.maxRetries ?? MAX_CREATE_GROUP_COLLISION_RETRIES;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let inviteCode: string;
    try {
      inviteCode = generateFn(db);
    } catch (err) {
      log('error', 'Groups', `generateInviteCode failed for ${input.ownerId}: ${formatError(err)}`);
      return { kind: 'codegen-failed', cause: err };
    }

    try {
      const group = createFn(db, { name: input.name, ownerId: input.ownerId, inviteCode });
      return { kind: 'ok', group, inviteCode };
    } catch (err) {
      if (err instanceof InviteCodeCollisionError) {
        log('warn', 'Groups', `Invite code collision for ${input.ownerId} on attempt ${attempt + 1}: ${inviteCode} — retrying`);
        continue;
      }
      log('error', 'Groups', `createGroup failed for ${input.ownerId}: ${formatError(err)}`);
      return { kind: 'createGroup-failed', cause: err };
    }
  }

  log('error', 'Groups', `createGroup exhausted ${maxRetries} collision retries for ${input.ownerId}`);
  return { kind: 'collision-exhausted' };
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

  const outcome = createGroupWithCollisionRetry(db, { name: trimmed, ownerId: chatId });

  switch (outcome.kind) {
    case 'codegen-failed':
      await ctx.reply('❌ שגיאת שרת ביצירת קוד הזמנה. נסה שוב.');
      return;
    case 'createGroup-failed':
      await ctx.reply('❌ שגיאת שרת ביצירת הקבוצה. נסה שוב.');
      return;
    case 'collision-exhausted':
      await ctx.reply('❌ שגיאת שרת — לא הצלחנו ליצור קוד הזמנה ייחודי. נסה שוב.');
      return;
    case 'ok': {
      const { group, inviteCode } = outcome;
      log('info', 'Groups', `User ${chatId} created group ${group.id} (${trimmed})`);

      const kb = new InlineKeyboard().text('📋 כרטיס הקבוצה', cb(`g:c:${group.id}`));
      await ctx.reply(
        `✅ <b>קבוצה נוצרה: ${escapeHtml(trimmed)}</b>\n\n` +
          `קוד הזמנה: <code>${inviteCode}</code>\n\n` +
          `שתפו את הקוד עם בני המשפחה / חברים — הם יוכלו להצטרף עם:\n` +
          `<code>/group join ${inviteCode}</code>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }
  }
}

async function handleJoin(ctx: Context, codeArg: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // Validate format BEFORE consuming cooldown — avoid penalizing users who
  // typo `/group join` with no args. Mirrors connectHandler.ts:268-282 ordering.
  const code = codeArg.trim().toUpperCase();
  if (code.length === 0) {
    await ctx.reply(
      '❌ חסר קוד הזמנה.\nשימוש: <code>/group join &lt;קוד&gt;</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (isJoinBlocked(chatId)) {
    await ctx.reply(`⏳ יותר מדי ניסיונות שגויים. נסה שוב בעוד ${JOIN_FAILURE_BLOCK_LABEL_HE}.`);
    return;
  }
  if (isJoinOnCooldown(chatId)) {
    await ctx.reply('⏳ נסה שוב בעוד כמה שניות.');
    return;
  }
  setJoinCooldown(chatId);

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
    log('error', 'Groups', `addMember failed for ${chatId} → ${group.id}: ${formatError(err)}`);
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

// ─── /group status — group-wide safety status aggregation ───────────────────

/**
 * Subset of `User` fields needed by the group status renderer. Tests inject
 * a stub function returning this shape so they can drive renderGroupStatus
 * with a `:memory:` DB that the production `getUser()` (singleton-backed)
 * cannot see. Pattern: `pattern_getuser_singleton_vs_di.md` in memory.
 */
type GroupStatusUserLookup = (chatId: number) => Pick<User, 'display_name' | 'home_city'> | undefined;

async function handleStatus(ctx: Context, groupIdArg: string | undefined): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const db = getDb();

  // Resolve target group: explicit id, single group auto-pick, or picker
  let groupId: number;
  if (groupIdArg) {
    const parsed = Number(groupIdArg);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      await ctx.reply('❌ מזהה קבוצה לא תקין.');
      return;
    }
    groupId = parsed;
  } else {
    const groups = getGroupsForUser(db, chatId);
    if (groups.length === 0) {
      await ctx.reply('אינך חבר באף קבוצה.');
      return;
    }
    if (groups.length === 1) {
      const onlyGroup = groups[0];
      if (!onlyGroup) return;
      groupId = onlyGroup.id;
    } else {
      // Multi-group picker — show inline keyboard with one button per group
      const kb = new InlineKeyboard();
      for (const g of groups) {
        kb.text(`👥 ${g.name}`, cb(`g:s:${g.id}`)).row();
      }
      await ctx.reply('בחר קבוצה לצפייה בסטטוס:', { reply_markup: kb });
      return;
    }
  }

  // Membership check (auth invariant) — only members can view a group's status
  const members = getMembersOfGroup(db, groupId);
  if (!members.some((m) => m.userId === chatId)) {
    await ctx.reply('❌ אינך חבר בקבוצה זו.');
    return;
  }

  await renderGroupStatus(ctx, db, groupId);
}

/**
 * Renders the group status card. Used by both `/group status` (initial reply)
 * and the `g:s:<id>` / `g:refresh:<id>` callbacks (in-place edit).
 *
 * Exported so tests can drive it directly with an injected `lookupUser` that
 * reads from the test's `:memory:` DB instead of the `getDb()` singleton that
 * `getUser()` reads from internally.
 */
export async function renderGroupStatus(
  ctx: Context,
  db: Database.Database,
  groupId: number,
  lookupUser: GroupStatusUserLookup = getUser,
): Promise<void> {
  const group = findGroupById(db, groupId);
  if (!group) {
    const message = '❌ הקבוצה לא נמצאה.';
    if (ctx.callbackQuery) {
      await ctx
        .editMessageText(message)
        .catch((e) => log('warn', 'Groups', `editMessageText (status not-found) failed: ${formatError(e)}`));
    } else {
      await ctx.reply(message);
    }
    return;
  }

  const statuses = getMemberStatusesForGroup(db, groupId);

  let okCount = 0;
  const lines: string[] = [`👥 <b>${escapeHtml(group.name)}</b>`, ''];
  for (const { userId, status } of statuses) {
    const user = lookupUser(userId);
    const displayName = escapeHtml(user?.display_name ?? `משתמש #${userId}`);
    const homeCity = user?.home_city ? ` · ${escapeHtml(user.home_city)}` : '';

    let emoji = '❓';
    let label = 'לא דיווח';
    if (status?.status === 'ok') {
      emoji = '✅';
      label = 'בסדר';
      okCount++;
    } else if (status?.status === 'help') {
      emoji = '⚠️';
      label = 'צריך עזרה';
    } else if (status?.status === 'dismissed') {
      emoji = '🔇';
      label = 'התעלם';
    }

    const when = status ? ` · ${formatRelativeTime(status.updated_at)}` : '';
    lines.push(`${emoji} <b>${displayName}</b> · ${label}${homeCity}${when}`);
  }
  lines.push('', `<b>${okCount}/${statuses.length} בסדר</b>`);
  // Hint: there's no "safety:menu" callback — use the slash command instead.
  // Verified during planning against safetyStatusHandler.ts (only safety:back,
  // safety:contacts, safety:ok:N, safety:help:N, safety:dismiss:N exist).
  lines.push('', '<i>לעדכון הסטטוס שלך: /status</i>');

  const kb = new InlineKeyboard().text('🔄 רענן', cb(`g:refresh:${groupId}`));
  const text = lines.join('\n');

  if (ctx.callbackQuery) {
    await ctx
      .editMessageText(text, { parse_mode: 'HTML', reply_markup: kb })
      .catch((e) => log('warn', 'Groups', `editMessageText (status render) failed: ${formatError(e)}`));
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
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
    // Tracked: github.com/yonatan2021/pikud-haoref-bot/issues/231 (escape
    // hatch for orphan groups — transfer / delete / force-delete in v0.5.2).
    await ctx.reply(
      '❌ אינך יכול לעזוב — אתה הבעלים, ויש חברים נוספים בקבוצה.\n\n' +
        '<i>העברת בעלות ומחיקת קבוצות יתמכו ב-v0.5.2.\n' +
        'בינתיים: בקש מהחברים לעזוב, ואז תוכל לעזוב גם אתה.</i>',
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
  if (ctx.chat?.type !== 'private') {
    // Reply rather than silent no-op so users in groups understand why
    // /group did nothing. Mirrors safetyStatusHandler / connectHandler.
    await ctx
      .reply('ℹ️ הפקודה /group זמינה רק בשיחה פרטית עם הבוט.')
      .catch((err) => log('warn', 'Groups', `non-private reply failed: ${formatError(err)}`));
    return;
  }
  const chatId = ctx.chat.id;

  try {
    upsertUser(chatId);
  } catch (err) {
    log('error', 'Groups', `Failed to upsert user ${chatId}: ${formatError(err)}`);
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
    case 'status':
      await handleStatus(ctx, args[1]);
      return;
    default:
      await ctx.reply(
        '❌ פקודה לא מוכרת.\n\n' +
          'שימוש:\n' +
          '<code>/group</code> — רשימת הקבוצות שלי\n' +
          '<code>/group create &lt;שם&gt;</code> — יצירת קבוצה\n' +
          '<code>/group join &lt;קוד&gt;</code> — הצטרפות עם קוד\n' +
          '<code>/group leave [id]</code> — עזיבת קבוצה\n' +
          '<code>/group status [id]</code> — סטטוס קבוצתי',
        { parse_mode: 'HTML' }
      );
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Wraps a callback handler body with: (1) outer try/catch logging via the
 * project logger (NOT stderr — Grammy's default handler bypasses src/logger.ts),
 * (2) a user-facing answerCallbackQuery alert so users see something instead
 * of a stuck spinner. Without this wrapper, any DB throw inside the body
 * becomes an unhandled rejection.
 */
function wrapCallback(
  tag: string,
  body: (ctx: Context) => Promise<void>
): (ctx: Context) => Promise<void> {
  return async (ctx: Context): Promise<void> => {
    try {
      await body(ctx);
    } catch (err) {
      log('error', 'Groups', `${tag} callback error: ${formatError(err)}`);
      await ctx
        .answerCallbackQuery({ text: '⚠️ שגיאה — נסה שוב', show_alert: false })
        .catch((e) => log('warn', 'Groups', `answerCallbackQuery (error path) failed: ${formatError(e)}`));
    }
  };
}

export function registerGroupHandler(bot: Bot): void {
  bot.command('group', async (ctx) => {
    try {
      await handleGroupCommand(ctx);
    } catch (err) {
      log('error', 'Groups', `handler error: ${formatError(err)}`);
      await ctx
        .reply('⚠️ שגיאה בטיפול בקבוצה')
        .catch((e) => log('warn', 'Groups', `error-reply failed: ${formatError(e)}`));
    }
  });

  // g:c:<id> — show group card
  bot.callbackQuery(
    /^g:c:(\d+)$/,
    wrapCallback('g:c', async (ctx) => {
      await ctx
        .answerCallbackQuery()
        .catch((e) => log('warn', 'Groups', `answerCallbackQuery (g:c) failed: ${formatError(e)}`));
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const raw = ctx.match?.[1];
      if (!raw) return;
      const groupId = parseInt(raw, 10);
      if (isNaN(groupId)) return;

      const db = getDb();
      const group = findGroupById(db, groupId);
      if (!group) {
        await ctx
          .editMessageText('❌ הקבוצה לא נמצאה.')
          .catch((e) => log('warn', 'Groups', `editMessageText (g:c not-found) failed: ${formatError(e)}`));
        return;
      }
      const members = getMembersOfGroup(db, groupId);
      if (!members.some((m) => m.userId === chatId)) {
        await ctx
          .editMessageText('❌ אינך חבר בקבוצה זו.')
          .catch((e) => log('warn', 'Groups', `editMessageText (g:c non-member) failed: ${formatError(e)}`));
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
          log('warn', 'Groups', `editMessageText (g:c) failed: ${formatError(err)}`);
        });
    }),
  );

  // g:s:<id> — render group status (from multi-group picker)
  bot.callbackQuery(
    /^g:s:(\d+)$/,
    wrapCallback('g:s', async (ctx) => {
      await ctx
        .answerCallbackQuery()
        .catch((e) => log('warn', 'Groups', `answerCallbackQuery (g:s) failed: ${formatError(e)}`));
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const raw = ctx.match?.[1];
      if (!raw) return;
      const groupId = parseInt(raw, 10);
      if (isNaN(groupId)) return;

      const db = getDb();
      // Auth check before render — non-members must NOT see status (privacy invariant).
      const members = getMembersOfGroup(db, groupId);
      if (!members.some((m) => m.userId === chatId)) {
        await ctx
          .editMessageText('❌ אינך חבר בקבוצה זו.')
          .catch((e) => log('warn', 'Groups', `editMessageText (g:s non-member) failed: ${formatError(e)}`));
        return;
      }
      await renderGroupStatus(ctx, db, groupId);
    }),
  );

  // g:refresh:<id> — re-render in place (the 🔄 רענן button)
  bot.callbackQuery(
    /^g:refresh:(\d+)$/,
    wrapCallback('g:refresh', async (ctx) => {
      await ctx
        .answerCallbackQuery()
        .catch((e) => log('warn', 'Groups', `answerCallbackQuery (g:refresh) failed: ${formatError(e)}`));
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const raw = ctx.match?.[1];
      if (!raw) return;
      const groupId = parseInt(raw, 10);
      if (isNaN(groupId)) return;

      const db = getDb();
      const members = getMembersOfGroup(db, groupId);
      if (!members.some((m) => m.userId === chatId)) {
        await ctx
          .editMessageText('❌ אינך חבר בקבוצה זו.')
          .catch((e) => log('warn', 'Groups', `editMessageText (g:refresh non-member) failed: ${formatError(e)}`));
        return;
      }
      await renderGroupStatus(ctx, db, groupId);
    }),
  );

  // g:leaveY:<id> — leave (no real confirm step yet — name preserved for stable callback_data)
  bot.callbackQuery(
    /^g:leaveY:(\d+)$/,
    wrapCallback('g:leaveY', async (ctx) => {
      await ctx
        .answerCallbackQuery()
        .catch((e) => log('warn', 'Groups', `answerCallbackQuery (g:leaveY) failed: ${formatError(e)}`));
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
    }),
  );
}
