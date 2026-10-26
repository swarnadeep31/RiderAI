import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Icon from './components/art/Icon.jsx';
import { LogoMark } from './components/art/Sheet.jsx';
import { toggleTheme, useTheme } from './lib/theme.js';
import AccountPage from './pages/AccountPage.jsx';
import FeedbackPage from './pages/FeedbackPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NewTrailPage from './pages/NewTrailPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import { NoticesProvider } from './notices.jsx';
import TourPage from './pages/TourPage.jsx';

// The map library is big, so the pages with a map load when first opened.
const TrailPage = lazy(() => import('./pages/TrailPage.jsx'));
const PrintPage = lazy(() => import('./pages/PrintPage.jsx'));

function PageLoading() {
  return <p className="px-4 py-16 text-center font-medium text-ink-soft">Loading...</p>;
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
      <>
        <Link to={`/login${next}`} className="btn-ghost btn-small">
          Log in
        </Link>
        <Link to={`/signup${next}`} className="btn-primary btn-small">
          Sign up
        </Link>
      </>
    );
  }
  const name = user.name || `@${user.username}`;
  return (
    <>
      <Link to="/new" className="btn-primary btn-small">
        <Icon name="edit" className="h-4 w-4" />
        <span>
          New<span className="hidden sm:inline"> trail</span>
        </span>
      </Link>
      <Link to="/account" className="btn-ghost btn-small min-w-0 gap-2 px-1.5" title="Your account">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-display text-base font-semibold text-paper uppercase">
          {name.replace('@', '')[0]}
        </span>
        {/* Phones show just the initial; screen readers still hear the name. */}
        <span className="sr-only lg:not-sr-only lg:max-w-40 lg:truncate">{name}</span>
      </Link>
    </>
  );
}

// Day and night: a small switch in the header, and a worded one in the footer.
// The site follows the device's setting until the visitor picks one.
function DayNightSwitch({ worded = false }) {
  const night = useTheme() === 'dark';
  const label = night ? 'Switch to day mode' : 'Switch to night mode';
  if (worded) {
    return (
      <button type="button" onClick={toggleTheme} className="link inline-flex items-center gap-1.5">
        <Icon name={night ? 'sun' : 'moon'} className="h-4 w-4" />
        {night ? 'Day mode' : 'Night mode'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-[3px] text-ink transition-colors hover:bg-ink/6"
    >
      <Icon name={night ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
  );
}

function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-[1100] border-b border-ink/12 bg-paper">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-[1.6rem] leading-none font-semibold tracking-tight">TrailCast</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <Link to="/#rides" className="btn-ghost btn-small text-ink-soft hover:text-ink">
              Rides
            </Link>
            <Link to="/#how" className="btn-ghost btn-small text-ink-soft hover:text-ink">
              How it works
            </Link>
            <Link to="/tour" className="btn-ghost btn-small text-ink-soft hover:text-ink">
              Tour
            </Link>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <DayNightSwitch />
            <HeaderLinks />
          </div>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="mt-24 bg-field">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <LogoMark className="h-8 w-8" />
              <span className="font-display text-2xl leading-none font-semibold">TrailCast</span>
            </Link>
            <p className="mt-3 max-w-sm text-ink-soft">
              Ride videos with the map beside them. Videos stay on YouTube; map data from OpenStreetMap contributors.
            </p>
          </div>
          <nav aria-label="Rides" className="flex flex-col items-start gap-2">
            <p className="margin-text">Rides</p>
            <Link to="/#rides" className="link">
              Explore the rides
            </Link>
            <Link to="/new" className="link">
              Share your ride
            </Link>
            <Link to="/tour" className="link">
              Take the tour
            </Link>
          </nav>
          <div className="flex flex-col items-start gap-2">
            <p className="margin-text">TrailCast</p>
            <Link to="/feedback" className="link">
              Send feedback
            </Link>
            <DayNightSwitch worded />
          </div>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-display uppercase">This page is off the map</h1>
      <p className="mt-4 max-w-xl text-lead text-ink-soft">The link may be missing a part, or the trail was deleted.</p>
      <Link to="/" className="btn-primary mt-8">
        Back to the rides
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NoticesProvider>
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
            {/* The onboarding tour: full screen, without the site's header and footer. */}
            <Route path="tour" element={<TourPage />} />
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
      </NoticesProvider>
    </AuthProvider>
  );
}
