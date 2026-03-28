import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client';

interface LandingConfig {
  ga4MeasurementId: string;
  lastDeploy: string | null;
  siteUrl: string;
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

  const { data: config } = useQuery<LandingConfig>({
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
    onSuccess: () => { toast.success('Deploy הופעל בהצלחה'); setDeployConfirm(false); qc.invalidateQueries({ queryKey: ['landing-config'] }); },
    onError: () => { toast.error('שגיאה בהפעלת deploy'); setDeployConfirm(false); },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">אתר נחיתה</h1>

      {/* GA4 */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-text-primary border-b border-border pb-3">Google Analytics 4</h2>
        <div>
          <label className="text-text-secondary text-sm block mb-1">Measurement ID</label>
          <input
            type="text"
            value={ga4Id}
            onChange={e => { setGa4Id(e.target.value); setDirty(true); }}
            placeholder="G-XXXXXXXXXX"
            className="w-full max-w-xs bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
          />
          <p className="text-text-muted text-xs mt-1">יוזרק לאתר בdeploy הבא</p>
        </div>

        <div>
          <label className="text-text-secondary text-sm block mb-1">כתובת האתר</label>
          <input
            type="url"
            value={siteUrl}
            onChange={e => { setSiteUrl(e.target.value); setDirty(true); }}
            placeholder="https://example.github.io/..."
            className="w-full max-w-md bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-amber"
          />
        </div>

        <button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="px-6 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg disabled:opacity-40 transition-colors"
        >
          {saveMutation.isPending ? 'שומר...' : 'שמור'}
        </button>
      </div>

      {/* Deploy */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="font-semibold text-text-primary border-b border-border pb-3 mb-4">Deploy לאתר</h2>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-text-secondary text-sm">Deploy אחרון</p>
            <p className="text-text-muted text-xs mt-0.5">
              {config?.lastDeploy ? relTime(config.lastDeploy) : 'לא בוצע deploy'}
            </p>
          </div>
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

        {!deployConfirm ? (
          <button
            onClick={() => setDeployConfirm(true)}
            className="px-6 py-2 bg-amber hover:bg-amber-dark text-black text-sm font-bold rounded-lg"
          >
            🚀 Deploy עכשיו
          </button>
        ) : (
          <div className="flex items-center gap-3 bg-base border border-amber/30 rounded-xl p-4">
            <p className="text-text-secondary text-sm flex-1">האם להפעיל GitHub Actions deploy?</p>
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
      </div>
    </div>
  );
}
