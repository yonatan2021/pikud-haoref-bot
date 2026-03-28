import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { LayoutDashboard, Bell, Users, Radio, Settings, Globe, ChevronRight, ChevronLeft } from 'lucide-react';
import { LiveDot } from '../components/ui';

const GROUPS = [
  { label: 'מידע', items: [{ to: '/overview', icon: LayoutDashboard, label: 'לוח בקרה' }, { to: '/alerts', icon: Bell, label: 'התראות' }] },
  { label: 'פעולות', items: [{ to: '/subscribers', icon: Users, label: 'מנויים' }, { to: '/operations', icon: Radio, label: 'מרכז פיקוד' }] },
  { label: 'ניהול', items: [{ to: '/settings', icon: Settings, label: 'הגדרות' }, { to: '/landing', icon: Globe, label: 'אתר נחיתה' }] },
];

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

export function Sidebar({ uptime }: { uptime: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const prefersReduced = useReducedMotion();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col h-screen backdrop-blur-md bg-[var(--color-glass)] border-l border-border overflow-hidden flex-shrink-0"
    >
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Bell className="text-amber flex-shrink-0" size={20} />
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="title"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-bold text-sm text-text-primary whitespace-nowrap"
            >
              פיקוד העורף
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'הרחב סרגל צד' : 'כווץ סרגל צד'}
          aria-expanded={!collapsed}
          className="mr-auto text-text-muted hover:text-text-secondary flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto py-3 space-y-1">
        {GROUPS.map((group, index) => (
          <div key={group.label}>
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.p
                  key={`label-${group.label}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-text-muted text-xs px-4 py-1 uppercase tracking-wider"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${isActive
                    ? 'border-r-2 border-amber text-amber bg-[var(--color-glow-amber)]'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'}`
                }
              >
                <motion.div whileHover={{ x: 2 }} className="flex items-center gap-3 w-full">
                  <item.icon size={16} className="flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        key={`item-${item.to}`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </NavLink>
            ))}
            {!collapsed && index < GROUPS.length - 1 && <div className="border-t border-border mx-4 my-1" />}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <LiveDot color="green" />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                key="status"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <p className="text-xs text-green">מערכת פעילה</p>
                <p className="text-xs text-text-muted">{formatUptime(uptime)}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
