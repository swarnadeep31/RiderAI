import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth.jsx';
import AuthShell from '../components/AuthShell.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import WayInField from '../components/WayInField.jsx';
import { safeNext } from '../lib/redirect.js';
import { useToast } from '../notices.jsx';

const labelClass = 'block text-sm font-semibold text-stone-800';

export default function SignupPage() {
  const { user, signup, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  // The email or phone number carried over from the log-in page, if any (never in the address bar).
  const carried = useLocation().state ?? {};
  const next = safeNext(searchParams.get('next'));
  const [method, setMethod] = useState(carried.method ?? 'email');
  const [form, setForm] = useState({ name: '', identifier: carried.value ?? '', password: '' });
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
      await signup({ name: form.name, [method]: form.identifier, password: form.password });
      toast('Your account is ready. Welcome to TrailCast!');
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  // With Google there's nothing to type: an account that's already there just logs in, and says so.
  async function withGoogle(credential) {
    setError(null);
    try {
      const { user: loggedIn, existing, passwordRemoved } = await loginWithGoogle(credential);
      // The account was made with a password before: Google now replaces it.
      if (passwordRemoved) toast('Your Google account is now linked. From now on, log in with Google.');
      else
        toast(
          existing
            ? `You already have an account, ${loggedIn.name?.split(' ')[0] ?? 'rider'}, so we logged you in.`
            : 'Your account is ready. Welcome to TrailCast!',
        );
    } catch (err) {
      setError(err);
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
      <div className="mt-6 space-y-4">
        <GoogleButton text="signup_with" onCredential={withGoogle} onError={(message) => setError(new Error(message))} />
        <form onSubmit={submit} className="space-y-4">
          <label className={labelClass}>
            Your name
            <input required maxLength={60} autoComplete="name" value={form.name} onChange={update('name')} placeholder="Your full name" className="input" />
            <span className="mt-1 block text-sm font-normal text-stone-500">Shown on your profile.</span>
          </label>
          <WayInField
            method={method}
            onMethod={(value) => {
              setMethod(value);
              setForm({ ...form, identifier: '' });
              setError(null);
            }}
            value={form.identifier}
            onChange={(value) => setForm({ ...form, identifier: value })}
            newAccount
          />
          <label className={labelClass}>
            Password
            <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={update('password')} className="input" />
            <span className="mt-1 block text-sm font-normal text-stone-500">At least 8 characters.</span>
          </label>

          {error && (
            <ErrorMessage>
              {error.message}
              {error.code === 'exists' && (
                <Link
                  to={`/login?next=${encodeURIComponent(next)}`}
                  state={{ method, value: form.identifier }}
                  className="mt-2 block font-semibold underline"
                >
                  Log in instead →
                </Link>
              )}
            </ErrorMessage>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
            {saving ? 'Creating your account...' : 'Sign up'}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
