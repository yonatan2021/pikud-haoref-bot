import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Rss, ChevronDown, Search, X } from 'lucide-react';

export interface TelegramKnownChat {
  chatId: string;
  chatName: string;
  chatType: string;
  updatedAt: string;
}

type TypeFilter = 'all' | 'group' | 'channel';

interface SourceSelectorProps {
  chats: TelegramKnownChat[] | undefined;
  value: string;
  onChange: (chatId: string) => void;
  disabled: boolean;
  telegramConnected?: boolean;
}

export function SourceSelector({ chats, value, onChange, disabled, telegramConnected }: SourceSelectorProps) {
  const chatsEmpty = !chats || chats.length === 0;
  const selected = chats?.find(c => c.chatId === value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TypeFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        setFilter('all');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const totalCounts = useMemo(() => {
    const all = chats ?? [];
    return {
      groups: all.filter(c => c.chatType === 'group' || c.chatType === 'supergroup').length,
      channels: all.filter(c => c.chatType === 'channel').length,
    };
  }, [chats]);

  const { groups, channels } = useMemo(() => {
    const term = search.toLowerCase();
    const filtered = (chats ?? []).filter(c => c.chatName.toLowerCase().includes(term));
    return {
      groups: filter === 'channel' ? [] : filtered.filter(c => c.chatType === 'group' || c.chatType === 'supergroup'),
      channels: filter === 'group' ? [] : filtered.filter(c => c.chatType === 'channel'),
    };
  }, [chats, search, filter]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
    setFilter('all');
  };

  const placeholderText = chatsEmpty
    ? 'בחר מקור...'
    : `בחר מקור... (${totalCounts.groups} קבוצות, ${totalCounts.channels} ערוצים)`;

  const tabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'הכל', count: totalCounts.groups + totalCounts.channels },
    { key: 'group', label: 'קבוצות', count: totalCounts.groups },
    { key: 'channel', label: 'ערוצים', count: totalCounts.channels },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-text-secondary">מקור (צ&apos;אט טלגרם)</label>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className="w-full flex items-center justify-between bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary disabled:opacity-50 outline-none focus:border-amber/50 transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {selected.chatType === 'channel' ? <Rss size={14} className="text-text-muted shrink-0" /> : <MessageSquare size={14} className="text-text-muted shrink-0" />}
                <span className="truncate">{selected.chatName}</span>
                <span className="text-text-muted text-xs shrink-0">
                  ({selected.chatType === 'channel' ? 'ערוץ' : selected.chatType === 'supergroup' ? 'סופר-קבוצה' : 'קבוצה'})
                </span>
              </>
            ) : (
              <span className="text-text-muted">{placeholderText}</span>
            )}
          </span>
          <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-xl max-h-96 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setOpen(false), setSearch(''), setFilter('all'))}
                placeholder="חפש..."
                className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-text-muted hover:text-text-secondary">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex border-b border-border">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                    filter === tab.key
                      ? 'text-amber border-b-2 border-amber'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {tab.label}
                  <span className="mr-1 text-text-muted">({tab.count})</span>
                </button>
              ))}
            </div>

            <div className="overflow-y-auto">
              {value && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className="w-full px-3 py-2 text-sm text-text-muted hover:bg-white/5 text-right"
                >
                  ← נקה בחירה
                </button>
              )}

              {groups.length > 0 && (
                <>
                  {filter === 'all' && (
                    <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-white/3 border-b border-border flex items-center gap-1.5">
                      <MessageSquare size={12} />
                      קבוצות ({groups.length})
                    </div>
                  )}
                  {groups.map(chat => (
                    <button
                      key={chat.chatId}
                      type="button"
                      onClick={() => handleSelect(chat.chatId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 text-right transition-colors ${
                        chat.chatId === value ? 'bg-amber/10 text-amber' : 'text-text-primary'
                      }`}
                    >
                      <MessageSquare size={13} className="text-text-muted shrink-0" />
                      <span className="truncate">{chat.chatName}</span>
                    </button>
                  ))}
                </>
              )}

              {channels.length > 0 && (
                <>
                  {filter === 'all' && (
                    <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-white/3 border-b border-border flex items-center gap-1.5">
                      <Rss size={12} />
                      ערוצים ({channels.length})
                    </div>
                  )}
                  {channels.map(chat => (
                    <button
                      key={chat.chatId}
                      type="button"
                      onClick={() => handleSelect(chat.chatId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 text-right transition-colors ${
                        chat.chatId === value ? 'bg-amber/10 text-amber' : 'text-text-primary'
                      }`}
                    >
                      <Rss size={13} className="text-text-muted shrink-0" />
                      <span className="truncate">{chat.chatName}</span>
                    </button>
                  ))}
                </>
              )}

              {groups.length === 0 && channels.length === 0 && (
                <p className="px-3 py-4 text-sm text-text-muted text-center">
                  {search ? 'לא נמצאו תוצאות' : 'אין צ\u0027אטים'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {chatsEmpty && (
        <div className="bg-base border border-amber/20 rounded-lg p-3 flex gap-2 items-start">
          <span>⚠️</span>
          <div>
            {telegramConnected ? (
              <>
                <p className="text-text-secondary text-xs font-medium">לא נמצאו קבוצות או ערוצים</p>
                <p className="text-text-muted text-xs">
                  הלקוח מחובר אך לא נמצאו צ&apos;אטים — נסה להתנתק ולחבר מחדש.
                </p>
              </>
            ) : (
              <>
                <p className="text-text-secondary text-xs font-medium">לקוח טלגרם לא מחובר</p>
                <p className="text-text-muted text-xs">
                  יש לחבר את חשבון הטלגרם בחלק הראשון של הדף.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
