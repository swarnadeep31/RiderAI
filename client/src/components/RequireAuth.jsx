import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth.jsx';

// Wrap a page in this to make it logged-in only. Logged-out visitors go to the
// login page and come back afterwards. With `onboarded`, new users answer the
// welcome questions first.
export default function RequireAuth({ children, onboarded = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="px-4 py-8 text-stone-500">Loading...</p>;

  const here = encodeURIComponent(location.pathname + location.search);
  if (!user) return <Navigate to={`/login?next=${here}`} replace />;
  if (onboarded && !user.onboardedAt) return <Navigate to={`/welcome?next=${here}`} replace />;
  return children;
}
