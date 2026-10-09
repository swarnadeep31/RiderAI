import { useState } from 'react';
import { formatTime, parseTime } from '../lib/time.js';
import ErrorMessage from './ErrorMessage.jsx';

// The location comes from clicking the map, which the page passes in.
export default function AddPointForm({ currentTime, location, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [timeText, setTimeText] = useState(formatTime(currentTime));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const time = parseTime(timeText);
    if (time === null) return setError('Write the video time like 12:30.');
    if (!location) return setError('Click the map to choose where this place is.');
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, note, time, lat: location[0], lng: location[1] });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-white p-3 shadow-sm">
      <h3 className="font-semibold">New key point</h3>
      <p className="text-sm text-stone-600">
        {location
          ? `Location: ${location[0].toFixed(5)}, ${location[1].toFixed(5)}. Click the map to change it.`
          : 'Click the map to choose where this place is.'}
      </p>
      <div className="flex items-end gap-2">
        <label className="block text-sm font-medium">
          Video time
          <input
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            className="mt-1 block w-24 rounded-md border border-stone-300 px-2 py-1 font-mono"
          />
        </label>
        <button
          type="button"
          onClick={() => setTimeText(formatTime(currentTime))}
          className="rounded-md border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
        >
          Use current time ({formatTime(currentTime)})
        </button>
      </div>
      <label className="block text-sm font-medium">
        Name
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rohtang Pass viewpoint"
          className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1"
        />
      </label>
      <label className="block text-sm font-medium">
        Note <span className="font-normal text-stone-500">(optional)</span>
        <textarea
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Fuel pump, tea stall, best photo spot..."
          className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1"
        />
      </label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save key point'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm hover:bg-stone-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
