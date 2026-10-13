import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Icon from './components/art/Icon.jsx';
import { CampScene, FooterCamp, FooterRidge, LogoMark } from './components/art/Scenery.jsx';
import { toggleTheme, useTheme } from './lib/theme.js';
import AccountPage from './pages/AccountPage.jsx';
import FeedbackPage from './pages/FeedbackPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NewTrailPage from './pages/NewTrailPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import WelcomePage from './pages/WelcomePage.jsx';

// The map library is big, so the pages with a map load when first opened.
const TrailPage = lazy(() => import('./pages/TrailPage.jsx'));
const PrintPage = lazy(() => import('./pages/PrintPage.jsx'));

function PageLoading() {
  return <p className="px-4 py-16 text-center font-semibold text-pine-700 dark:text-pine-300">Loading...</p>;
}

function HeaderLinks() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    // Come back to this page after logging in (the login and sign-up pages already carry their own "next").
    const onAuthPage = ['/login', '/signup'].includes(location.pathname);
    const next = onAuthPage ? location.search : `?next=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link to={`/login${next}`} className="btn-ghost">
          Log in
        </Link>
        <Link to={`/signup${next}`} className="btn-primary">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <Link to="/new" className="btn-primary">
        + New trail
      </Link>
      <Link to="/account" className="btn-ghost min-w-0 gap-2 px-1.5 sm:max-w-52 sm:pr-4">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pine-700 font-display text-sm text-white uppercase"
        >
          {user.username[0]}
        </span>
        {/* Phones show just the round letter; screen readers still hear the username. */}
        <span className="sr-only sm:not-sr-only sm:truncate">@{user.username}</span>
      </Link>
    </div>
  );
}

// The small day/night switch tucked into the footer (the big one is the sun on the home page).
function DayNightSwitch() {
  const night = useTheme() === 'dark';
  const label = night ? 'Switch to day mode' : 'Switch to night mode';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={night ? 'Bring back the morning' : 'Watch the sunset'}
      className="flex h-8 w-8 items-center justify-center rounded-full text-pine-300 transition hover:rotate-12 hover:bg-white/10 hover:text-amber-300 focus-visible:ring-4 focus-visible:ring-amber-300/40 focus-visible:outline-none"
    >
      <Icon name={night ? 'sun' : 'moon'} className="h-4 w-4" />
    </button>
  );
}

function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[1100] border-b border-stone-900/5 bg-sand-100/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="group flex items-center gap-2.5">
            <LogoMark className="h-9 w-9 transition group-hover:-rotate-6" />
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">
              Trail<span className="text-orange-600">Cast</span>
            </span>
          </Link>
          <HeaderLinks />
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="relative mt-24 bg-pine-900 text-pine-100">
        <FooterRidge className="absolute bottom-full left-0 h-16 w-full sm:h-24" />
        <FooterCamp className="absolute right-[6%] bottom-full h-14 sm:h-20" />
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="font-display text-lg font-extrabold text-white">TrailCast</span>
            </Link>
            <p className="mt-2 max-w-sm text-sm text-pine-200">
              Made for people who&apos;d rather be outside. Videos stay on YouTube; maps by OpenStreetMap contributors.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold">
            <Link to="/" className="hover:text-white">
              Explore trails
            </Link>
            <Link to="/new" className="hover:text-white">
              Share a trip
            </Link>
            <Link to="/feedback" className="text-amber-300 hover:text-amber-200">
              Send feedback
            </Link>
            <DayNightSwitch />
          </nav>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <CampScene className="mx-auto w-full max-w-sm drop-shadow-xl" />
      <h1 className="mt-8 text-3xl font-extrabold text-ink">This trail doesn&apos;t exist (yet)</h1>
      <p className="mt-2 text-stone-600">Looks like we wandered off the map. Let&apos;s head back to camp.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to all trails
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route
              path="welcome"
              element={
                <RequireAuth onboarded={false}>
                  <WelcomePage />
                </RequireAuth>
              }
            />
            <Route
              path="account"
              element={
                <RequireAuth onboarded={false}>
                  <AccountPage />
                </RequireAuth>
              }
            />
            <Route
              path="feedback"
              element={
                <RequireAuth>
                  <FeedbackPage />
                </RequireAuth>
              }
            />
            <Route
              path="new"
              element={
                <RequireAuth>
                  <NewTrailPage />
                </RequireAuth>
              }
            />
            <Route
              path="trails/:id"
              element={
                <Suspense fallback={<PageLoading />}>
                  <TrailPage />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route
            path="trails/:id/print"
            element={
              <Suspense fallback={<PageLoading />}>
                <PrintPage />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
