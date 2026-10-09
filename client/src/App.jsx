import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router';
import HomePage from './pages/HomePage.jsx';
import NewTrailPage from './pages/NewTrailPage.jsx';
import PrintPage from './pages/PrintPage.jsx';
import TrailPage from './pages/TrailPage.jsx';

function Layout() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            TrailCast
          </Link>
          <Link to="/new" className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
            + New trail
          </Link>
        </div>
      </header>
      <Outlet />
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
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="new" element={<NewTrailPage />} />
          <Route path="trails/:id" element={<TrailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="trails/:id/print" element={<PrintPage />} />
      </Routes>
    </BrowserRouter>
  );
}
