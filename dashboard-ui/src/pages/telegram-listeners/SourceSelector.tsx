import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, ChevronDown, Search, X, RefreshCw, Hash } from 'lucide-react';

export interface TelegramKnownChat {
  chatId: string;
  chatName: string;
  chatType: string;
  isForum: boolean;
  updatedAt: string;
}

export interface TelegramKnownTopic {
  topicId: number;
  chatId: string;
  topicName: string;
  updatedAt: string;
}

interface SourceSelectorProps {
  chats: TelegramKnownChat[] | undefined;
  topics: TelegramKnownTopic[] | undefined;
  value: string;
  sourceTopicId: number | null;
  onChangeChatId: (chatId: string) => void;
  onChangeTopicId: (topicId: number | null) => void;
  disabled: boolean;
  telegramConnected?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function SourceSelector({
  chats,
  topics,
  value,
  sourceTopicId,
  onChangeChatId,
  onChangeTopicId,
  disabled,
  telegramConnected,
  onRefresh,
  refreshing,
}: SourceSelectorProps) {
  const chatsEmpty = !chats || chats.length === 0;
  const selected = chats?.find(c => c.chatId === value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isForum = selected?.isForum ?? false;

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

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filteredChats = useMemo(() => {
    const term = search.toLowerCase();
    return (chats ?? []).filter(c => c.chatName.toLowerCase().includes(term));
  }, [chats, search]);

  const chatCount = chats?.length ?? 0;

  const placeholderText = chatsEmpty
    ? 'בחר מקור...'
    : `בחר מקור... (${chatCount} קבוצות)`;

  const handleSelectChat = (id: string) => {
    onChangeChatId(id);
    onChangeTopicId(null);
    setOpen(false);
    setSearch('');
  };

  const selectedTopicName = topics?.find(t => t.topicId === sourceTopicId)?.topicName;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-secondary">מקור (קבוצת טלגרם)</label>
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
                  <MessageSquare size={14} className="text-text-muted shrink-0" />
                  <span className="truncate">{selected.chatName}</span>
                  {selected.isForum && (
                    <span className="text-xs shrink-0 bg-amber/10 border border-amber/20 text-amber rounded px-1">
                      פורום
                    </span>
                  )}
                </>
              ) : (
                <span className="text-text-muted">{placeholderText}</span>
              )}
            </span>
            <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-xl max-h-80 flex flex-col overflow-hidden">
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

              <div className="overflow-y-auto">
                {value && (
                  <button
                    type="button"
                    onClick={() => handleSelectChat('')}
                    className="w-full px-3 py-2 text-sm text-text-muted hover:bg-white/5 text-right"
                  >
                    ← נקה בחירה
                  </button>
                )}

                {filteredChats.length > 0 ? (
                  filteredChats.map(chat => (
                    <button
                      key={chat.chatId}
                      type="button"
                      onClick={() => handleSelectChat(chat.chatId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 text-right transition-colors ${
                        chat.chatId === value ? 'bg-amber/10 text-amber' : 'text-text-primary'
                      }`}
                    >
                      <MessageSquare size={13} className="text-text-muted shrink-0" />
                      <span className="truncate flex-1">{chat.chatName}</span>
                      {chat.isForum && (
                        <span className="text-xs shrink-0 bg-amber/10 border border-amber/20 text-amber rounded px-1">
                          פורום
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-text-muted text-center">
                    {search ? 'לא נמצאו תוצאות' : 'אין קבוצות'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Topic selector — only shown when a forum group is selected */}
      {value && isForum && (
        <div className="flex flex-col gap-1.5 pr-4 border-r-2 border-amber/30">
          <label className="text-sm text-text-secondary flex items-center gap-1.5">
            <Hash size={12} className="text-amber" />
            נושא (אופציונלי)
          </label>
          <select
            value={sourceTopicId ?? ''}
            onChange={e => {
              const val = e.target.value;
              onChangeTopicId(val ? Number(val) : null);
            }}
            disabled={disabled}
            className="bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-amber/50 transition-colors disabled:opacity-50"
          >
            <option value="">כל הנושאים</option>
            {(topics ?? []).map(t => (
              <option key={t.topicId} value={t.topicId}>
                {t.topicName}
              </option>
            ))}
          </select>
          {sourceTopicId !== null && selectedTopicName && (
            <p className="text-text-muted text-xs">
              מאזין רק לנושא: <span className="text-amber">{selectedTopicName}</span>
            </p>
          )}
          {(!topics || topics.length === 0) && (
            <p className="text-text-muted text-xs">לא נמצאו נושאים עבור קבוצה זו</p>
          )}
        </div>
      )}

      {chatsEmpty && (
        <div className="bg-base border border-amber/20 rounded-lg p-3 flex gap-2 items-start">
          <span>⚠️</span>
          <div className="flex-1">
            {telegramConnected ? (
              <>
                <p className="text-text-secondary text-xs font-medium">לא נמצאו קבוצות</p>
                <p className="text-text-muted text-xs mb-2">
                  הלקוח מחובר אך לא נמצאו קבוצות — לחץ רענן או התנתק וחבר מחדש.
                </p>
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber/10 border border-amber/30 text-amber text-xs rounded-lg hover:bg-amber/20 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'מרענן...' : 'רענן קבוצות'}
                  </button>
                )}
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
