import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { safeNext } from '../lib/redirect.js';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2';

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
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Create your TrailCast account</h1>
      <p className="mt-1 text-stone-600">Share your rides and treks with the map beside them.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            className={inputClass}
          />
        </label>
        <label className="block font-medium">
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
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">
            3 to 30 letters, numbers or _. Shown on the trails you add.
          </span>
        </label>
        <label className="block font-medium">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">At least 8 characters.</span>
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Creating your account...' : 'Sign up'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        Already have an account?{' '}
        <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-orange-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
