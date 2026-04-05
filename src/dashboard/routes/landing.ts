import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from '../settingsRepository.js';
import { resolveConfig } from '../../config/configResolver.js';
import { log } from '../../logger.js';
import { createRateLimitMiddleware } from '../rateLimiter.js';

export const deployLimiter = createRateLimitMiddleware({
  maxRequests: 3,
  windowMs: 3_600_000,
  message: 'יותר מדי בקשות deploy — נסה שוב בעוד שעה',
});

export const landingConfigLimiter = createRateLimitMiddleware({
  maxRequests: 10,
  windowMs: 60_000,
  message: 'יותר מדי שינויי config — נסה שוב בעוד דקה',
});

export function createLandingRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    const lastDeploy = getSetting(db, 'last_landing_deploy') ?? null;
    res.json({
      ga4MeasurementId: resolveConfig(db, 'ga4_measurement_id') ?? '',
      lastDeploy,
      siteUrl: getSetting(db, 'landing_url') ?? '',
      githubRepo: resolveConfig(db, 'github_repo') ?? '',
      deployStatus: lastDeploy ? 'deployed' : 'never',
    });
  });

  router.patch('/config', landingConfigLimiter, (req, res) => {
    const { ga4MeasurementId, siteUrl } = req.body as { ga4MeasurementId?: string; siteUrl?: string };
    if (ga4MeasurementId !== undefined) {
      if (!/^G-[A-Z0-9]{4,12}$/.test(ga4MeasurementId) && ga4MeasurementId !== '') {
        res.status(400).json({ error: 'GA4 Measurement ID פורמט לא חוקי (דוגמה: G-XXXXXXXXXX)' });
        return;
      }
      setSetting(db, 'ga4_measurement_id', ga4MeasurementId);
    }
    if (siteUrl !== undefined) {
      if (siteUrl !== '' && !/^https?:\/\//i.test(siteUrl.trim())) {
        res.status(400).json({ error: 'כתובת האתר חייבת להתחיל ב-http:// או https://' });
        return;
      }
      setSetting(db, 'landing_url', siteUrl);
    }
    res.json({ ok: true });
  });

  router.post('/deploy', deployLimiter, async (_req, res) => {
    const token = resolveConfig(db, 'github_pat');
    const repo = resolveConfig(db, 'github_repo') ?? '';
    if (!token || !repo) {
      res.status(400).json({ error: 'GITHUB_PAT או GITHUB_REPO לא מוגדרים' });
      return;
    }
    const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
    if (!REPO_PATTERN.test(repo)) {
      res.status(400).json({ error: 'GITHUB_REPO פורמט לא חוקי (צפוי: owner/repo)' });
      return;
    }
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/deploy-landing.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'pikud-haoref-dashboard',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        log('error', 'Dashboard', `GitHub API error ${response.status}: ${detail}`);
        res.status(502).json({ error: 'GitHub API נכשל', status: response.status });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      log('error', 'Dashboard', `Deploy trigger failed: ${String(err)}`);
      res.status(500).json({ error: 'שגיאת רשת בהפעלת deploy' });
      return;
    }
    try {
      setSetting(db, 'last_landing_deploy', new Date().toISOString());
    } catch (err) {
      log('warn', 'Dashboard', `Failed to save last_landing_deploy: ${String(err)}`);
    }
  });

  return router;
}
