import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import Icon, { INTEREST_ICON } from '../components/art/Icon.jsx';
import { INTERESTS } from '../lib/onboarding.js';

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <section className="card overflow-hidden motion-safe:animate-fade-up">
        <div className="h-24 bg-linear-to-r from-sky-200 via-orange-100 to-amber-200" />
        <div className="-mt-12 px-6 pb-6">
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-surface bg-pine-700 font-display text-4xl font-extrabold text-white uppercase shadow-lg">
            {(user.name || user.username)[0]}
          </span>
          <h1 className="mt-3 text-3xl font-extrabold text-ink">{user.name || `@${user.username}`}</h1>
          <p className="text-stone-600">{[user.email, user.phone, user.googleId && 'Signs in with Google'].filter(Boolean).join(' · ')}</p>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-bold text-ink">You use TrailCast for</h2>
        {user.interests.length > 0 ? (
          <>
            <p className="sr-only">{user.interests.map((i) => INTERESTS[i]).join(', ')}</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
              {user.interests.map((i) => (
                <li key={i} className="badge bg-orange-100 px-3 py-1.5 text-sm text-orange-800">
                  <Icon name={INTEREST_ICON[i]} className="h-4 w-4" />
                  {INTERESTS[i]}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-stone-700">Not answered yet</p>
        )}
        <Link to="/welcome?next=/account" className="mt-4 inline-block text-sm font-semibold text-orange-700 underline">
          Change your answers
        </Link>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to="/new" className="btn-primary">
          + Share a trip
        </Link>
        <Link to="/feedback" className="btn-secondary">
          Send feedback
        </Link>
        <button type="button" onClick={handleLogout} className="btn-secondary">
          Log out
        </button>
      </div>
    </main>
  );
}
