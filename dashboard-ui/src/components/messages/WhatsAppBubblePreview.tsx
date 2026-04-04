import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { CharCountBar } from './CharCountBar';

interface WhatsAppBubblePreviewProps {
  text: string;
  charCount: number;
}

export function WhatsAppBubblePreview({ text, charCount }: WhatsAppBubblePreviewProps) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('הועתק ללוח'),
      () => toast.error('שגיאה בהעתקה'),
    );
  }, [text]);

  const isEmpty = text.trim() === '';

  return (
    <div className="max-w-[340px] mx-auto">
      {/* Phone frame */}
      <div className="bg-[#1c1c1e] rounded-[2rem] p-4 shadow-2xl border border-white/10">
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber" />
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
          <span className="text-[10px] text-white/40 font-mono">WhatsApp</span>
        </div>

        {/* Chat area */}
        <div className="bg-[#0b141a] rounded-2xl p-3 min-h-[140px] flex flex-col justify-end relative">
          {/* Copy button */}
          {!isEmpty && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center
                         rounded text-white/30 hover:text-white/70 hover:bg-white/10
                         transition-colors text-xs"
              title="העתק טקסט"
            >
              📋
            </button>
          )}
          {isEmpty ? (
            <p className="text-text-muted text-sm text-center py-8">
              בחר סוג התראה וערים לתצוגה מקדימה
            </p>
          ) : (
            <div
              className="bg-[#005c4b] rounded-[1rem_1rem_0.25rem_1rem] p-3
                         max-w-[280px] ms-auto"
              dir="ltr"
            >
              {/* Plain text — exactly what the recipient sees on their phone.
                  No HTML rendering: *bold* asterisks appear as literal characters. */}
              <pre
                className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap
                           font-sans m-0"
              >
                {text}
              </pre>
              <div className="text-[10px] text-white/30 text-end mt-1">
                {new Date().toLocaleTimeString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
                {' ✓✓'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Character count bar — WhatsApp limit is 4096 chars */}
      <CharCountBar charCount={charCount} max={4096} />
    </div>
  );
}
