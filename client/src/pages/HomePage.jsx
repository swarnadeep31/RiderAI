import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ActivityBadge from '../components/ActivityBadge.jsx';
import Icon from '../components/art/Icon.jsx';
import { CampScene, HeroScene } from '../components/art/Scenery.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { cardSummary } from '../lib/stats.js';
import { useConfirm, useToast } from '../notices.jsx';
import { tourSeen } from './TourPage.jsx';

// How many trails the server sends at a time (see listTrails on the server).
const PAGE_SIZE = 24;

const MADE_FOR = [
  ['ride', 'Moto vloggers'],
  ['hike', 'Trekkers'],
  ['climb', 'Climbers'],
  ['cycle', 'Cyclists'],
  ['car', 'Road trippers'],
];

const STEPS = [
  {
    icon: 'video',
    title: 'Paste a YouTube link',
    text: 'Your ride, trek or climb stays on YouTube, live streams too. TrailCast puts a map right beside it.',
    colour: 'bg-red-100 text-red-700',
  },
  {
    icon: 'route',
    title: 'Put the route on the map',
    text: 'Upload the GPS file, let AI spot the places in the video, or tap them on the map yourself.',
    colour: 'bg-violet-100 text-violet-800',
  },
  {
    icon: 'pin',
    title: 'Everyone rides along',
    text: 'Viewers see where you are at every moment, and save your stops to Google Maps, a GPS or a trip sheet.',
    colour: 'bg-pine-100 text-pine-700 dark:bg-pine-900/70 dark:text-pine-300',
  },
];

