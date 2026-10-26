import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import Icon, { ACTIVITY_STYLE } from '../components/art/Icon.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { parseGpx } from '../lib/gpx.js';
import { formatDuration } from '../lib/time.js';

const inputClass = 'input';
const labelClass = 'field-label';
const hintClass = 'hint';

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
    <main className="mx-auto grid max-w-6xl gap-x-14 gap-y-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:py-14">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <h1 className="text-title uppercase">Put a ride on the map</h1>
        <p className="mt-3 text-lead text-ink-soft">Your video stays on YouTube. TrailCast adds the map beside it.</p>
        <div className="mt-8 border-t border-ink/15 pt-5">
          <h2 className="margin-text text-ink">After this</h2>
          <ul className="mt-3 space-y-3 text-ink-soft">
            <li className="flex gap-3">
              <Icon name="satellite" className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
              <span>With a GPS file, the route is on the map at once.</span>
            </li>
            <li className="flex gap-3">
              <Icon name="sparkles" className="mt-0.5 h-5 w-5 shrink-0 text-water" />
              <span>Without one, let AI find the places in the video, then check them.</span>
            </li>
            <li className="flex gap-3">
              <Icon name="pin" className="mt-0.5 h-5 w-5 shrink-0 text-road" />
              <span>Or add each place yourself, and TrailCast draws the route between them.</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="motion-safe:animate-rise">
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
            Title
            <input required maxLength={120} value={form.title} onChange={update('title')} className={inputClass} />
          </label>

          <label className={labelClass}>
            Video creator's name <span className="font-normal text-ink-soft">(optional)</span>
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
                  <span className="flex h-full flex-col items-center gap-1.5 rounded-[3px] bg-paper px-2 py-3 text-center text-small font-semibold text-ink-soft ring-[1.5px] ring-ink/20 transition-colors hover:text-ink hover:ring-ink/50 peer-checked:bg-ink peer-checked:text-paper peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-water">
                    <Icon name={ACTIVITY_STYLE[value].icon} className="h-7 w-7" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

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
      </div>
    </main>
  );
}
