export function KeywordHelp() {
  return (
    <div className="bg-base border border-border rounded-lg p-3 text-xs text-text-muted space-y-1.5">
      <p className="font-medium text-text-secondary">כיצד מילות מפתח עובדות:</p>
      <ul className="space-y-1 list-disc list-inside">
        <li>מספר מילים = OR — מספיק שאחת מהן תופיע בהודעה</li>
        <li>ריק = כל הודעה מהמקור מועברת אוטומטית</li>
        <li>חיפוש case-insensitive (לא תלוי באותיות גדולות/קטנות)</li>
      </ul>
      <div className="flex gap-2 flex-wrap mt-2 items-center">
        <span className="px-2 py-0.5 rounded-full bg-[var(--color-glow-amber)] border border-amber/30 text-amber">חירום</span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--color-glow-amber)] border border-amber/30 text-amber">פיקוד העורף</span>
        <span className="text-text-muted">&larr; הודעה תועבר אם תכיל אחת מהמילים</span>
      </div>
    </div>
  );
}
