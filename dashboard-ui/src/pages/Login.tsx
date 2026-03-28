import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

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
      if (!res.ok) throw new Error('auth failed');
      navigate('/overview');
    } catch {
      toast.error('סיסמה שגויה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔴</div>
          <h1 className="text-xl font-bold text-text-primary">פיקוד העורף — ניהול</h1>
          <p className="text-text-secondary text-sm mt-1">כניסת מנהל מערכת</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="סיסמה"
            className="w-full bg-base border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-amber transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-amber text-black font-bold py-3 rounded-lg hover:bg-amber-dark disabled:opacity-40 transition-colors"
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );
}
