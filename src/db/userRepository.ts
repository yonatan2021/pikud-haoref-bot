import { getDb } from './schema.js';

export type NotificationFormat = 'short' | 'detailed';

export type OnboardingStep = 'name' | 'city' | 'confirm';

const VALID_ONBOARDING_STEPS = new Set<string>(['name', 'city', 'confirm']);

export interface User {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: boolean;
  muted_until: string | null;
  display_name: string | null;
  home_city: string | null;
  locale: string;
  onboarding_completed: boolean;
  connection_code: string | null;
  onboarding_step: OnboardingStep | null;
  is_dm_active: boolean;
  created_at: string;
}

export interface ProfilePatch {
  display_name?: string;
  home_city?: string;
  locale?: string;
}

/** Raw SQLite row shape before boolean conversion */
interface RawUserRow {
  chat_id: number;
  format: NotificationFormat;
  quiet_hours_enabled: number;
  muted_until: string | null;
  display_name: string | null;
  home_city: string | null;
  locale: string;
  onboarding_completed: number;
  connection_code: string | null;
  onboarding_step: string | null;
  is_dm_active: number;
  created_at: string;
}

function mapRowToUser(raw: RawUserRow): User {
  return {
    ...raw,
    quiet_hours_enabled: raw.quiet_hours_enabled === 1,
    onboarding_completed: raw.onboarding_completed === 1,
    is_dm_active: raw.is_dm_active !== 0,
    muted_until: raw.muted_until ?? null,
    display_name: raw.display_name ?? null,
    home_city: raw.home_city ?? null,
    connection_code: raw.connection_code ?? null,
    onboarding_step: raw.onboarding_step && VALID_ONBOARDING_STEPS.has(raw.onboarding_step)
      ? (raw.onboarding_step as OnboardingStep)
      : null,
  };
}

export function upsertUser(chatId: number): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO users (chat_id) VALUES (?)')
    .run(chatId);
}

export function getUser(chatId: number): User | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM users WHERE chat_id = ?')
    .get(chatId) as RawUserRow | undefined;
  if (!raw) return undefined;
  return mapRowToUser(raw);
}

export function setFormat(chatId: number, format: NotificationFormat): void {
  upsertUser(chatId);
  getDb().prepare('UPDATE users SET format = ? WHERE chat_id = ?').run(format, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { format });
}

export function setQuietHours(chatId: number, enabled: boolean): void {
  upsertUser(chatId);
  getDb().prepare('UPDATE users SET quiet_hours_enabled = ? WHERE chat_id = ?').run(enabled ? 1 : 0, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { quiet_hours_enabled: enabled });
}

export function setMutedUntil(chatId: number, until: Date | null): void {
  upsertUser(chatId);
  const iso = until ? until.toISOString() : null;
  getDb().prepare('UPDATE users SET muted_until = ? WHERE chat_id = ?').run(iso, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { muted_until: iso });
}

export function isMuted(chatId: number, now: Date = new Date()): boolean {
  const user = getUser(chatId);
  if (!user?.muted_until) return false;
  return new Date(user.muted_until) > now;
}

/**
 * Soft-disable DM delivery for a user (e.g. bot was blocked).
 * Subscriptions are preserved. DMs resume automatically when active=true is
 * set (e.g. on next /start).  Does NOT cascade-delete subscriptions.
 */
export function setDmActive(chatId: number, active: boolean): void {
  getDb().prepare('UPDATE users SET is_dm_active = ? WHERE chat_id = ?').run(active ? 1 : 0, chatId);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { updateSubscriberData: (id: number, patch: object) => void })
    .updateSubscriberData(chatId, { is_dm_active: active });
}

export function deleteUser(chatId: number): void {
  getDb()
    .prepare('DELETE FROM users WHERE chat_id = ?')
    .run(chatId);
  // Dynamic require avoids circular dependency (subscriptionRepository imports from userRepository)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require('./subscriptionRepository.js') as { evictSubscriberFromCache: (id: number) => void })
    .evictSubscriberFromCache(chatId);
}

// --- Profile functions (v0.4.1) ---

export function getProfile(chatId: number): Pick<User, 'display_name' | 'home_city' | 'locale' | 'onboarding_completed' | 'onboarding_step' | 'connection_code'> | undefined {
  const user = getUser(chatId);
  if (!user) return undefined;
  return {
    display_name: user.display_name,
    home_city: user.home_city,
    locale: user.locale,
    onboarding_completed: user.onboarding_completed,
    onboarding_step: user.onboarding_step,
    connection_code: user.connection_code,
  };
}

export function updateProfile(chatId: number, patch: ProfilePatch): void {
  upsertUser(chatId);
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (patch.display_name !== undefined) {
    setClauses.push('display_name = ?');
    values.push(patch.display_name);
  }
  if (patch.home_city !== undefined) {
    setClauses.push('home_city = ?');
    values.push(patch.home_city);
  }
  if (patch.locale !== undefined) {
    setClauses.push('locale = ?');
    values.push(patch.locale);
  }

  if (setClauses.length === 0) return;

  values.push(chatId);
  getDb()
    .prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE chat_id = ?`)
    .run(...values);
}

export function setOnboardingStep(chatId: number, step: OnboardingStep | null): void {
  upsertUser(chatId);
  getDb()
    .prepare('UPDATE users SET onboarding_step = ? WHERE chat_id = ?')
    .run(step, chatId);
}

export function completeOnboarding(chatId: number): void {
  upsertUser(chatId);
  getDb()
    .prepare('UPDATE users SET onboarding_completed = 1, onboarding_step = NULL WHERE chat_id = ?')
    .run(chatId);
}

export function isOnboardingCompleted(chatId: number): boolean {
  const row = getDb()
    .prepare('SELECT onboarding_completed FROM users WHERE chat_id = ?')
    .get(chatId) as { onboarding_completed: number } | undefined;
  return row?.onboarding_completed === 1;
}

export function setConnectionCode(chatId: number, code: string): void {
  getDb()
    .prepare('UPDATE users SET connection_code = ? WHERE chat_id = ?')
    .run(code, chatId);
}

export function findUserByConnectionCode(code: string): User | undefined {
  const raw = getDb()
    .prepare('SELECT * FROM users WHERE connection_code = ?')
    .get(code) as RawUserRow | undefined;
  if (!raw) return undefined;
  return mapRowToUser(raw);
}
