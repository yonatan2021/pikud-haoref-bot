import { useCallback } from 'react';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';
import { CharCountBar } from './CharCountBar';

interface TelegramBubblePreviewProps {
  html: string;
  charCount: number;
}

export function TelegramBubblePreview({ html, charCount }: TelegramBubblePreviewProps) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(html).then(
      () => toast.success('הועתק ללוח'),
      () => toast.error('שגיאה בהעתקה'),
    );
  }, [html]);
  // Sanitize with DOMPurify — only Telegram-safe tags allowed, no attributes
  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'code', 's', 'u'],
    ALLOWED_ATTR: [],
  });

  const isEmpty = html.trim() === '';

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
          <span className="text-[10px] text-white/40 font-mono">Telegram</span>
        </div>

        {/* Chat area */}
        <div className="bg-[#0d1117] rounded-2xl p-3 min-h-[140px] flex flex-col justify-end relative">
          {/* Copy button */}
          {!isEmpty && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center
                         rounded text-white/30 hover:text-white/70 hover:bg-white/10
                         transition-colors text-xs"
              title="העתק HTML"
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
              className="bg-[#1f3a5f] rounded-[1rem_1rem_0.25rem_1rem] p-3
                         max-w-[280px] ms-auto"
              dir="ltr"
            >
              {/* Safe: safeHtml is sanitized via DOMPurify above with strict ALLOWED_TAGS */}
              <div
                className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap
                           [&>b]:font-bold [&>i]:italic [&>code]:font-mono
                           [&>code]:bg-white/10 [&>code]:px-1 [&>code]:rounded"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
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

      {/* Character count bar */}
      <CharCountBar charCount={charCount} />
    </div>
  );
}
