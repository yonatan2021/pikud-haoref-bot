import { useState, useCallback, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { PageTransition } from '../components/ui';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusOverviewBar } from '../components/messages/StatusOverviewBar';
import { CategorySection } from '../components/messages/CategorySection';
import { SimulationPanel } from '../components/messages/SimulationPanel';
import { SystemMessagePanel } from '../components/messages/SystemMessagePanel';
import { RoutingSection } from '../components/messages/RoutingSection';
import { TemplateBodyEditor } from '../components/messages/TemplateBodyEditor';
import { DmTemplatesPanel } from '../components/messages/DmTemplatesPanel';
import type { TemplateEntry, TemplateEdit } from '../components/messages/TemplateRow';
import { ORDERED_CATEGORIES, ALERT_TYPE_CATEGORY } from '../utils/categoryConfig';
import type { AlertCategory } from '../utils/categoryConfig';
import { api } from '../api/client';

interface ImportRow {
  alertType: string;
  emoji: string;
  titleHe: string;
  instructionsPrefix: string;
}

export default function Messages() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [edits, setEdits] = useState<Record<string, Partial<TemplateEdit>>>({});
  const [simulationTarget, setSimulationTarget] = useState<TemplateEntry | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportRow[] | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'simulation' | 'system'>('simulation');
  const [mainTab, setMainTab] = useState<'types' | 'editor' | 'routing' | 'dm'>('types');

  // Fetch all template entries
  const { data: templates = [] } = useQuery<TemplateEntry[]>({
    queryKey: ['messages'],
    queryFn: () => api.get<TemplateEntry[]>('/api/messages'),
  });

  // Group templates by category
  const groupedEntries: Record<AlertCategory, TemplateEntry[]> = {
    security: [], nature: [], environmental: [], drills: [], general: [], whatsapp: [],
  };
  for (const entry of templates) {
    const cat = ALERT_TYPE_CATEGORY[entry.alertType] ?? 'general';
    groupedEntries[cat].push(entry);
  }

  // Save mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(edits);
      if (entries.length === 0) return;
      await Promise.all(
        entries.map(([alertType, fields]) =>
          api.patch(`/api/messages/${alertType}`, fields),
        ),
      );
    },
    onSuccess: () => {
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('תבניות נשמרו');
    },
    onError: (err) => toast.error(`שגיאה בשמירה: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  // Reset single type
  const resetMutation = useMutation({
    mutationFn: (alertType: string) => api.delete(`/api/messages/${alertType}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }),
    onError: (err) => toast.error(`שגיאה באיפוס: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  // Reset all customized
  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const customized = templates.filter((t) => t.isCustomized);
      await Promise.all(customized.map((t) => api.delete(`/api/messages/${t.alertType}`)));
    },
    onSuccess: () => {
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('כל התבניות אופסו');
    },
    onError: (err) => toast.error(`שגיאה באיפוס: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (rows: ImportRow[]) =>
      api.post<{ ok: boolean; count: number }>('/api/messages/import', { templates: rows }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setPendingImport(null);
      setImportModalOpen(false);
      toast.success(`יובאו ${data.count} תבניות`);
    },
    onError: (err) => toast.error(`שגיאה בייבוא: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`),
  });

  // Field change handler
  const handleFieldChange = useCallback(
    (alertType: string, field: keyof TemplateEdit, value: string) => {
      setEdits((prev) => ({
        ...prev,
        [alertType]: { ...prev[alertType], [field]: value },
      }));
    },
    [],
  );

  // Reset single template
  const handleReset = useCallback(
    (alertType: string) => {
      setEdits((prev) => {
        const { [alertType]: _, ...rest } = prev;
        return rest;
      });
      resetMutation.mutate(alertType);
    },
    [resetMutation],
  );

  // Reset all templates in a category
  const handleResetCategory = useCallback(
    (category: AlertCategory) => {
      const typesInCategory = groupedEntries[category]
        .filter((e) => e.isCustomized)
        .map((e) => e.alertType);
      for (const t of typesInCategory) {
        resetMutation.mutate(t);
      }
      setEdits((prev) => {
        const next = { ...prev };
        for (const t of groupedEntries[category].map((e) => e.alertType)) {
          delete next[t];
        }
        return next;
      });
    },
    [groupedEntries, resetMutation],
  );

  // Simulate — set target for SimulationPanel
  const handleSimulate = useCallback(
    (alertType: string) => {
      const entry = templates.find((t) => t.alertType === alertType);
      if (entry) setSimulationTarget(entry);
    },
    [templates],
  );

  // Export templates
  const handleExport = useCallback(async () => {
    try {
      const data = await api.get<{ templates: ImportRow[] }>('/api/messages/export');
      const blob = new Blob([JSON.stringify(data.templates, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'templates-export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ייצוא הושלם');
    } catch (err) {
      toast.error(`שגיאה בייצוא: ${err instanceof Error ? err.message : 'פעולה נכשלה'}`);
    }
  }, []);

  // Import — file select handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const rows = Array.isArray(parsed) ? parsed : parsed.templates;
        if (!Array.isArray(rows)) {
          toast.error('קובץ לא תקין — צפוי מערך תבניות');
          return;
        }
        setPendingImport(rows);
        setImportModalOpen(true);
      } catch {
        toast.error('קובץ JSON לא תקין');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, []);

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MessageSquare size={22} className="text-[var(--color-tg)] flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary leading-tight">תבניות הודעות</h1>
              <p className="text-sm text-text-muted mt-0.5">עריכת תוכן ועיצוב ההתראות לכל סוג</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="text-xs px-3 py-1.5 rounded-lg border border-border
                         text-text-muted hover:text-text-primary hover:border-border
                         transition-colors"
            >
              ⬇ ייצוא
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1.5 rounded-lg border border-border
                         text-text-muted hover:text-text-primary hover:border-border
                         transition-colors"
            >
              ⬆ ייבוא
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Save button */}
            <AnimatePresence mode="wait">
              {hasEdits && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="text-sm px-4 py-1.5 rounded-lg bg-amber text-base font-medium
                             hover:bg-amber-dark transition-colors disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'שומר...' : 'שמור שינויים'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Status overview */}
        <StatusOverviewBar
          templates={templates}
          edits={edits}
          onResetAll={() => resetAllMutation.mutate()}
        />

        {/* Main content tabs */}
        <div className="flex gap-1 mb-4" role="tablist">
          {([
            ['types', 'סוגי התראות'] as const,
            ['editor', 'עורך תבנית'] as const,
            ['routing', 'ניתוב'] as const,
            ['dm', 'הודעות DM'] as const,
          ]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mainTab === key}
              onClick={() => setMainTab(key)}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                mainTab === key
                  ? 'bg-amber/15 text-amber font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Split layout: main tab + simulation */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* Left column: active tab content */}
          <div className="space-y-4">
            {mainTab === 'types' && ORDERED_CATEGORIES.map((category) => (
              <CategorySection
                key={category}
                category={category}
                entries={groupedEntries[category]}
                edits={edits}
                onFieldChange={handleFieldChange}
                onReset={handleReset}
                onResetCategory={handleResetCategory}
                onSimulate={handleSimulate}
              />
            ))}
            {mainTab === 'editor' && <TemplateBodyEditor templates={templates} />}
            {mainTab === 'routing' && <RoutingSection />}
            {mainTab === 'dm' && <DmTemplatesPanel />}
          </div>

          {/* Right column: simulation / system message (sticky) */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
            {/* Tab toggle */}
            <div className="flex gap-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === 'simulation'}
                onClick={() => setRightPanelTab('simulation')}
                className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                  rightPanelTab === 'simulation'
                    ? 'bg-amber/15 text-amber font-medium'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                🔬 סימולציה
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === 'system'}
                onClick={() => setRightPanelTab('system')}
                className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                  rightPanelTab === 'system'
                    ? 'bg-amber/15 text-amber font-medium'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                📢 הודעת מערכת
              </button>
            </div>

            {/* Active panel */}
            {rightPanelTab === 'simulation' ? (
              <SimulationPanel
                targetEntry={
                  simulationTarget
                    ? { ...simulationTarget, localEdits: edits[simulationTarget.alertType] }
                    : null
                }
                allEntries={templates}
              />
            ) : (
              <SystemMessagePanel />
            )}
          </div>
        </div>
      </div>

      {/* Import confirm modal */}
      <ConfirmModal
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setPendingImport(null); }}
        onConfirm={() => { if (pendingImport) importMutation.mutate(pendingImport); }}
        title="ייבוא תבניות"
        description={`האם לייבא ${pendingImport?.length ?? 0} תבניות? תבניות קיימות יידרסו.`}
      />
    </PageTransition>
  );
}
