declare module 'pikud-haoref-api' {
  interface PikudAlert {
    id?: string;
    type: string;
    cities: string[];
    instructions?: string;
  }

  interface GetActiveAlertsOptions {
    proxy?: string;
    alertsHistoryJson?: boolean;
  }

  function getActiveAlerts(
    callback: (err: Error | null, alerts: PikudAlert[]) => void,
    options?: GetActiveAlertsOptions
  ): void;

  export { getActiveAlerts };
}
