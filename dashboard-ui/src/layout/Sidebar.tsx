import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Activity, Bell, Users, UsersRound, Radio, SlidersHorizontal,
  Globe, MessageSquare, Phone, Rss, MessageCircle,
  LayoutDashboard, Settings, ChevronLeft, ChevronDown, KeyRound,
} from 'lucide-react';
import { LiveDot } from '../components/ui';

// ─── nav shape ────────────────────────────────────────────────
type IconComponent = React.ComponentType<{ size?: number; className?: string }>;
interface NavItem { to: string; icon: IconComponent; label: string }
interface NavGroup { key: string; icon: IconComponent; label: string; items: NavItem[]; defaultOpen?: boolean }
type SidebarEntry =
  | { kind: 'group'; group: NavGroup; dividerAfter?: boolean }
  | { kind: 'item';  item: NavItem & { icon: IconComponent }; dividerAfter?: boolean };

const NAV: SidebarEntry[] = [
  {
    kind: 'group',
    group: {
      key: 'monitoring',
      icon: Activity,
      label: 'ניטור',
      defaultOpen: true,
      items: [
        { to: '/overview', icon: LayoutDashboard, label: 'לוח בקרה' },
        { to: '/alerts',   icon: Bell,            label: 'היסטוריית התראות' },
      ],
    },
  },
  { kind: 'item', item: { to: '/subscribers', icon: Users, label: 'מנויים' } },
  { kind: 'item', item: { to: '/groups',      icon: UsersRound, label: 'קבוצות חוסן' } },
  { kind: 'item', item: { to: '/operations',  icon: Radio, label: 'מרכז פיקוד' }, dividerAfter: true },
  {
    kind: 'group',
    group: {
      key: 'listeners',
      icon: Rss,
      label: 'מאזינים',
      defaultOpen: false,
      items: [
        { to: '/whatsapp',           icon: Phone,          label: 'WhatsApp' },
        { to: '/whatsapp-listeners', icon: Rss,            label: 'מאזיני WhatsApp' },
        { to: '/telegram-listeners', icon: MessageCircle,  label: 'מאזיני Telegram' },
      ],
    },
  },
  {
    kind: 'group',
    group: {
      key: 'system',
      icon: SlidersHorizontal,
      label: 'מערכת',
      defaultOpen: false,
      items: [
        { to: '/configuration', icon: KeyRound,       label: 'הגדרות ואבטחה' },
        { to: '/settings',      icon: Settings,       label: 'הגדרות' },
        { to: '/messages',      icon: MessageSquare,  label: 'תבניות הודעות' },
        { to: '/landing',       icon: Globe,          label: 'אתר נחיתה' },
      ],
    },
  },
];

// ─── helpers ──────────────────────────────────────────────────
function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function useLocalOpen(key: string, defaultValue: boolean): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(`sidebar_open_${key}`);
    return stored !== null ? stored === 'true' : defaultValue;
  });
  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(`sidebar_open_${key}`, String(next));
      return next;
    });
  };
  return [open, toggle];
}

// ─── sub-components ───────────────────────────────────────────
function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const prefersReduced = useReducedMotion();
  return (
    <NavLink
      to={item.to}
      aria-label={item.label}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
          isActive
            ? 'border-l-2 border-[var(--color-tg)] text-[var(--color-tg)] bg-[var(--color-glow-tg)]'
            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
        }`
      }
    >
      <motion.div
        whileHover={prefersReduced ? {} : { x: -2 }}
        className="flex items-center gap-3 w-full"
      >
        <item.icon size={16} className="flex-shrink-0" />
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key={item.to}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </NavLink>
  );
}

function CollapsibleGroup({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const [open, toggle] = useLocalOpen(group.key, group.defaultOpen ?? false);
  const prefersReduced = useReducedMotion();

  return (
    <div>
      {/* Group header — clickable when sidebar is expanded */}
      <button
        onClick={collapsed ? undefined : toggle}
        disabled={collapsed}
        aria-expanded={open}
        aria-label={group.label}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <group.icon size={16} className="flex-shrink-0" />
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key={`${group.key}-label`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex-1 text-right whitespace-nowrap font-medium"
            >
              {group.label}
            </motion.span>
          )}
        </AnimatePresence>
        {!collapsed && (
          <motion.div
            animate={prefersReduced ? {} : { rotate: open ? 0 : -90 }}
            transition={{ duration: 0.18 }}
            className="flex-shrink-0"
          >
            <ChevronDown size={14} />
          </motion.div>
        )}
      </button>

      {/* Items */}
      <AnimatePresence initial={false}>
        {(open || collapsed) && (
          <motion.div
            key={`${group.key}-items`}
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {group.items.map(item => (
              <div key={item.to} className={collapsed ? '' : 'pr-2'}>
                <NavItemLink item={item} collapsed={collapsed} />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────
export function Sidebar({ uptime }: { uptime: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const prefersReduced = useReducedMotion();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col h-screen backdrop-blur-md bg-[var(--color-glass)] border-l border-border overflow-hidden flex-shrink-0"
    >
      {/* Header */}
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
          <ChevronLeft
            size={16}
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="ניווט ראשי" className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {NAV.map((entry) => {
          const key = entry.kind === 'item' ? entry.item.to : entry.group.key;
          const showDivider = !!entry.dividerAfter && !collapsed;
          return (
            <div key={key}>
              {entry.kind === 'item'
                ? <NavItemLink item={entry.item} collapsed={collapsed} />
                : <CollapsibleGroup group={entry.group} collapsed={collapsed} />
              }
              {showDivider && <div className="border-t border-border mx-4 my-1" />}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
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
