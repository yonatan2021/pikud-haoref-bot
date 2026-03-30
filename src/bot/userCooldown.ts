/**
 * Per-user action cooldown tracker.
 * Prevents rapid repeated writes (subscription toggles, settings changes)
 * from a single user. In-memory only — resets with bot restart (intentional:
 * cooldowns are short-lived and do not need persistence).
 */
export function createUserCooldown(cooldownMs: number): {
  isOnCooldown(userId: number): boolean;
  setCooldown(userId: number): void;
} {
  // userId → timestamp when the cooldown expires
  const expiryMap = new Map<number, number>();

  return {
    isOnCooldown(userId: number): boolean {
      const expiry = expiryMap.get(userId);
      if (expiry === undefined) return false;
      if (Date.now() >= expiry) {
        expiryMap.delete(userId);
        return false;
      }
      return true;
    },

    setCooldown(userId: number): void {
      expiryMap.set(userId, Date.now() + cooldownMs);
    },
  };
}
