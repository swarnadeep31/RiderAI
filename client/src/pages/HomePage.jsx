import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import SheetHero from '../components/home/SheetHero.jsx';
import SheetLegend from '../components/home/SheetLegend.jsx';
import TrailCard from '../components/TrailCard.jsx';
import { useConfirm, useToast } from '../notices.jsx';
import { tourSeen } from './TourPage.jsx';

// How many trails the server sends at a time (see listTrails on the server).
const PAGE_SIZE = 24;

function LoadingCards() {
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="skeleton aspect-video rounded-[3px]" />
          <div className="skeleton mt-4 h-6 w-2/3 rounded-[2px]" />
          <div className="skeleton mt-2 h-4 w-1/2 rounded-[2px]" />
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { hash } = useLocation();
  const [trails, setTrails] = useState(null);
  const [error, setError] = useState(null);
  // Whether the server may have older trails, and whether they're loading.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api.listTrails().then(
      (page) => {
        setTrails(page);
        setHasMore(page.length === PAGE_SIZE);
      },
      (err) => setError(err.message),
    );
  }, []);

  // "Rides" and "How it works" in the header link here from other pages.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, trails === null]);

  async function showMore() {
    setLoadingMore(true);
    try {
      const page = await api.listTrails(trails.at(-1)._id);
      setTrails((list) => [...list, ...page.filter((trail) => !list.some((t) => t._id === trail._id))]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
    setLoadingMore(false);
  }

  // Deletes a trail the user added: its route, key points and everything worked out for it.
  async function deleteTrail(trail) {
    const yes = await confirm({
      title: 'Are you sure you want to delete this trail?',
      message: `“${trail.title}” and everything worked out for it (the route, heights and fuel stops) will be deleted. This can't be undone.`,
      confirmLabel: 'Delete trail',
    });
    if (!yes) return;
    try {
      await api.deleteTrail(trail._id);
      setTrails((list) => list.filter((t) => t._id !== trail._id));
      toast(`“${trail.title}” was successfully deleted.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  const shareLink = user ? '/new' : '/signup?next=%2Fnew';

  // A first-time visitor (not logged in) sees the short tour first, once.
  if (!loading && !user && !tourSeen()) return <Navigate to="/tour" replace />;

  return (
    <main>
      <SheetHero shareLink={shareLink} />

      {/* The rides: an index of sheets. */}
      <section id="rides" className="mx-auto max-w-7xl scroll-mt-16 px-4 pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
          <div>
            <h2 className="text-title uppercase">Rides on the map</h2>
            <p className="mt-2 text-ink-soft">The newest rides, treks and climbs. Open one and follow it as it plays.</p>
          </div>
          {trails?.length > 0 && (
            <Link to={shareLink} className="btn-secondary btn-small">
              Add your ride
            </Link>
          )}
        </div>

        <div className="mt-8">
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {!trails && !error && (
            <>
              <p className="sr-only">Loading the rides...</p>
              <LoadingCards />
            </>
          )}
          {trails?.length === 0 && (
            <div className="sheet flex flex-col items-start gap-4 p-8 sm:p-12">
              <p className="font-display text-title uppercase">No rides on the map yet</p>
              <p className="max-w-lg text-ink-soft">Be the first: paste a YouTube link of your ride or trek, and put its route on the map.</p>
              <Link to={shareLink} className="btn-primary">
                Share the first ride
              </Link>
            </div>
          )}
          {trails?.length > 0 && (
            <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {trails.map((trail) => (
                <TrailCard key={trail._id} trail={trail} onDelete={user && trail.owner?._id === user._id ? deleteTrail : null} />
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={showMore} disabled={loadingMore} className="btn-secondary">
                {loadingMore ? 'Loading...' : 'Show more rides'}
              </button>
            </div>
          )}
        </div>
      </section>

      <SheetLegend />

      {/* The close: an invitation to creators. */}
      <section className="mx-auto max-w-7xl px-4 pt-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <div>
            <h2 className="text-display uppercase">
              Rode somewhere good?
              <br />
              Put it on the map.
            </h2>
          </div>
          <div>
            <p className="text-lead text-ink-soft">
              Paste the YouTube link. Add your GPS file, or let AI find the places in the video. Check them, and everyone who
              watches can ride along. It&apos;s free, and your video stays on YouTube.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={shareLink} className="btn-primary">
                Share your ride
              </Link>
              <Link to="/tour" className="btn-secondary">
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
