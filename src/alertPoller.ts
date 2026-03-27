import { EventEmitter } from 'events';
import { Alert } from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pikudHaoref = require('pikud-haoref-api');

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

  start(intervalMs = 2000): void {
    console.log(`[AlertPoller] מתחיל סקר כל ${intervalMs / 1000} שניות`);
    const schedule = (): void => {
      this.poll().finally(() => setTimeout(schedule, intervalMs));
    };
    schedule();
  }

  private async poll(): Promise<void> {
    return new Promise((resolve) => {
      const options: Record<string, string> = {};
      if (process.env.PROXY_URL) {
        options.proxy = process.env.PROXY_URL;
      }

      pikudHaoref.getActiveAlerts(
        (err: Error | null, alerts: Alert[]) => {
          if (err) {
            console.error('[AlertPoller] שגיאה בקבלת התראות:', err.message);
            return resolve();
          }

          if (!alerts || alerts.length === 0) {
            if (this.seenFingerprints.size > 0) {
              console.log('[AlertPoller] אין התראות פעילות — מאפס זיכרון');
              this.seenFingerprints.clear();
            }
            return resolve();
          }

          const groupedAlerts = groupAlertsByType(alerts);
          for (const alert of groupedAlerts) {
            const normalizedAlert: Alert = {
              ...alert,
              cities: alert.cities.map(normalizeCityName),
            };
            const fingerprint = buildFingerprint(normalizedAlert);
            if (!this.seenFingerprints.has(fingerprint)) {
              this.seenFingerprints.add(fingerprint);
              console.log(
                `[AlertPoller] התרעה חדשה: ${alert.type} — ${normalizedAlert.cities.length} ערים`
              );
              this.emit('newAlert', normalizedAlert);
            }
          }
          resolve();
        },
        options
      );
    });
  }
}
