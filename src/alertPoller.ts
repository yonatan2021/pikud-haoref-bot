import { EventEmitter } from 'events';
import axios from 'axios';
import { Alert } from './types';
import { updateLastPollAt } from './metrics.js';
import { log } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pikudHaoref = require('pikud-haoref-api');

const ALERTS_URL = 'https://www.oref.org.il/warningMessages/alert/Alerts.json';
const ALERTS_HEADERS = {
  Pragma: 'no-cache',
  'Cache-Control': 'max-age=0',
  Referer: 'https://www.oref.org.il/11226-he/pakar.aspx',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
};

export function normalizeCityName(city: string): string {
  return city
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' - ');
}

function buildFingerprint(alert: Alert): string {
  const normalizedCities = alert.cities.map(normalizeCityName).sort();
  return `${alert.type}:${normalizedCities.join('|')}`;
}

function groupAlertsByType(alerts: Alert[]): Alert[] {
  const byType = new Map<string, Alert>();
  for (const alert of alerts) {
    const existing = byType.get(alert.type);
    if (existing) {
      byType.set(alert.type, {
        ...existing,
        cities: Array.from(new Set([...existing.cities, ...alert.cities])),
      });
    } else {
      byType.set(alert.type, { ...alert });
    }
  }
  return Array.from(byType.values());
}

export class AlertPoller extends EventEmitter {
  private seenFingerprints = new Set<string>();
  private citylessFingerprints = new Set<string>();

  start(intervalMs = 2000): void {
    log('info', 'Poller', `מתחיל polling כל ${intervalMs / 1000} שניות`);
    const schedule = (): void => {
      this.poll().finally(() => setTimeout(schedule, intervalMs));
    };
    schedule();
  }

  private async poll(): Promise<void> {
    const results = await Promise.allSettled([this.pollViaLibrary(), this.pollCitylessNewsFlash()]);
    const anySucceeded = results.some((r) => r.status === 'fulfilled');
    if (anySucceeded) {
      updateLastPollAt();
    }
  }

