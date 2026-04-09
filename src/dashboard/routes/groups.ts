import { Router } from 'express';
import type Database from 'better-sqlite3';
import { log } from '../../logger.js';
import {
  listAllGroupsWithStats,
  findGroupById,
  getMembersOfGroup,
  deleteGroup,
} from '../../db/groupRepository.js';
import { getUser } from '../../db/userRepository.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';

/**
 * Mutation endpoints (DELETE) are rate-limited per IP — admin moderation
 * actions should be deliberate. 5 deletes per minute is generous for normal
 * use and tight enough to prevent runaway scripts.
 *
 * Exported so tests can call `.clearStore()` between cases — same pattern
 * as the other dashboard route limiters. Per memory:
 * pattern_rate_limiter_test_isolation.md.
 */
export const groupMutateLimiter = createRateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  message: 'יותר מדי פעולות מחיקה — נסה שוב בעוד דקה',
});

export function createGroupsRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/groups
   * Lists every group in the system with member count, owner display name,
   * and creation timestamp. Used by the dashboard Groups page table.
   */
  router.get('/', (_req, res) => {
    try {
      const rows = listAllGroupsWithStats(db);
      // Enrich each row with the owner's display name (single getUser call
      // per group — bounded by the total number of groups in the system,
      // which is small for the foreseeable future).
      const groups = rows.map((g) => {
        const owner = getUser(g.ownerId);
        return {
          id: g.id,
          name: g.name,
          inviteCode: g.inviteCode,
          ownerId: g.ownerId,
          ownerDisplayName: owner?.display_name ?? null,
          createdAt: g.createdAt,
          memberCount: g.memberCount,
        };
      });
      res.json({ ok: true, groups });
    } catch (err) {
      log('error', 'Dashboard/Groups', `list failed: ${String(err)}`);
      res.status(500).json({ ok: false, error: 'Failed to list groups' });
    }
  });

  /**
   * GET /api/groups/stats
   * Aggregate statistics for the dashboard KPI cards: total groups, average
   * members per group, and the top-10 most-populated groups.
   *
   * Must come BEFORE /:id so the static segment doesn't get matched as an id.
   */
  router.get('/stats', (_req, res) => {
    try {
      const rows = listAllGroupsWithStats(db);
      const total = rows.length;
      const avgMembers =
        total === 0 ? 0 : rows.reduce((s, g) => s + g.memberCount, 0) / total;
      const top10 = [...rows]
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 10)
        .map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount }));

      res.json({
        ok: true,
        total,
        avgMembers: Number(avgMembers.toFixed(2)),
        top10,
      });
    } catch (err) {
      log('error', 'Dashboard/Groups', `stats failed: ${String(err)}`);
      res.status(500).json({ ok: false, error: 'Failed to compute stats' });
    }
  });

  /**
   * GET /api/groups/:id
   * Drill-down detail for a single group: full member list with display
   * names + roles + joined_at + notify_group flag. Used by the dashboard
   * Groups drawer when clicking a row.
   */
  router.get('/:id', (req, res) => {
    try {
      const idParam = req.params['id'];
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'Invalid group id' });
        return;
      }

      const group = findGroupById(db, id);
      if (!group) {
        res.status(404).json({ ok: false, error: 'Group not found' });
        return;
      }

      const members = getMembersOfGroup(db, id).map((m) => {
        const user = getUser(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          notifyGroup: m.notifyGroup,
          displayName: user?.display_name ?? null,
          homeCity: user?.home_city ?? null,
        };
      });

      res.json({
        ok: true,
        group: {
          id: group.id,
          name: group.name,
          inviteCode: group.inviteCode,
          ownerId: group.ownerId,
          createdAt: group.createdAt,
        },
        members,
      });
    } catch (err) {
      log('error', 'Dashboard/Groups', `get failed: ${String(err)}`);
      res.status(500).json({ ok: false, error: 'Failed to fetch group' });
    }
  });

  /**
   * DELETE /api/groups/:id
   * Admin moderation — deletes a group and CASCADE removes all member rows.
   * Rate-limited via groupMutateLimiter (5 per minute per IP).
   * Logs at WARN level to make moderation actions visible in the operations
   * log.
   */
  router.delete('/:id', groupMutateLimiter, (req, res) => {
    try {
      const idParam = req.params['id'];
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'Invalid group id' });
        return;
      }

      const group = findGroupById(db, id);
      if (!group) {
        res.status(404).json({ ok: false, error: 'Group not found' });
        return;
      }

      deleteGroup(db, id);
      log(
        'warn',
        'Dashboard/Groups',
        `admin deleted group ${id} (${group.name}, owner=${group.ownerId})`,
      );
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard/Groups', `delete failed: ${String(err)}`);
      res.status(500).json({ ok: false, error: 'Failed to delete group' });
    }
  });

  return router;
}
