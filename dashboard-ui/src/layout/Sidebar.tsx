import { NavLink } from 'react-router-dom';
import { useState } from 'react';

const GROUPS = [
  { label: 'מידע', items: [{ to: '/overview', icon: '📊', label: 'לוח בקרה' }, { to: '/alerts', icon: '🔔', label: 'התראות' }] },
  { label: 'פעולות', items: [{ to: '/subscribers', icon: '👥', label: 'מנויים' }, { to: '/operations', icon: '📡', label: 'מרכז פיקוד' }] },
  { label: 'ניהול', items: [{ to: '/settings', icon: '⚙️', label: 'הגדרות' }, { to: '/landing', icon: '🌐', label: 'אתר נחיתה' }] },
];

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

export function Sidebar({ uptime }: { uptime: number }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`flex flex-col h-screen bg-surface border-l border-border transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <span className="text-amber text-xl">🔴</span>
        {!collapsed && <span className="font-bold text-sm text-text-primary">פיקוד העורף</span>}
        <button onClick={() => setCollapsed(c => !c)} className="mr-auto text-text-muted hover:text-text-secondary text-xs px-1">
          {collapsed ? '◀' : '▶'}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 space-y-1">
        {GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && <p className="text-text-muted text-xs px-4 py-1 uppercase tracking-wider">{group.label}</p>}
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${isActive
                    ? 'border-r-2 border-amber text-amber bg-amber/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`
                }
              >
                <span className="text-base">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
            {!collapsed && <div className="border-t border-border mx-4 my-1" />}
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green animate-pulse flex-shrink-0" />
          {!collapsed && (
            <div>
              <p className="text-xs text-green">מערכת פעילה</p>
              <p className="text-xs text-text-muted">{formatUptime(uptime)}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
