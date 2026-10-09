import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { INTERESTS, REFERRAL_SOURCES } from '../lib/onboarding.js';
import { safeNext } from '../lib/redirect.js';

// The questions a new user answers once, right after signing up. Only the
// first one is required. Also used to change the answers later.
export default function WelcomePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [interests, setInterests] = useState(user.interests ?? []);
  const [referralSource, setReferralSource] = useState(user.referralSource ?? '');
  const [wishlist, setWishlist] = useState(user.wishlist ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function toggleInterest(interest) {
    setError(null);
    setInterests(interests.includes(interest) ? interests.filter((i) => i !== interest) : [...interests, interest]);
  }

  async function submit(event) {
    event.preventDefault();
    if (interests.length === 0) return setError('Pick at least one thing you want to use TrailCast for.');
    setSaving(true);
    setError(null);
    try {
      setUser(await api.saveOnboarding({ interests, referralSource, wishlist }));
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Welcome to TrailCast, @{user.username}!</h1>
      <p className="mt-1 text-stone-600">A few quick questions so we can make TrailCast better for you.</p>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <fieldset>
          <legend className="font-semibold">What will you use TrailCast for?</legend>
          <p className="text-sm text-stone-500">Pick as many as you like.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(INTERESTS).map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="checkbox"
                  checked={interests.includes(value)}
                  onChange={() => toggleInterest(value)}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm peer-checked:border-orange-600 peer-checked:bg-orange-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="font-semibold">How did you hear about TrailCast?</span>{' '}
          <span className="text-sm text-stone-500">(optional)</span>
          <select
            value={referralSource}
            onChange={(e) => setReferralSource(e.target.value)}
            className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
          >
            <option value="">Choose one</option>
            {Object.entries(REFERRAL_SOURCES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-semibold">What kind of videos or routes would you like to see here?</span>{' '}
          <span className="text-sm text-stone-500">(optional)</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={wishlist}
            onChange={(e) => setWishlist(e.target.value)}
            placeholder="Ladakh bike trips, Himalayan treks, weekend rides near Bangalore..."
            className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
          />
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
