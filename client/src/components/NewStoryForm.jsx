import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import ActivityPicker from './ActivityPicker.jsx';
import Icon from './art/Icon.jsx';
import ErrorMessage from './ErrorMessage.jsx';

// How a route story's line follows the ground between its stops.
export const STORY_STYLES = {
  roads: 'Along roads (rides, drives, cycling)',
  paths: 'Along footpaths and trails (treks, hikes)',
  straight: 'Straight lines (off-road, or when roads don’t matter)',
};

// A route from your own trip, with no video: a name and a few details here,
// then the stops and your tips at each, on the route's own page.
export default function NewStoryForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', activity: 'ride', routeStyle: 'roads', creatorName: '', description: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const story = await api.createTrail({ kind: 'story', ...form });
      navigate(`/trails/${story._id}?edit=1`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // Treks and climbs follow footpaths unless the owner says otherwise.
  const pickActivity = (activity) => setForm({ ...form, activity, routeStyle: ['hike', 'climb'].includes(activity) ? 'paths' : form.routeStyle });

  return (
    <form onSubmit={submit} className="space-y-7 rounded-[3px] bg-paper p-5 ring-1 ring-ink/15 sm:p-8">
      <label className="field-label">
        Name of the route
        <input required maxLength={120} value={form.title} onChange={update('title')} placeholder="Manali to Kaza over Kunzum La" className="input" />
      </label>

      <ActivityPicker value={form.activity} onChange={pickActivity} />

      <fieldset>
        <legend className="field-label">The line between your stops</legend>
        <div className="mt-2 space-y-2">
          {Object.entries(STORY_STYLES).map(([style, label]) => (
            <label key={style} className="flex cursor-pointer items-center gap-3">
              <input type="radio" name="routeStyle" value={style} checked={form.routeStyle === style} onChange={update('routeStyle')} className="h-4 w-4 accent-[var(--color-road)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field-label">
        Your name to show <span className="font-normal text-ink-soft">(optional)</span>
        <input maxLength={100} value={form.creatorName} onChange={update('creatorName')} placeholder="How people should know you" className="input" />
        <span className="hint">Shown as "Route by ...". Leave it empty to stay anonymous: your username is never shown.</span>
      </label>

      <label className="field-label">
        About the trip <span className="font-normal text-ink-soft">(optional)</span>
        <textarea
          maxLength={5000}
          rows={3}
          value={form.description}
          onChange={update('description')}
          placeholder="When you went, how long it took, what the roads were like..."
          className="input"
        />
      </label>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving...' : 'Create the route, then add your stops'} <Icon name="arrowRight" className="h-4 w-4" />
      </button>
    </form>
  );
}
