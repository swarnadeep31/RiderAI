import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth.jsx';
import AuthShell from '../components/AuthShell.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { safeNext } from '../lib/redirect.js';

const labelClass = 'block text-sm font-semibold text-stone-800';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Once logged in, move on. Someone who skipped the welcome questions answers them first.
  if (user) return <Navigate to={user.onboardedAt ? next : `/welcome?next=${encodeURIComponent(next)}`} replace />;

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Log in to TrailCast"
      subtitle="Welcome back! Your trails are right where you left them."
      footer={
        <>
          New to TrailCast?{' '}
          <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-orange-700 underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className={labelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
          {saving ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  );
}
