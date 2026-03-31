import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';
import { LiveDot } from '../components/ui/LiveDot';

interface LandingConfig {
  ga4MeasurementId: string;
  lastDeploy: string | null;
  siteUrl: string;
  githubRepo: string;
  deployStatus: 'deployed' | 'never';
}

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.round(s / 3600)} שע׳`;
  return `לפני ${Math.round(s / 86400)} ימים`;
}

export function LandingPage() {
  const qc = useQueryClient();
  const [ga4Id, setGa4Id] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [deployConfirm, setDeployConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deployState, setDeployState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const deployTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (deployTimerRef.current) clearTimeout(deployTimerRef.current); }, []);

  const { data: config, isError: configError } = useQuery<LandingConfig>({
    queryKey: ['landing-config'],
    queryFn: () => api.get('/api/landing/config'),
  });

  useEffect(() => {
    if (config) {
      setGa4Id(config.ga4MeasurementId);
      setSiteUrl(config.siteUrl);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/api/landing/config', { ga4MeasurementId: ga4Id, siteUrl }),
    onSuccess: () => { toast.success('הגדרות נשמרו'); setDirty(false); qc.invalidateQueries({ queryKey: ['landing-config'] }); },
    onError: () => toast.error('שגיאה בשמירה'),
  });

  const deployMutation = useMutation({
    mutationFn: () => api.post('/api/landing/deploy', {}),
    onMutate: () => setDeployState('loading'),
    onSuccess: () => {
      toast.success('Deploy הופעל בהצלחה');
      qc.invalidateQueries({ queryKey: ['landing-config'] });
      setDeployState('success');
      if (deployTimerRef.current) clearTimeout(deployTimerRef.current);
      deployTimerRef.current = setTimeout(() => setDeployState('idle'), 3000);
    },
    onError: () => {
      toast.error('שגיאה בהפעלת deploy');
      setDeployState('error');
      if (deployTimerRef.current) clearTimeout(deployTimerRef.current);
      deployTimerRef.current = setTimeout(() => setDeployState('idle'), 3000);
    },
    onSettled: () => setDeployConfirm(false),
  });

  if (configError) {
    return (
      <PageTransition>
        <div className="p-8 text-center text-text-muted text-sm">
          שגיאה בטעינת הגדרות — רענן את הדף
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">אתר נחיתה</h1>

        {/* Info callout */}
        <div className="bg-[var(--color-glow-blue)] border border-blue/20 rounded-xl p-4 flex gap-3">
          <span className="text-2xl flex-shrink-0">💡</span>
          <div>
            <h3 className="text-text-primary text-sm font-semibold mb-1">מה זה אתר נחיתה?</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              אתר נחיתה הוא דף ציבורי המציג מידע על הבוט ומאפשר למשתמשים חדשים להצטרף.
              האתר מתארח ב-GitHub Pages ומתעדכן דרך GitHub Actions בכל פרסום.
            </p>
          </div>
        </div>

        {/* GA4 + Form fields */}
        <GlassCard className="p-6">
          <div className="space-y-4">
            <h2 className="font-semibold text-text-primary border-b border-border pb-3">Google Analytics 4</h2>
            <div>
              <label className="text-text-secondary text-sm block mb-1">Measurement ID</label>
              <input
                type="text"
                value={ga4Id}
                onChange={e => { setGa4Id(e.target.value); setDirty(true); }}
                placeholder="G-XXXXXXXXXX"
                className="w-full max-w-xs bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
                dir="ltr"
              />
              <p className="text-text-muted text-xs mt-1">
                מזהה הנכס ב-Google Analytics 4. נמצא ב: Admin &rarr; Property Settings &rarr; Measurement ID. פורמט: G-XXXXXXXXXX
              </p>
            </div>

            <div>
              <label className="text-text-secondary text-sm block mb-1">כתובת האתר</label>
              <input
                type="url"
                value={siteUrl}
                onChange={e => { setSiteUrl(e.target.value); setDirty(true); }}
                placeholder="https://example.github.io/..."
                className="w-full max-w-md bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
                dir="ltr"
              />
              <p className="text-text-muted text-xs mt-1">כתובת GitHub Pages לאחר פרסום ראשון</p>
              {siteUrl ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-green mt-1.5">
                  <LiveDot color="green" />
                  האתר פעיל
                  <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline inline-flex items-center gap-0.5">
                    פתח <ExternalLink className="w-3 h-3" />
                  </a>
                </span>
              ) : (
                <span className="text-text-muted text-xs mt-1.5 block">הכנס כתובת לאחר פרסום ראשון</span>
              )}
            </div>

            <button
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="px-6 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg disabled:opacity-40 transition-colors"
            >
              {saveMutation.isPending ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </GlassCard>

        {/* Deploy */}
        <GlassCard className="p-6">
          <h2 className="font-semibold text-text-primary border-b border-border pb-3 mb-4">Deploy לאתר</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-text-secondary text-sm">Deploy אחרון</p>
              <p className="text-text-muted text-xs mt-0.5">
                {config?.lastDeploy ? relTime(config.lastDeploy) : 'לא בוצע deploy'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {config?.githubRepo && (
                <a
                  href={`https://github.com/${config.githubRepo}/actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted text-xs hover:text-blue flex items-center gap-1"
                >
                  GitHub Actions <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue text-sm hover:underline"
                >
                  🔗 פתח אתר ↗
                </a>
              )}
            </div>
          </div>

          {!deployConfirm ? (
            <button
              disabled={deployState === 'loading' || deployMutation.isPending}
              onClick={() => setDeployConfirm(true)}
              className={`px-6 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 min-w-[150px] justify-center disabled:opacity-60 ${
                deployState === 'success'
                  ? 'bg-green text-white'
                  : deployState === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-amber hover:bg-amber-dark text-black'
              }`}
            >
              <AnimatePresence mode="wait">
                {deployState === 'idle' && (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <Rocket className="w-4 h-4" />
                    פרסם
                  </motion.span>
                )}
                {deployState === 'loading' && (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    מפרסם...
                  </motion.span>
                )}
                {deployState === 'success' && (
                  <motion.span
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    פורסם!
                  </motion.span>
                )}
                {deployState === 'error' && (
                  <motion.span
                    key="error"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    שגיאה
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-base border border-amber/30 rounded-xl p-4">
              <p className="text-text-secondary text-sm flex-1">
                הפעלת deploy תטריגר workflow <code className="bg-white/10 px-1 rounded text-xs">deploy-landing.yml</code>
                {config?.githubRepo && <> ב-<span className="text-amber" dir="ltr">{config.githubRepo}</span></>}.
                {' '}הפרסום ייקח בדרך כלל 1–3 דקות.
              </p>
              <button
                disabled={deployMutation.isPending}
                onClick={() => deployMutation.mutate()}
                className="px-4 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg disabled:opacity-40"
              >
                {deployMutation.isPending ? 'מפעיל...' : 'אישור'}
              </button>
              <button
                onClick={() => setDeployConfirm(false)}
                className="px-4 py-2 border border-border rounded-lg text-sm text-text-secondary hover:bg-surface"
              >
                ביטול
              </button>
            </div>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  );
}