  private pollViaLibrary(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: Record<string, string> = {};
      if (process.env.PROXY_URL) {
        options.proxy = process.env.PROXY_URL;
      }

      pikudHaoref.getActiveAlerts(
        (err: Error | null, alerts: Alert[]) => {
          if (err) {
            log('error', 'Poller', `שגיאה בשליפת התראות: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
            return reject(err);
          }

          const groupedAlerts = groupAlertsByType(alerts ?? []);
          const normalizedAlerts = groupedAlerts.map((alert) => ({
            ...alert,
            cities: alert.cities.map(normalizeCityName),
          }));
          const currentFingerprints = new Set(normalizedAlerts.map(buildFingerprint));

          // Expire fingerprints for alerts no longer present in the API response.
          // Cityless fingerprints are managed by pollCitylessNewsFlash — skip them here.
          for (const fp of this.seenFingerprints) {
            if (!currentFingerprints.has(fp) && !this.citylessFingerprints.has(fp)) {
              this.seenFingerprints.delete(fp);
            }
          }

          if (!alerts || alerts.length === 0) {
            return resolve();
          }

          for (const alert of normalizedAlerts) {
            const fingerprint = buildFingerprint(alert);
            if (!this.seenFingerprints.has(fingerprint)) {
              this.seenFingerprints.add(fingerprint);
              log('info', 'Poller', `התראה חדשה: ${alert.type} — ${alert.cities.length} ערים`);
              this.emit('newAlert', { ...alert, receivedAt: Date.now() });
            }
          }
          resolve();
        },
        options
      );
    });
  }

  private async pollCitylessNewsFlash(): Promise<void> {
    try {
      const axiosOptions: Record<string, unknown> = {
        url: `${ALERTS_URL}?${Math.round(Date.now() / 1000)}`,
        responseType: 'arraybuffer' as const,
        headers: ALERTS_HEADERS,
      };
      if (process.env.PROXY_URL) {
        axiosOptions.proxy = process.env.PROXY_URL;
      }

      const res = await axios(axiosOptions);
      let buffer = Buffer.from(res.data as ArrayBuffer);

      if (buffer.length < 2) {
        log('warn', 'Poller', 'תגובת newsFlash קצרה מדי — מדלג');
        return;
      }

      // Oref API returns one of three encodings — detect BOM and strip:
      //   UTF-16 LE: BOM bytes 0xFF 0xFE → decode as utf16le, skip 2 BOM bytes
      //   UTF-8 BOM: bytes 0xEF 0xBB 0xBF → plain UTF-8, skip 3 BOM bytes
      //   Plain UTF-8: no BOM → read as-is
      let encoding: BufferEncoding = 'utf8';
      if (buffer[0] === 255 && buffer[1] === 254) {
        encoding = 'utf16le';
        buffer = buffer.subarray(2);
      } else if (buffer.length > 2 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
        buffer = buffer.subarray(3);
      }

      // eslint-disable-next-line no-control-regex
      const body = buffer.toString(encoding)
        .replace(/\x00/g, '')
        .replace(/\u0A7B/g, '') // Oref API occasionally emits \u0A7B (stray Punjabi char) as separator — strip
        .trim();
      if (!body) return;

      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch (parseErr) {
        log('error', 'Poller', `newsFlash JSON parse נכשל: ${parseErr} — תצוגה מקדימה: ${body.slice(0, 200)}`);
        return;
      }

      if (json == null || typeof json !== 'object' || !('cat' in json)) {
        log('error', 'Poller', `newsFlash תגובה בעלת מבנה לא צפוי — מדלג: ${JSON.stringify(json).slice(0, 200)}`);
        return;
      }

      const jsonObj = json as Record<string, unknown>;

      // Not a newsFlash — clear any tracked fingerprints and return
      if (parseInt(jsonObj.cat as string) !== 10) {
        this.clearCitylessFingerprints();
        return;
      }

      const cities: string[] = ((jsonObj.data ?? []) as string[])
        .map((c: string) => c?.trim())
        .filter((c: string) => c && !c.includes('בדיקה'));

      // Build the alert regardless of whether cities are present.
      // Previously we returned early when cities were present, trusting pollViaLibrary to handle it.
      // But when another alert type (e.g. missiles, cat=1) is simultaneously active, Alerts.json
      // returns that category and pollViaLibrary never sees the newsFlash — so we must emit it here.
      const normalizedCities = cities.map(normalizeCityName);
      const alert: Alert = {
        type: 'newsFlash',
        cities: normalizedCities,
        ...(jsonObj.title ? { instructions: jsonObj.title as string } : {}),
        ...(jsonObj.id ? { id: String(jsonObj.id) } : {}),
      };

      const fingerprint = buildFingerprint(alert);

      // If the fingerprint changed (city set changed), evict the stale entry and track the new one.
      // citylessFingerprints acts as a guard that prevents pollViaLibrary's expiry loop from
      // removing fingerprints it never saw (because its concurrent Alerts.json call returned
      // a different category).
      if (!this.citylessFingerprints.has(fingerprint)) {
        this.clearCitylessFingerprints();
        this.citylessFingerprints.add(fingerprint);
      }

      if (!this.seenFingerprints.has(fingerprint)) {
        this.seenFingerprints.add(fingerprint);
        const desc = normalizedCities.length > 0
          ? `newsFlash — ${normalizedCities.length} cities (direct fetch)`
          : 'nationwide newsFlash (no cities)';
        log('info', 'Poller', `התראה חדשה: ${desc}`);
        this.emit('newAlert', { ...alert, receivedAt: Date.now() });
      }
    } catch (err) {
      log('error', 'Poller', `שגיאה בבדיקת newsFlash ארצי: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      throw err;
    }
  }

  private clearCitylessFingerprints(): void {
    for (const fp of this.citylessFingerprints) {
      this.seenFingerprints.delete(fp);
    }
    this.citylessFingerprints.clear();
  }
}
