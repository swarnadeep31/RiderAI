import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { INTERESTS } from '../lib/onboarding.js';

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">@{user.username}</h1>
        <p className="text-stone-600">{user.email}</p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">You use TrailCast for</h2>
        <p className="mt-1 text-stone-700">
          {user.interests.length > 0 ? user.interests.map((i) => INTERESTS[i]).join(', ') : 'Not answered yet'}
        </p>
        <Link to="/welcome?next=/account" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">
          Change your answers
        </Link>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to="/feedback" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium hover:bg-stone-100">
          Send feedback
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium hover:bg-stone-100"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
