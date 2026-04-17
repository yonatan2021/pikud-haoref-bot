/**
 * Pill-style settings tab bar with Lucide icons.
 *
 * Horizontal scroll on narrow viewports (<640px) — the 8 tabs would wrap
 * otherwise and break the visual hierarchy. flex-nowrap + overflow-x-auto
 * keeps them in one line at any width.
 *
 * Active pill uses layoutId animation — Framer Motion smoothly slides the
 * background between tabs on click, communicating spatial continuity.
 */

import { motion } from 'framer-motion';
import {
  Bot, Radio, Map, MessageCircle, Mail, Heart, Users,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { SettingTab } from './settingsSchema';

const ICON_MAP: Record<string, React.ElementType> = {
  Bot, Radio, Map, MessageCircle, Mail, Heart, Users, Settings: SettingsIcon,
};

interface SettingsTabBarProps {
  tabs: readonly { id: SettingTab; label: string; icon: string }[];
  activeTab: SettingTab;
  onTabChange: (tab: SettingTab) => void;
}

export function SettingsTabBar({ tabs, activeTab, onTabChange }: SettingsTabBarProps) {
  return (
    <div
      role="tablist"
      className="flex gap-1 mb-6 p-1 bg-[var(--color-glass)] rounded-xl border border-border overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(tab => {
        const Icon = ICON_MAP[tab.icon] ?? SettingsIcon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-3 py-2 text-sm rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
              isActive ? 'text-amber font-medium' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="settings-tab-bg"
                className="absolute inset-0 bg-amber/15 rounded-lg border border-amber/30"
                transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={14} />
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
