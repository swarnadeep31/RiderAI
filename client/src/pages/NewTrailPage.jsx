import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { parseGpx } from '../lib/gpx.js';
import { formatDuration } from '../lib/time.js';

const inputClass = 'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2';

export default function NewTrailPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ youtubeUrl: '', title: '', activity: 'ride', description: '', supportUrl: '' });
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
        recordedAt: route?.recordedAt ?? undefined,
      });
      navigate(`/trails/${trail._id}?edit=1`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Add a trail</h1>
      <p className="mt-1 text-stone-600">
        Your video stays on YouTube. TrailCast adds the map: the route, and the places you mark.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block font-medium">
          YouTube link
          <input
            required
            value={form.youtubeUrl}
            onChange={update('youtubeUrl')}
            placeholder="https://www.youtube.com/watch?v=..."
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">
            A normal video or a live stream. The owner must allow embedding (most videos do).
          </span>
        </label>

        <label className="block font-medium">
          Title
          <input required maxLength={120} value={form.title} onChange={update('title')} className={inputClass} />
        </label>

        <label className="block font-medium">
          Activity
          <select value={form.activity} onChange={update('activity')} className={inputClass}>
            {Object.entries(ACTIVITIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block font-medium">
          Description <span className="font-normal text-stone-500">(optional)</span>
          <textarea
            maxLength={5000}
            rows={3}
            value={form.description}
            onChange={update('description')}
            className={inputClass}
          />
        </label>

        <div className="block font-medium">
          <label htmlFor="gpx">
            GPS route <span className="font-normal text-stone-500">(optional, a .gpx file)</span>
          </label>
          <input id="gpx" type="file" accept=".gpx,application/gpx+xml" onChange={readGpxFile} className={inputClass} />
          <span className="mt-1 block text-sm font-normal text-stone-500">
            Export it from Strava, Garmin, Komoot or any GPS tracking app you used during the trip.
          </span>
          {routeError && (
            <div className="mt-2">
              <ErrorMessage>{routeError}</ErrorMessage>
            </div>
          )}
          {route && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-normal text-green-800">
              {route.track.length.toLocaleString()} GPS points
              {route.trackTimes.length > 0
                ? `, recorded over ${formatDuration(route.trackTimes.at(-1))}. The map will be able to follow the video.`
                : ". This file has no times, so the route will show but the map can't follow the video."}
            </p>
          )}
        </div>

        <label className="block font-medium">
          Support link <span className="font-normal text-stone-500">(optional)</span>
          <input
            type="url"
            value={form.supportUrl}
            onChange={update('supportUrl')}
            placeholder="https://ko-fi.com/yourname"
            className={inputClass}
          />
          <span className="mt-1 block text-sm font-normal text-stone-500">
            Where viewers can support you: Ko-fi, Buy Me a Coffee, Patreon, a UPI payment page...
          </span>
        </label>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Create trail'}
        </button>
      </form>
    </main>
  );
}
