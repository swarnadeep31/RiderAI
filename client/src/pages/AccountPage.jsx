import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import Icon, { INTEREST_ICON } from '../components/art/Icon.jsx';
import { INTERESTS } from '../lib/onboarding.js';
import { useConfirm, useToast } from '../notices.jsx';

export default function AccountPage() {
  const { user, logout, logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  // Home first: once logged out, this page would send you to the login page instead.
  async function handleLogout() {
    navigate('/');
    await logout();
  }

  // For a lost phone, or a computer you forgot to log out of.
  async function handleLogoutEverywhere() {
    const yes = await confirm({
      title: 'Log out on all devices?',
      message: 'Every phone and computer logged in to your account will be logged out, this one too. You can log in again any time.',
      confirmLabel: 'Log out everywhere',
      icon: 'globe',
    });
    if (!yes) return;
    navigate('/');
    try {
      await logoutEverywhere();
      toast('You were logged out on all your devices.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <section className="flex items-center gap-5 motion-safe:animate-rise">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[2.6rem] leading-none font-semibold text-paper uppercase"
        >
          {(user.name || user.username)[0]}
        </span>
        <div className="min-w-0">
          <h1 className="text-title">{user.name || `@${user.username}`}</h1>
          <p className="mt-1 text-ink-soft">{[user.email, user.phone, user.googleId && 'Signs in with Google'].filter(Boolean).join(' · ')}</p>
        </div>
      </section>

      <section className="mt-10 border-t-2 border-ink pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[1.5rem] leading-tight">You use TrailCast for</h2>
          <Link to="/welcome?next=/account" className="link text-small">
            Change your answers
          </Link>
        </div>
        {user.interests.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {user.interests.map((i) => (
              <li key={i} className="tag bg-surface text-ink">
                <Icon name={INTEREST_ICON[i]} className="h-4 w-4" />
                {INTERESTS[i]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Not answered yet.</p>
        )}
      </section>

      <section className="mt-10 border-t-2 border-ink pt-5">
        <h2 className="text-[1.5rem] leading-tight">Your account</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/new" className="btn-primary">
            <Icon name="edit" className="h-4 w-4" />
            Share a ride
          </Link>
          <Link to="/feedback" className="btn-secondary">
            Send feedback
          </Link>
          <button type="button" onClick={handleLogout} className="btn-secondary">
            Log out
          </button>
        </div>
        <p className="mt-6 text-ink-soft">
          Lost a phone, or logged in on someone else&apos;s computer?{' '}
          <button type="button" onClick={handleLogoutEverywhere} className="link">
            Log out on all devices
          </button>
        </p>
      </section>
    </main>
  );
}
