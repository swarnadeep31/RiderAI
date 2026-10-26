import { useState } from 'react';
import { formatTime, parseTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import PlaceSearch from './PlaceSearch.jsx';

// The location comes from clicking the map or searching for a place; the page
// keeps it so the map can show it.
export default function AddPointForm({ currentTime, location, onSave, onCancel, onPickPlace }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [overnight, setOvernight] = useState(false);
  const [timeText, setTimeText] = useState(formatTime(currentTime));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const time = parseTime(timeText);
    if (time === null) return setError('Write the video time like 12:30.');
    if (!location) return setError('Search for the place, or click the map to choose where it is.');
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, note, time, lat: location[0], lng: location[1], ...(overnight && { stopKind: 'overnight' }) });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-[3px] bg-paper p-4 ring-1 ring-ink/15">
      <h3 className="font-display text-[1.3rem] leading-tight font-semibold">New place</h3>
      <p className="text-small text-ink-soft">
        {location
          ? `Location: ${location[0].toFixed(5)}, ${location[1].toFixed(5)}. Search or click the map to change it.`
          : 'Where is it? Search for the place, or click the map.'}
      </p>
      <PlaceSearch
        onPick={(place) => {
          if (!name) setName(place.name);
          onPickPlace(place);
        }}
      />
      <div className="flex items-end gap-2">
        <label className="field-label">
          Video time
          <input
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            className="field mt-1 block w-24 tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={() => setTimeText(formatTime(currentTime))}
          className="btn-secondary btn-small"
        >
          Use current time ({formatTime(currentTime)})
        </button>
      </div>
      <label className="field-label">
        Name
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rohtang Pass viewpoint"
          className="field mt-1 block w-full"
        />
      </label>
      <label className="field-label">
        Note <span className="font-normal text-ink-soft">(optional)</span>
        <textarea
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Fuel pump, tea stall, best photo spot..."
          className="field mt-1 block w-full"
        />
      </label>
      <label className="flex items-center gap-2 text-small font-semibold text-ink">
        <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} />
        <Icon name="moon" className="h-4 w-4 text-water" />
        Stayed the night here
        <span className="font-normal text-ink-soft">(counts towards the riding days)</span>
      </label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving...' : 'Save the place'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
