import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import AccountPage from './pages/AccountPage.jsx';
import FeedbackPage from './pages/FeedbackPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NewTrailPage from './pages/NewTrailPage.jsx';
import PrintPage from './pages/PrintPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import TrailPage from './pages/TrailPage.jsx';
import WelcomePage from './pages/WelcomePage.jsx';

const buttonClass = 'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold';

function HeaderLinks() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    // Come back to this page after logging in (the login and sign-up pages already carry their own "next").
    const onAuthPage = ['/login', '/signup'].includes(location.pathname);
    const next = onAuthPage ? location.search : `?next=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <div className="flex items-center gap-2">
        <Link to={`/login${next}`} className={`${buttonClass} hover:bg-stone-100`}>
          Log in
        </Link>
        <Link to={`/signup${next}`} className={`${buttonClass} bg-orange-600 text-white hover:bg-orange-700`}>
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link to="/new" className={`${buttonClass} bg-orange-600 text-white hover:bg-orange-700`}>
        + New trail
      </Link>
      <Link to="/account" className={`${buttonClass} max-w-28 truncate hover:bg-stone-100 sm:max-w-48`}>
        @{user.username}
      </Link>
    </div>
  );
}

function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            TrailCast
          </Link>
          <HeaderLinks />
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-stone-200 py-4 text-center text-sm text-stone-500">
        <Link to="/feedback" className="underline hover:text-stone-800">
          Send feedback
        </Link>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-orange-700 underline">
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
            <Route path="trails/:id" element={<TrailPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="trails/:id/print" element={<PrintPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
