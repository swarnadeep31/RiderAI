import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { safeNext } from '../lib/redirect.js';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2';

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
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Log in to TrailCast</h1>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        New to TrailCast?{' '}
        <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-orange-700 underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
