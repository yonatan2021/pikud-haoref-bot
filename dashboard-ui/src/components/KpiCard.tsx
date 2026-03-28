interface KpiCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

export function KpiCard({ icon, label, value, sub, accent }: KpiCardProps) {
  return (
    <div className={`bg-surface border rounded-xl p-5 ${accent ? 'border-amber/40' : 'border-border'}`}>
      <p className="text-text-secondary text-sm flex items-center gap-2">
        <span>{icon}</span>
        {label}
      </p>
      <p className={`text-3xl font-bold mt-2 ${accent ? 'text-amber' : 'text-text-primary'}`}>
        {value}
      </p>
      {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
    </div>
  );
}
