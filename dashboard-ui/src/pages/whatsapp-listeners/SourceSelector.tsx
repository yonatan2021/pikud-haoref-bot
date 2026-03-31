import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Rss, ChevronDown, Search, X } from 'lucide-react';

interface WhatsAppChat {
  id: string;
  name: string;
  type: 'group' | 'newsletter';
}

interface SourceSelectorProps {
  chats: WhatsAppChat[] | undefined;
  value: string;
  onChange: (channelId: string) => void;
  disabled: boolean;
  whatsappConnected?: boolean;
}

export function SourceSelector({ chats, value, onChange, disabled, whatsappConnected }: SourceSelectorProps) {
  const chatsEmpty = !chats || chats.length === 0;
  const selected = chats?.find(c => c.id === value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const { groups, channels } = useMemo(() => {
    const term = search.toLowerCase();
    const filtered = (chats ?? []).filter(c => c.name.toLowerCase().includes(term));
    return {
      groups: filtered.filter(c => c.type === 'group'),
      channels: filtered.filter(c => c.type === 'newsletter'),
    };
  }, [chats, search]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-text-secondary">מקור (צ&apos;אט WhatsApp)</label>
      <div className="relative" ref={containerRef}>
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className="w-full flex items-center justify-between bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary disabled:opacity-50 outline-none focus:border-amber/50 transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {selected.type === 'newsletter' ? <Rss size={14} className="text-text-muted shrink-0" /> : <MessageSquare size={14} className="text-text-muted shrink-0" />}
                <span className="truncate">{selected.name}</span>
                <span className="text-text-muted text-xs shrink-0">({selected.type === 'group' ? 'קבוצה' : 'ערוץ'})</span>
              </>
            ) : (
              <span className="text-text-muted">בחר מקור...</span>
            )}
          </span>
          <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-xl max-h-72 flex flex-col overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setOpen(false), setSearch(''))}
                placeholder="חפש..."
                className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-text-muted hover:text-text-secondary">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Options */}
            <div className="overflow-y-auto">
              {/* Clear selection */}
              {value && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className="w-full px-3 py-2 text-sm text-text-muted hover:bg-white/5 text-right"
                >
                  ← נקה בחירה
                </button>
              )}

              {/* Groups section */}
              {groups.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-white/3 border-b border-border flex items-center gap-1.5">
                    <MessageSquare size={12} />
                    קבוצות ({groups.length})
                  </div>
                  {groups.map(chat => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => handleSelect(chat.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 text-right transition-colors ${
                        chat.id === value ? 'bg-amber/10 text-amber' : 'text-text-primary'
                      }`}
                    >
                      <MessageSquare size={13} className="text-text-muted shrink-0" />
                      <span className="truncate">{chat.name}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Channels section */}
              {channels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-white/3 border-b border-border flex items-center gap-1.5">
                    <Rss size={12} />
                    ערוצים ({channels.length})
                  </div>
                  {channels.map(chat => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => handleSelect(chat.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 text-right transition-colors ${
                        chat.id === value ? 'bg-amber/10 text-amber' : 'text-text-primary'
                      }`}
                    >
                      <Rss size={13} className="text-text-muted shrink-0" />
                      <span className="truncate">{chat.name}</span>
                    </button>
                  ))}
                </>
              )}

              {/* No results */}
              {groups.length === 0 && channels.length === 0 && (
                <p className="px-3 py-4 text-sm text-text-muted text-center">
                  {search ? 'לא נמצאו תוצאות' : 'אין צ\u0027אטים'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp not connected warning */}
      {chatsEmpty && (
        <div className="bg-base border border-amber/20 rounded-lg p-3 flex gap-2 items-start">
          <span>⚠️</span>
          <div>
            {whatsappConnected ? (
              <>
                <p className="text-text-secondary text-xs font-medium">לא נמצאו קבוצות או ערוצים</p>
                <p className="text-text-muted text-xs">
                  WhatsApp מחובר אך לא נמצאו צ&apos;אטים.{' '}
                  <a href="/whatsapp" className="text-amber hover:underline">נסה לחבר מחדש</a>
                </p>
              </>
            ) : (
              <>
                <p className="text-text-secondary text-xs font-medium">WhatsApp לא מחובר</p>
                <p className="text-text-muted text-xs">
                  כדי להוסיף כלל האזנה, יש תחילה לחבר את WhatsApp.{' '}
                  <a href="/whatsapp" className="text-amber hover:underline">עבור לחיבור WhatsApp</a>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
