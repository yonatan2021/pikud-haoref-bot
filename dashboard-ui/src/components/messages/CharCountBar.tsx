interface CharCountBarProps {
  charCount: number;
  max?: number;
}

export function CharCountBar({ charCount, max = 1024 }: CharCountBarProps) {
  const pct = Math.min((charCount / max) * 100, 100);
  const colorClass = pct > 95 ? 'bg-red-500' : pct > 80 ? 'bg-amber' : 'bg-green';
  const textColorClass = pct > 95 ? 'text-red-500' : pct > 80 ? 'text-amber' : 'text-green';

  return (
    <div className="mt-2">
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1 text-start ${textColorClass}`}>
        {charCount} / {max} תווים
      </p>
    </div>
  );
}
