import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon, { INTEREST_ICON } from '../components/art/Icon.jsx';
import { CampScene } from '../components/art/Scenery.jsx';
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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="card overflow-hidden motion-safe:animate-fade-up">
        <div className="flex flex-col items-center gap-5 bg-linear-to-b from-orange-50 to-white px-6 pt-8 pb-2 text-center sm:flex-row sm:text-left">
          <CampScene className="w-40 shrink-0 drop-shadow-lg" />
          <div>
            <h1 className="text-3xl font-extrabold text-pine-950">Welcome to TrailCast, @{user.username}!</h1>
            <p className="mt-1 text-stone-600">
              Pull up a log by the fire. A few quick questions so we can make TrailCast better for you.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-8 p-6 sm:p-8">
          <fieldset>
            <legend className="font-display text-lg font-bold text-pine-950">What will you use TrailCast for?</legend>
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
                  <span className="inline-flex items-center gap-2 rounded-full border-2 border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition select-none hover:-translate-y-0.5 hover:border-orange-300 peer-checked:border-orange-600 peer-checked:bg-orange-600 peer-checked:text-white peer-checked:shadow-md peer-checked:shadow-orange-600/30 peer-focus-visible:ring-4 peer-focus-visible:ring-orange-200">
                    <Icon name={INTEREST_ICON[value]} className="h-4 w-4" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-display text-lg font-bold text-pine-950">How did you hear about TrailCast?</span>{' '}
            <span className="text-sm text-stone-500">(optional)</span>
            <select value={referralSource} onChange={(e) => setReferralSource(e.target.value)} className="input mt-2">
              <option value="">Choose one</option>
              {Object.entries(REFERRAL_SOURCES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-display text-lg font-bold text-pine-950">
              What kind of videos or routes would you like to see here?
            </span>{' '}
            <span className="text-sm text-stone-500">(optional)</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={wishlist}
              onChange={(e) => setWishlist(e.target.value)}
              placeholder="Ladakh bike trips, Himalayan treks, weekend rides near Bangalore..."
              className="input mt-2"
            />
          </label>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button type="submit" disabled={saving} className="btn-primary px-6 py-3 text-base">
            {saving ? 'Saving...' : 'Continue'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
