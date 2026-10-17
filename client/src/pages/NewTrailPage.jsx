import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import Icon, { ACTIVITY_STYLE } from '../components/art/Icon.jsx';
import { HeroScene } from '../components/art/Scenery.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { parseGpx } from '../lib/gpx.js';
import { formatDuration } from '../lib/time.js';

const inputClass = 'input';
const labelClass = 'block text-sm font-semibold text-stone-800';
const hintClass = 'mt-1.5 block text-sm font-normal text-stone-500';

export default function NewTrailPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ youtubeUrl: '', title: '', creatorName: '', activity: 'ride', description: '', supportUrl: '' });
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="card overflow-hidden motion-safe:animate-fade-up">
        <div className="relative" style={{ background: 'var(--sky-hero)' }}>
          <div className="sky-night absolute inset-0" style={{ background: 'var(--sky-night)' }} aria-hidden="true" />
          <HeroScene className="relative h-48 w-full sm:h-60" />
          <div className="pointer-events-none absolute inset-x-0 top-0 p-6 sm:p-8">
            <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">Add a trail</h1>
            <p className="mt-1 max-w-md font-medium text-ink/80">
              Your video stays on YouTube. TrailCast adds the map: the route, and the places you mark.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6 p-6 sm:p-8">
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
            Title
            <input required maxLength={120} value={form.title} onChange={update('title')} className={inputClass} />
          </label>

          <label className={labelClass}>
            Video creator's name <span className="font-normal text-stone-500">(optional)</span>
            <input maxLength={100} value={form.creatorName} onChange={update('creatorName')} placeholder="The rider's or channel's name" className={inputClass} />
            <span className={hintClass}>Shown as "Video by ...". Leave it empty to use the YouTube channel's name.</span>
          </label>

          <fieldset>
            <legend className={labelClass}>Activity</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(ACTIVITIES).map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="activity"
                    value={value}
                    checked={form.activity === value}
                    onChange={update('activity')}
                    className="peer sr-only"
                  />
                  <span className="flex h-full flex-col items-center gap-1.5 rounded-2xl border-2 border-stone-200 bg-surface px-2 py-3 text-center text-sm font-semibold text-stone-700 transition hover:-translate-y-0.5 hover:border-orange-300 peer-checked:border-orange-500 peer-checked:bg-orange-50 peer-checked:text-orange-800 peer-focus-visible:ring-4 peer-focus-visible:ring-orange-200">
                    <Icon name={ACTIVITY_STYLE[value].icon} className="h-7 w-7" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className={labelClass}>
            Description <span className="font-normal text-stone-500">(optional)</span>
            <textarea
              maxLength={5000}
              rows={3}
              value={form.description}
              onChange={update('description')}
              placeholder="Where you went, how the roads were, the chai stop you'd recommend..."
              className={inputClass}
            />
          </label>

          <div className="rounded-2xl border-2 border-dashed border-pine-200 bg-pine-50/60 dark:border-pine-700 dark:bg-pine-900/30 p-4">
            <label htmlFor="gpx" className={`${labelClass} flex items-center gap-2`}>
              <Icon name="satellite" className="h-5 w-5 text-pine-600" />
              GPS route <span className="font-normal text-stone-500">(optional, a .gpx file)</span>
            </label>
            <input
              id="gpx"
              type="file"
              accept=".gpx,application/gpx+xml"
              onChange={readGpxFile}
              className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-pine-700 file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-pine-600`}
            />
            <span className={hintClass}>
              Export it from Strava, Garmin, Komoot or any GPS tracking app used during the trip. No GPS file? Leave
              this empty: after creating the trail, let AI find the places the video passes (public videos), or add a
              key point for each place yourself, and TrailCast draws the route between them.
            </span>
            {routeError && (
              <div className="mt-2">
                <ErrorMessage>{routeError}</ErrorMessage>
              </div>
            )}
            {route && (
              <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-pine-800 shadow-sm dark:text-pine-300">
                {route.track.length.toLocaleString()} GPS points
                {route.trackTimes.length > 0
                  ? `, recorded over ${formatDuration(route.trackTimes.at(-1))}. The map will be able to follow the video.`
                  : ". This file has no times, so the route will show but the map can't follow the video."}
              </p>
            )}
          </div>

          <label className={labelClass}>
            Support link <span className="font-normal text-stone-500">(optional)</span>
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
          <button type="submit" disabled={saving} className="btn-primary px-6 py-3 text-base">
            {saving ? 'Saving...' : 'Create trail'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
