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

export default function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  // The email or phone number carried over from the sign-up page, if any (never in the address bar).
  const carried = useLocation().state ?? {};
  const next = safeNext(searchParams.get('next'));
  const [method, setMethod] = useState(carried.method ?? 'email');
  const [identifier, setIdentifier] = useState(carried.value ?? '');
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
      const loggedIn = await login({ [method]: identifier, password });
      toast(`Welcome back${loggedIn.name ? `, ${loggedIn.name.split(' ')[0]}` : ''}!`);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function withGoogle(credential) {
    setError(null);
    try {
      const { user: loggedIn, existing } = await loginWithGoogle(credential);
      toast(existing ? `Welcome back, ${loggedIn.name?.split(' ')[0] ?? 'rider'}!` : 'Your account is ready. Welcome to TrailCast!');
    } catch (err) {
      setError(err);
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
      <div className="mt-6 space-y-4">
        <GoogleButton text="signin_with" onCredential={withGoogle} onError={(message) => setError(new Error(message))} />
        <form onSubmit={submit} className="space-y-4">
          <WayInField
            method={method}
            onMethod={(value) => {
              setMethod(value);
              setIdentifier('');
              setError(null);
            }}
            value={identifier}
            onChange={setIdentifier}
          />
          <label className={labelClass}>
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>

          {error && (
            <ErrorMessage>
              {error.message}
              {error.code === 'not_found' && (
                <Link
                  to={`/signup?next=${encodeURIComponent(next)}`}
                  state={{ method, value: identifier }}
                  className="mt-2 block font-semibold underline"
                >
                  Sign up instead →
                </Link>
              )}
            </ErrorMessage>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-base">
            {saving ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
