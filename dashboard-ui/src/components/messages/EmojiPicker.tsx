import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

const EMOJI_LIST: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: '🔴', label: 'red circle אדום' },
  { emoji: '🟠', label: 'orange circle כתום' },
  { emoji: '🟡', label: 'yellow circle צהוב' },
  { emoji: '🟢', label: 'green circle ירוק' },
  { emoji: '🔵', label: 'blue circle כחול' },
  { emoji: '🟣', label: 'purple circle סגול' },
  { emoji: '⚫', label: 'black circle שחור' },
  { emoji: '⚪', label: 'white circle לבן' },
  { emoji: '⚠️', label: 'warning אזהרה' },
  { emoji: '❗', label: 'exclamation סימן קריאה' },
  { emoji: '‼️', label: 'double exclamation כפול' },
  { emoji: '🚨', label: 'siren alarm אזעקה צופר' },
  { emoji: '🚧', label: 'construction עבודות' },
  { emoji: '🛑', label: 'stop עצור' },
  { emoji: '⛔', label: 'no entry אסור' },
  { emoji: '🔔', label: 'bell פעמון' },
  { emoji: '📢', label: 'announcement megaphone הודעה' },
  { emoji: '📡', label: 'satellite לוויין' },
  { emoji: '☢️', label: 'radioactive hazmat רדיואקטיבי' },
  { emoji: '☣️', label: 'biohazard ביולוגי' },
  { emoji: '🌊', label: 'tsunami wave צונאמי גל' },
  { emoji: '🌋', label: 'volcano earthquake הר געש' },
  { emoji: '⚡', label: 'lightning ברק' },
  { emoji: '🔥', label: 'fire אש שריפה' },
  { emoji: '💨', label: 'wind רוח' },
  { emoji: '🌀', label: 'cyclone סופה' },
  { emoji: '🛡', label: 'shield security מגן ביטחון' },
  { emoji: '✈️', label: 'airplane aircraft מטוס' },
  { emoji: '🚀', label: 'rocket missile רקטה טיל' },
  { emoji: '💥', label: 'explosion פיצוץ' },
  { emoji: '🧨', label: 'firecracker explosive נפץ' },
  { emoji: '🔶', label: 'orange diamond מעוין כתום' },
  { emoji: '🔷', label: 'blue diamond מעוין כחול' },
  { emoji: '🌍', label: 'earth globe כדור הארץ' },
  { emoji: '🆘', label: 'sos emergency חירום' },
];

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleClickOutside, handleKeyDown]);

  const filtered = search.trim()
    ? EMOJI_LIST.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
    : EMOJI_LIST;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="text-2xl w-10 h-10 rounded-lg bg-surface border border-border
                   hover:border-amber/50 transition-colors flex items-center justify-center"
        title="בחר אמוג׳י"
      >
        {value || '⚠️'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-2 start-0
                       bg-surface border border-border rounded-xl shadow-2xl p-3 w-[280px]"
          >
            <input
              type="text"
              placeholder="חפש אמוג׳י..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-base border border-border rounded-lg px-3 py-1.5
                         text-sm text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-amber/50 mb-2"
              autoFocus
            />
            <div className="grid grid-cols-7 gap-0.5 max-h-[200px] overflow-y-auto">
              {filtered.map(({ emoji }) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onChange(emoji); setOpen(false); }}
                  className="w-8 h-8 flex items-center justify-center rounded-md
                             hover:bg-white/10 transition-colors text-lg"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
              {filtered.length === 0 && (
                <span className="col-span-7 text-text-muted text-sm text-center py-2">
                  לא נמצאו תוצאות
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
