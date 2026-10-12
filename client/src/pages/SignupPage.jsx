import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth.jsx';
import AuthShell from '../components/AuthShell.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { safeNext } from '../lib/redirect.js';

const labelClass = 'block text-sm font-semibold text-stone-800';

export default function SignupPage() {
  const { user, signup } = useAuth();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Once signed up (or if already logged in), move on. New accounts answer the welcome questions first.
  if (user) return <Navigate to={user.onboardedAt ? next : `/welcome?next=${encodeURIComponent(next)}`} replace />;

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await signup(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Create your TrailCast account"
      subtitle="Share your rides and treks with the map beside them. It's free."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-orange-700 underline">
            Log in
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
            value={form.email}
            onChange={update('email')}
            className="input"
          />
        </label>
        <label className={labelClass}>
          Username
          <input
            required
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_]+"
            autoComplete="username"
            value={form.username}
            onChange={update('username')}
            placeholder="mountain_rider"
            className="input"
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">
            3 to 30 letters, numbers or _. Shown on the trails you add.
          </span>
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            className="input"
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">At least 8 characters.</span>
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
          {saving ? 'Creating your account...' : 'Sign up'}
        </button>
      </form>
    </AuthShell>
  );
}
