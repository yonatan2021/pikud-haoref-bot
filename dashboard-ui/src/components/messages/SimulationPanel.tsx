import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '../ui/GlassCard';
import { CityMultiSelect } from './CityMultiSelect';
import { TelegramBubblePreview } from './TelegramBubblePreview';
import type { CityResult } from './CityMultiSelect';
import type { TemplateEntry, TemplateEdit } from './TemplateRow';
import { formatAlertMessageFE, type CityData } from '../../utils/alertFormatter';
import { api } from '../../api/client';

interface ReplayEntry {
  id: number;
  type: string;
  cities: string[];
  instructions?: string;
  fired_at: string;
  titleHe: string;
}

interface SimulationPanelProps {
  targetEntry: (TemplateEntry & { localEdits?: Partial<TemplateEdit> }) | null;
  allEntries: TemplateEntry[];
}

export function SimulationPanel({ targetEntry }: SimulationPanelProps) {
  const [selectedCities, setSelectedCities] = useState<CityResult[]>([]);
  const [instructions, setInstructions] = useState('');
  const [selectedReplayId, setSelectedReplayId] = useState<number | null>(null);

  // Replay history dropdown data
  const { data: replayHistory = [] } = useQuery<ReplayEntry[]>({
    queryKey: ['replay-history'],
    queryFn: () => api.get<ReplayEntry[]>('/api/messages/replay-history'),
  });

  // Build cityDataMap from selected cities
  const cityDataMap = useMemo(() => {
    const map = new Map<string, CityData>();
    for (const city of selectedCities) {
      map.set(city.name, {
        name: city.name,
        zone: city.zone,
        countdown: city.countdown,
      });
    }
    return map;
  }, [selectedCities]);

  // Build merged template values
  const mergedTemplate = useMemo(() => {
    if (!targetEntry) return null;
    return {
      emoji: targetEntry.localEdits?.emoji ?? targetEntry.emoji,
      titleHe: targetEntry.localEdits?.titleHe ?? targetEntry.titleHe,
      instructionsPrefix:
        targetEntry.localEdits?.instructionsPrefix ?? targetEntry.instructionsPrefix,
    };
  }, [targetEntry]);

  // Generate preview HTML
  const previewHtml = useMemo(() => {
    if (!mergedTemplate || selectedCities.length === 0) return '';
    return formatAlertMessageFE(
      selectedCities.map((c) => c.name),
      instructions || undefined,
      mergedTemplate,
      cityDataMap,
    );
  }, [mergedTemplate, selectedCities, instructions, cityDataMap]);

  // Replay preview — fetches pre-rendered HTML from backend
  const replayPreviewMutation = useMutation({
    mutationFn: (alertHistoryId: number) =>
      api.post<{ html: string; charCount: number }>('/api/messages/replay-preview', {
        alertHistoryId,
        templateOverride: mergedTemplate ?? undefined,
      }),
  });

  // Test-fire mutation
  const testFireMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; messageId: number }>('/api/messages/test-fire', {
        alertType: targetEntry?.alertType,
        cities: selectedCities.map((c) => c.name),
        instructions: instructions || undefined,
        templateOverride: mergedTemplate ?? undefined,
      }),
  });

  const handleReplaySelect = (replayId: string) => {
    const id = parseInt(replayId, 10);
    if (isNaN(id)) {
      setSelectedReplayId(null);
      return;
    }
    setSelectedReplayId(id);
    replayPreviewMutation.mutate(id);
  };

  // Determine what HTML to show — live preview or replay
  const displayHtml = replayPreviewMutation.data?.html ?? previewHtml;
  const displayCharCount = replayPreviewMutation.data?.charCount ?? previewHtml.length;

  return (
    <GlassCard glow="blue">
      <h3 className="text-base font-medium text-text-primary mb-3">🔬 סימולציה ובדיקה</h3>

      {/* Target info */}
      {targetEntry ? (
        <div className="text-sm text-text-secondary mb-3">
          סוג: <span className="text-text-primary font-medium">
            {mergedTemplate?.emoji} {mergedTemplate?.titleHe}
          </span>
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-3">
          לחץ על 👁 ליד סוג התראה לבחירה
        </p>
      )}

      {/* City multi-select */}
      <div className="mb-3">
        <CityMultiSelect
          selected={selectedCities}
          onChange={setSelectedCities}
        />
      </div>

      {/* Instructions input */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-1">הוראות (אופציונלי)</label>
        <input
          type="text"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="היכנסו מיידית למרחב המוגן"
          className="w-full bg-base border border-border rounded-lg px-3 py-2
                     text-sm text-text-primary placeholder:text-text-muted
                     focus:outline-none focus:border-blue/50"
        />
      </div>

      {/* Preview */}
      <div className="mb-3">
        <TelegramBubblePreview html={displayHtml} charCount={displayCharCount} />
      </div>

      {/* Replay dropdown */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-1">שחזור התראה היסטורית</label>
        <select
          value={selectedReplayId ?? ''}
          onChange={(e) => handleReplaySelect(e.target.value)}
          className="w-full bg-base border border-border rounded-lg px-3 py-2
                     text-sm text-text-primary
                     focus:outline-none focus:border-blue/50"
        >
          <option value="">בחר התראה...</option>
          {replayHistory.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.titleHe} — {entry.cities.length} ערים —{' '}
              {new Date(entry.fired_at).toLocaleDateString('he-IL', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </option>
          ))}
        </select>
      </div>

      {/* Test fire button */}
      {targetEntry && (
        <div>
          <button
            type="button"
            onClick={() => testFireMutation.mutate()}
            disabled={
              testFireMutation.isPending ||
              selectedCities.length === 0
            }
            className="w-full py-2 rounded-lg text-sm font-medium
                       bg-blue/20 text-blue hover:bg-blue/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {testFireMutation.isPending ? 'שולח...' : '🧪 שלח בדיקה לטלגרם'}
          </button>
          <p className="text-[10px] text-text-muted mt-1 text-center">
            ההודעה תישלח ללא מפה
          </p>

          {/* Test-fire result */}
          <AnimatePresence>
            {testFireMutation.isSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 p-2 bg-green/10 border border-green/20 rounded-lg text-xs text-green text-center"
              >
                נשלח בהצלחה — message #{testFireMutation.data?.messageId}
              </motion.div>
            )}
            {testFireMutation.isError && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 text-center"
              >
                שגיאה: {String(testFireMutation.error)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </GlassCard>
  );
}
