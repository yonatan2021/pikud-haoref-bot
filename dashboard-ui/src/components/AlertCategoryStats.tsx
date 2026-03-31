import { motion } from 'framer-motion';
import { EmptyState } from './EmptyState';
import { GlassCard } from './ui/GlassCard';

interface StatRow {
  type: string;
  name: string;
  count: number;
  color: string;
  pct: number;
}

interface AlertCategoryStatsProps {
  data: StatRow[];
  total: number;
}

export function AlertCategoryStats({ data, total }: AlertCategoryStatsProps) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-semibold text-text-primary">התפלגות לפי סוג</h2>
        <span className="text-text-muted text-xs">7 ימים אחרונים</span>
      </div>

      {data.length === 0 ? (
        <EmptyState icon="📊" message="אין נתונים" />
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {data.map((row, index) => (
            <div key={row.type}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="text-text-secondary text-sm">{row.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">{row.pct}%</span>
                  <span className="text-text-primary font-bold text-base tabular-nums" style={{ direction: 'ltr' }}>
                    {row.count.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: row.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${row.pct}%` }}
                  transition={{ duration: 0.4, delay: index * 0.05, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
          {total > 0 && (
            <p className="text-text-muted text-xs pt-1 border-t border-border">
              סה&quot;כ: <span className="text-text-secondary font-medium" style={{ direction: 'ltr', display: 'inline-block' }}>{total.toLocaleString()}</span> התראות
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
