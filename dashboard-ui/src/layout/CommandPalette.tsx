import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Bell, Users, Radio, Settings, Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Page {
  label: string;
  to: string;
  icon: LucideIcon;
}

const PAGES: Page[] = [
  { label: 'לוח בקרה', to: '/overview', icon: LayoutDashboard },
  { label: 'התראות', to: '/alerts', icon: Bell },
  { label: 'מנויים', to: '/subscribers', icon: Users },
  { label: 'מרכז פיקוד', to: '/operations', icon: Radio },
  { label: 'הגדרות', to: '/settings', icon: Settings },
  { label: 'אתר נחיתה', to: '/landing', icon: Globe },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <Command>
          <Command.Input
            placeholder="חפש עמוד..."
            className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-border text-text-primary placeholder:text-text-muted"
          />
          <Command.List className="p-2 max-h-60 overflow-y-auto">
            <Command.Empty className="text-center text-text-muted text-sm py-4">
              לא נמצאו תוצאות
            </Command.Empty>
            {PAGES.map(p => {
              const Icon = p.icon;
              return (
                <Command.Item
                  key={p.to}
                  onSelect={() => { navigate(p.to); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-text-secondary data-[selected=true]:bg-amber/10 data-[selected=true]:text-amber"
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span>{p.label}</span>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
        <p className="text-center text-text-muted text-xs py-2 border-t border-border">⌘K לסגירה</p>
      </div>
    </div>
  );
}
