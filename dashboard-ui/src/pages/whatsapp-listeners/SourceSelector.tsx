import { MessageSquare, Rss } from 'lucide-react';

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

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-text-secondary">מקור (צ&apos;אט WhatsApp)</label>
      <div className="relative">
        {selected && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {selected.type === 'newsletter' ? <Rss size={14} /> : <MessageSquare size={14} />}
          </span>
        )}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full bg-base border border-border rounded-lg py-2 text-sm text-text-primary disabled:opacity-50 outline-none focus:border-amber/50 transition-colors ${
            selected ? 'px-9' : 'px-3'
          }`}
        >
          <option value="">בחר מקור...</option>
          {chats?.map(chat => (
            <option key={chat.id} value={chat.id}>
              {chat.name} ({chat.type === 'group' ? 'קבוצה' : 'ערוץ'})
            </option>
          ))}
        </select>
      </div>
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
