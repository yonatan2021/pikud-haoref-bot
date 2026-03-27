import { EventEmitter } from 'events';
import axios from 'axios';
import { Alert } from './types';

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
  return city.trim().replace(/\s+/g, ' ');
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
    console.log(`[AlertPoller] Starting poll every ${intervalMs / 1000}s`);
    const schedule = (): void => {
      this.poll().finally(() => setTimeout(schedule, intervalMs));
    };
    schedule();
  }

  private async poll(): Promise<void> {
    await Promise.all([this.pollViaLibrary(), this.pollCitylessNewsFlash()]);
  }

  private pollViaLibrary(): Promise<void> {
    return new Promise((resolve) => {
      const options: Record<string, string> = {};
      if (process.env.PROXY_URL) {
        options.proxy = process.env.PROXY_URL;
      }

      pikudHaoref.getActiveAlerts(
        (err: Error | null, alerts: Alert[]) => {
          if (err) {
            console.error('[AlertPoller] Error fetching alerts:', err);
            return resolve();
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
              console.log(
                `[AlertPoller] New alert: ${alert.type} — ${alert.cities.length} cities`
              );
              this.emit('newAlert', alert);
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
        console.warn('[AlertPoller] newsFlash response too short — skipping');
        return;
      }

      let encoding: BufferEncoding = 'utf8';
      if (buffer[0] === 255 && buffer[1] === 254) {
        encoding = 'utf16le';
        buffer = buffer.subarray(2);
      } else if (buffer.length > 2 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
        buffer = buffer.subarray(3);
      }

      // eslint-disable-next-line no-control-regex
      const body = buffer.toString(encoding).replace(/\x00/g, '').replace(/\u0A7B/g, '').trim();
      if (!body) return;

      const json = JSON.parse(body);

      // Only handle newsFlash (cat=10) with no cities — the library already handles all other cases
      if (parseInt(json.cat) !== 10) {
        this.clearCitylessFingerprints();
        return;
      }

      const cities: string[] = (json.data ?? [])
        .map((c: string) => c?.trim())
        .filter((c: string) => c && !c.includes('בדיקה'));

      if (cities.length > 0) {
        // newsFlash now has cities — library handles it; release our fingerprint so it can expire normally
        this.clearCitylessFingerprints();
        return;
      }

      const alert: Alert = {
        type: 'newsFlash',
        cities: [],
        ...(json.title ? { instructions: json.title as string } : {}),
        ...(json.id ? { id: String(json.id) } : {}),
      };

      const fingerprint = buildFingerprint(alert);
      if (!this.seenFingerprints.has(fingerprint)) {
        this.seenFingerprints.add(fingerprint);
        this.citylessFingerprints.add(fingerprint);
        console.log('[AlertPoller] New alert: nationwide newsFlash (no cities)');
        this.emit('newAlert', alert);
      }
    } catch (err) {
      console.error('[AlertPoller] Error checking nationwide newsFlash:', err);
    }
  }

  private clearCitylessFingerprints(): void {
    for (const fp of this.citylessFingerprints) {
      this.seenFingerprints.delete(fp);
    }
    this.citylessFingerprints.clear();
  }
}
