import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from '../settingsRepository.js';

export function createLandingRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({
      ga4MeasurementId: getSetting(db, 'ga4_measurement_id') ?? process.env.GA4_MEASUREMENT_ID ?? '',
      lastDeploy: getSetting(db, 'last_landing_deploy') ?? null,
      siteUrl: getSetting(db, 'landing_url') ?? '',
    });
  });

  router.patch('/config', (req, res) => {
    const { ga4MeasurementId, siteUrl } = req.body as { ga4MeasurementId?: string; siteUrl?: string };
    if (ga4MeasurementId !== undefined) {
      if (!/^G-[A-Z0-9]{4,12}$/.test(ga4MeasurementId) && ga4MeasurementId !== '') {
        res.status(400).json({ error: 'GA4 Measurement ID פורמט לא חוקי (דוגמה: G-XXXXXXXXXX)' });
        return;
      }
      setSetting(db, 'ga4_measurement_id', ga4MeasurementId);
    }
    if (siteUrl !== undefined) setSetting(db, 'landing_url', siteUrl);
    res.json({ ok: true });
  });

  router.post('/deploy', async (_req, res) => {
    const token = process.env.GITHUB_PAT;
    const repo = getSetting(db, 'github_repo') ?? process.env.GITHUB_REPO ?? '';
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
      if (!response.ok) { res.status(502).json({ error: 'GitHub API נכשל' }); return; }
      setSetting(db, 'last_landing_deploy', new Date().toISOString());
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'שגיאת רשת בהפעלת deploy' });
    }
  });

  return router;
}