// onDelete: only for the person who added the trail (the server allows nobody else).
function TrailCard({ trail, index, onDelete }) {
  const aiRoute = trail.routeSource === 'keypoints' && trail.points.some((p) => p.origin === 'ai');
  return (
    <li className="relative motion-safe:animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}>
      <Link
        to={`/trails/${trail._id}`}
        className="card group block h-full overflow-hidden p-2 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_-16px_rgb(21_57_46/0.35)]"
      >
        <div className="relative overflow-hidden rounded-2xl bg-pine-100 dark:bg-pine-900">
          <img
            src={`https://i.ytimg.com/vi/${trail.youtubeId}/hqdefault.jpg`}
            alt=""
            className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-transparent" />
          <ActivityBadge activity={trail.activity} className="absolute top-3 left-3 shadow-sm" />
          <span className="absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-orange-600 shadow-lg transition duration-300 group-hover:scale-110 group-hover:bg-orange-600 group-hover:text-white">
            <Icon name="video" className="h-5 w-5" />
          </span>
          {aiRoute && (
            <span className="badge absolute bottom-3 left-3 bg-violet-600/90 text-white">
              <Icon name="sparkles" className="h-3.5 w-3.5" /> AI route
            </span>
          )}
        </div>
        <div className="px-2 pt-3 pb-2">
          <h2 className="text-lg leading-snug font-bold text-ink group-hover:text-orange-700">{trail.title}</h2>
          {cardSummary(trail.stats) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
              <Icon name="route" className="h-4 w-4 shrink-0 text-pine-600 dark:text-pine-300" />
              {cardSummary(trail.stats)}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500">
            <Icon name="pin" className="h-4 w-4 shrink-0 text-orange-500" />
            <span>
              {ACTIVITIES[trail.activity]} · {trail.points.length} key {trail.points.length === 1 ? 'point' : 'points'}
              {(trail.creatorName || trail.channel?.name) && ` · by ${trail.creatorName || trail.channel.name}`}
            </span>
          </p>
        </div>
      </Link>
      {/* Outside the link, so deleting doesn't open the trail. */}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(trail)}
          aria-label={`Delete “${trail.title}”`}
          title="Delete this trail"
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-md transition hover:bg-red-600 hover:text-white focus-visible:ring-4 focus-visible:ring-red-300 focus-visible:outline-none"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function LoadingCards() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card p-2">
          <div className="skeleton aspect-video rounded-2xl" />
          <div className="skeleton mx-2 mt-4 h-5 w-2/3 rounded-full" />
          <div className="skeleton mx-2 mt-2 mb-3 h-4 w-1/2 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
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
      {/* Hero: the landscape fills the background on wide screens and sits under the text on phones. */}
      <section className="relative overflow-hidden lg:min-h-[760px]" style={{ background: 'var(--sky-hero)' }}>
        <div className="sky-night absolute inset-0" style={{ background: 'var(--sky-night)' }} aria-hidden="true" />
        {/* The text column lets clicks through to the sun, which is the hidden day/night switch. */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-12 pb-6 sm:pt-16 lg:pointer-events-none lg:pt-20 lg:pb-60">
          <div className="max-w-2xl lg:pointer-events-auto">
            <p className="eyebrow motion-safe:animate-fade-up">
              <Icon name="globe" className="h-4 w-4 text-orange-600" /> For everyone who&apos;d rather be outside
            </p>
            <h1
              className="mt-5 text-5xl leading-[0.95] font-extrabold text-ink motion-safe:animate-fade-up sm:text-6xl lg:text-7xl"
              style={{ animationDelay: '80ms' }}
            >
              Watch the adventure.{' '}
              <span className="relative inline-block text-orange-600">
                Follow the trail.
                <svg viewBox="0 0 300 20" className="absolute -bottom-3 left-0 h-4 w-full" aria-hidden="true">
                  <path
                    d="M4 14C60 6 120 4 180 8s90 4 116-2"
                    pathLength="1"
                    className="route-draw"
                    stroke="#fb923c"
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </span>
            </h1>
            <p
              className="mt-6 max-w-xl text-lg text-stone-700 motion-safe:animate-fade-up"
              style={{ animationDelay: '160ms' }}
            >
              Moto vlogs, Himalayan treks and summit climbs with a live map beside the video. See exactly where they
              are, then save the places for your own trip.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-fade-up" style={{ animationDelay: '240ms' }}>
              <a href="#trails" className="btn-primary px-6 py-3 text-base">
                Explore trails <Icon name="arrowDown" className="h-4 w-4" />
              </a>
              <Link to={shareLink} className="btn-secondary px-6 py-3 text-base">
                Share your trip <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
              <Link to="/tour" className="btn-ghost px-4 py-3 text-base">
                <Icon name="video" className="h-4 w-4 text-orange-600" /> Take the tour
              </Link>
            </div>
          </div>
        </div>
        <HeroScene className="relative h-64 w-full sm:h-80 lg:absolute lg:inset-x-0 lg:bottom-0 lg:h-[560px]" />
      </section>

      {/* Who it's for */}
      <section className="border-b border-stone-900/5 bg-sand-100">
        <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-sm font-semibold text-pine-800 dark:text-pine-300">
          {MADE_FOR.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-orange-600 shadow-sm">
                <Icon name={icon} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-center text-3xl font-extrabold text-ink sm:text-4xl">From video to trail map in minutes</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card relative p-6 text-center">
              <span
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${step.colour} shadow-sm`}
              >
                <Icon name={step.icon} className="h-8 w-8" />
              </span>
              <span className="absolute top-4 left-4 font-display text-sm font-extrabold text-stone-300">0{i + 1}</span>
              <h3 className="mt-4 text-xl font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-stone-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The trails */}
      <section id="trails" className="mx-auto max-w-7xl scroll-mt-20 px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Fresh from the trail</h2>
            <p className="mt-1 text-stone-600">The latest rides, treks and climbs. Press play and follow along.</p>
          </div>
          {trails?.length > 0 && (
            <Link to={shareLink} className="btn-secondary">
              <Icon name="edit" className="h-4 w-4" /> Add yours
            </Link>
          )}
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {!trails && !error && (
          <>
            <p className="sr-only">Loading trails...</p>
            <LoadingCards />
          </>
        )}
        {trails?.length === 0 && (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <CampScene className="w-full max-w-xs" />
            <p className="mt-6 font-display text-2xl font-bold text-ink">No trails yet.</p>
            <p className="mt-1 text-stone-600">The campfire&apos;s lit. Be the first to share an adventure.</p>
            <Link to="/new" className="btn-primary mt-5">
              Add the first one
            </Link>
          </div>
        )}
        {trails?.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trails.map((trail, i) => (
              <TrailCard key={trail._id} trail={trail} index={i} onDelete={user && trail.owner?._id === user._id ? deleteTrail : null} />
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={showMore} disabled={loadingMore} className="btn-secondary px-6 py-3 text-base">
              {loadingMore ? 'Loading...' : 'Show more trails'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
