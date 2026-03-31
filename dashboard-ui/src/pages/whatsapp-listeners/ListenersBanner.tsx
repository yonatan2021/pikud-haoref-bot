export function ListenersBanner() {
  return (
    <div className="bg-[var(--color-glow-amber)] border border-amber/20 rounded-xl p-4 flex gap-3">
      <span className="text-2xl flex-shrink-0">🔄</span>
      <div>
        <h3 className="text-text-primary text-sm font-semibold mb-1">מה זה כלל האזנה?</h3>
        <p className="text-text-muted text-xs leading-relaxed">
          כל כלל מגדיר מקור WhatsApp (קבוצה או ערוץ) ומעביר הודעות תואמות לטלגרם.
          ניתן לסנן לפי מילות מפתח ולנתב לנושא ספציפי בקבוצת הטלגרם.
        </p>
      </div>
    </div>
  );
}
