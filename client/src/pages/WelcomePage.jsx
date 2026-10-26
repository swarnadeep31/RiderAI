import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon, { INTEREST_ICON } from '../components/art/Icon.jsx';
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
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="motion-safe:animate-rise">
        <h1 className="text-title uppercase">Welcome to TrailCast{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="mt-3 text-lead text-ink-soft">Three quick questions, so TrailCast gets better for you. Only the first one is needed.</p>

        <form onSubmit={submit} className="mt-8 space-y-8 border-t-2 border-ink pt-8">
          <fieldset>
            <legend className="font-display text-[1.4rem] leading-tight font-semibold">What will you use TrailCast for?</legend>
            <p className="text-ink-soft">Pick as many as you like.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(INTERESTS).map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="checkbox"
                    checked={interests.includes(value)}
                    onChange={() => toggleInterest(value)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex items-center gap-2 rounded-[3px] bg-paper px-4 py-2 font-semibold text-ink-soft ring-[1.5px] ring-ink/20 transition-colors select-none hover:text-ink hover:ring-ink/50 peer-checked:bg-ink peer-checked:text-paper peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-water">
                    <Icon name={INTEREST_ICON[value]} className="h-4 w-4" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-display text-[1.4rem] leading-tight font-semibold">How did you hear about TrailCast?</span>{' '}
            <span className="text-ink-soft">(optional)</span>
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
            <span className="font-display text-[1.4rem] leading-tight font-semibold">What rides or routes would you like to see here?</span>{' '}
            <span className="text-ink-soft">(optional)</span>
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
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Continue'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
