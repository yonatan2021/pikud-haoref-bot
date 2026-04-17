import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { GlassCard } from '../components/ui/GlassCard';
import { PageTransition } from '../components/ui/PageTransition';

export function Login() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = res.status === 401 ? 'סיסמה שגויה' : 'שגיאת שרת, נסה שוב';
        throw new Error(msg);
      }
      navigate('/overview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-dvh bg-base flex items-center justify-center p-4">
        <GlassCard className="w-full max-w-sm p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber/10 border border-amber/30 mb-4">
              <ShieldCheck size={32} className="text-amber" />
            </div>
            <h1 className="text-xl font-bold text-text-primary">פיקוד העורף — ניהול</h1>
            <p className="text-text-secondary text-sm mt-1">כניסת מנהל מערכת</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="password" className="sr-only">סיסמה</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="סיסמה"
                autoComplete="current-password"
                className="w-full bg-[var(--color-base)] border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-amber transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-amber text-black font-bold py-3 rounded-lg hover:bg-amber-dark disabled:opacity-40 transition-colors"
            >
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>
        </GlassCard>
      </div>
    </PageTransition>
  );
}
