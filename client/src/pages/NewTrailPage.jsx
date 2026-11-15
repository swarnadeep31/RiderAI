import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import ActivityPicker from '../components/ActivityPicker.jsx';
import Icon from '../components/art/Icon.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import NewStoryForm from '../components/NewStoryForm.jsx';
import TripEnds from '../components/TripEnds.jsx';
import { parseGpx } from '../lib/gpx.js';
import { formatDuration } from '../lib/time.js';

const inputClass = 'input';
const labelClass = 'field-label';
const hintClass = 'hint';

// Something worth asking YouTube about: a link to it, or a bare video ID.
const looksLikeVideo = (text) => /youtu\.?be|^[\w-]{11}$/.test(text.trim());

const TITLE_HINTS = {
  idle: 'As it is on YouTube. It usually says where the ride starts and ends, like “Kolkata to Ladakh”.',
  loading: 'Getting the title from YouTube…',
  found: "From YouTube. Check it's the whole title: it usually says where the ride starts and ends.",
  missing: "YouTube didn't say what this video is called. Type or paste its whole title.",
};

// What's being put on the map: a ride on YouTube, or a route from your own trip (?from=trip).
const SOURCES = { video: 'From a YouTube video', trip: 'From my own trip' };

// The steps after creating it, beside the form.
function AfterThis({ steps }) {
  return (
    <div className="mt-8 border-t border-ink/15 pt-5">
      <h2 className="margin-text text-ink">After this</h2>
      <ul className="mt-3 space-y-3 text-ink-soft">
        {steps.map(([icon, colour, text]) => (
          <li key={text} className="flex gap-3">
            <Icon name={icon} className={`mt-0.5 h-5 w-5 shrink-0 ${colour}`} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VIDEO_STEPS = [
  ['satellite', 'text-ink', 'With a GPS file, the route is on the map at once.'],
  ['sparkles', 'text-water', 'Without one, let AI find the places in the video, then check them.'],
  ['pin', 'text-road', 'Or add each place yourself, and TrailCast draws the route between them.'],
];
const TRIP_STEPS = [
  ['pin', 'text-road', 'Add your stops in order: search for a place or click the map.'],
  ['edit', 'text-ink', 'At each stop, write your tips: where to eat, sleep, fuel up, what to watch out for.'],
  ['route', 'text-contour', 'TrailCast draws the route between them, with heights, fuel stops and the distance.'],
];

export default function NewTrailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromTrip = searchParams.get('from') === 'trip';
  const [form, setForm] = useState({ youtubeUrl: '', videoTitle: '', title: '', creatorName: '', activity: 'ride', description: '', supportUrl: '' });
  // Where the ride starts and ends, as picked on the map.
  const [trip, setTrip] = useState({ start: null, end: null });
  const [titleState, setTitleState] = useState('idle');
  // Once the owner types the video's title, YouTube's doesn't replace it.
  const titleTyped = useRef(false);
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  // A pasted link: ask YouTube what the video is called (after a pause in typing).
  useEffect(() => {
    const url = form.youtubeUrl;
    if (!looksLikeVideo(url)) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setTitleState('loading');
      try {
        const info = await api.videoInfo(url);
        if (cancelled) return;
        setTitleState(info.title ? 'found' : 'missing');
        setForm((f) => ({
          ...f,
          videoTitle: titleTyped.current || !info.title ? f.videoTitle : info.title,
          title: f.title || info.title.slice(0, 120),
        }));
      } catch {
        if (!cancelled) setTitleState(titleTyped.current ? 'idle' : 'missing');
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.youtubeUrl]);

  async function readGpxFile(event) {
    const file = event.target.files[0];
    setRoute(null);
    setRouteError(null);
    if (!file) return;
    try {
      const parsed = parseGpx(await file.text());
      setRoute(parsed);
      if (!form.title && parsed.name) setForm((f) => ({ ...f, title: parsed.name }));
    } catch (err) {
      setRouteError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trail = await api.createTrail({
        ...form,
        startPlace: trip.start ?? undefined,
        endPlace: trip.end ?? undefined,
        track: route?.track ?? [],
        trackTimes: route?.trackTimes ?? [],
        trackElevations: route?.trackElevations ?? undefined,
        recordedAt: route?.recordedAt ?? undefined,
      });
      navigate(`/trails/${trail._id}?edit=1`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-x-14 gap-y-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-14">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <h1 className="text-title uppercase">Put a ride on the map</h1>
        <div className="mt-5 inline-flex rounded-[3px] ring-[1.5px] ring-ink/75" role="group" aria-label="What to put on the map">
          {Object.entries(SOURCES).map(([source, label]) => {
            const on = (source === 'trip') === fromTrip;
            return (
              <button
                key={source}
                type="button"
                aria-pressed={on}
                onClick={() => setSearchParams(source === 'trip' ? { from: 'trip' } : {})}
                className={`px-3.5 py-2 text-small font-semibold transition-colors ${on ? 'bg-ink text-paper' : 'text-ink hover:bg-surface'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-lead text-ink-soft">
          {fromTrip
            ? "No video needed: the route you took, stop by stop, with what you'd tell a friend going next."
            : 'Your video stays on YouTube. TrailCast adds the map beside it.'}
        </p>
        <AfterThis steps={fromTrip ? TRIP_STEPS : VIDEO_STEPS} />
      </div>

      <div className="motion-safe:animate-rise">
        {fromTrip ? (
          <NewStoryForm />
        ) : (
        <form onSubmit={submit} className="space-y-7 rounded-[3px] bg-paper p-5 ring-1 ring-ink/15 sm:p-8">
          <label className={labelClass}>
            YouTube link
            <input
              required
              value={form.youtubeUrl}
              onChange={update('youtubeUrl')}
              placeholder="https://www.youtube.com/watch?v=..."
              className={inputClass}
            />
            <span className={hintClass}>
              A normal video or a live stream. The owner must allow embedding (most videos do).
            </span>
          </label>

          <label className={labelClass}>
            The video&apos;s full title
            <input
              maxLength={200}
              value={form.videoTitle}
              onChange={(event) => {
                titleTyped.current = true;
                update('videoTitle')(event);
              }}
              placeholder="Kolkata to Ladakh | EP1 Kolkata to Dehri"
              className={inputClass}
            />
            <span className={hintClass} aria-live="polite">
              {TITLE_HINTS[titleState]}
            </span>
          </label>

          <div className="rounded-[3px] bg-surface p-4 ring-1 ring-ink/15">
            <TripEnds title={form.videoTitle} value={trip} onChange={setTrip} optional />
          </div>

          <label className={labelClass}>
            Title on TrailCast
            <input required maxLength={120} value={form.title} onChange={update('title')} className={inputClass} />
          </label>

          <label className={labelClass}>
            Video creator's name <span className="font-normal text-ink-soft">(optional)</span>
            <input maxLength={100} value={form.creatorName} onChange={update('creatorName')} placeholder="The rider's or channel's name" className={inputClass} />
            <span className={hintClass}>Shown as "Video by ...". Leave it empty to use the YouTube channel's name.</span>
          </label>

          <ActivityPicker value={form.activity} onChange={(activity) => setForm({ ...form, activity })} />

          <label className={labelClass}>
            Description <span className="font-normal text-ink-soft">(optional)</span>
            <textarea
              maxLength={5000}
              rows={3}
              value={form.description}
              onChange={update('description')}
              placeholder="Where you went, how the roads were, the chai stop you'd recommend..."
              className={inputClass}
            />
          </label>

          <div className="rounded-[3px] bg-surface p-4 ring-1 ring-ink/15">
            <label htmlFor="gpx" className={`${labelClass} flex items-center gap-2`}>
              <Icon name="satellite" className="h-5 w-5" />
              GPS route <span className="font-normal text-ink-soft">(optional, a .gpx file)</span>
            </label>
            <input
              id="gpx"
              type="file"
              accept=".gpx,application/gpx+xml"
              onChange={readGpxFile}
              className={`${inputClass} file:mr-3 file:rounded-[3px] file:border-0 file:bg-ink file:px-4 file:py-1.5 file:font-semibold file:text-paper hover:file:bg-road`}
            />
            <span className={hintClass}>
              Export it from Strava, Garmin, Komoot or any GPS tracking app used during the trip. No GPS file? Leave
              this empty: after creating the trail, let AI find the places the video passes (public videos), or add
              each place yourself, and TrailCast draws the route between them.
            </span>
            {routeError && (
              <div className="mt-2">
                <ErrorMessage>{routeError}</ErrorMessage>
              </div>
            )}
            {route && (
              <p className="mt-3 rounded-[3px] bg-paper px-3 py-2 font-medium text-forest ring-1 ring-forest/30">
                {route.track.length.toLocaleString()} GPS points
                {route.trackTimes.length > 0
                  ? `, recorded over ${formatDuration(route.trackTimes.at(-1))}. The map will be able to follow the video.`
                  : ". This file has no times, so the route will show but the map can't follow the video."}
              </p>
            )}
          </div>

          <label className={labelClass}>
            Support link <span className="font-normal text-ink-soft">(optional)</span>
            <input
              type="url"
              value={form.supportUrl}
              onChange={update('supportUrl')}
              placeholder="https://ko-fi.com/yourname"
              className={inputClass}
            />
            <span className={hintClass}>
              Where viewers can support you: Ko-fi, Buy Me a Coffee, Patreon, a UPI payment page...
            </span>
          </label>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Create the trail'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
        )}
      </div>
    </main>
  );
}
