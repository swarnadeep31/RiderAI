import { useState } from 'react';
import { api } from '../api.js';
import ErrorMessage from './ErrorMessage.jsx';

// The owner can say how many days the trip took, when the worked-out number is wrong.
export default function DaysSetting({ trail, onSaved }) {
  const [text, setText] = useState(trail.daysOverride ? String(trail.daysOverride) : '');
  const [error, setError] = useState(null);
  const worked = trail.stats?.daysSource && trail.stats.daysSource !== 'owner' ? trail.stats.days : null;

  async function save(event) {
    event.preventDefault();
    const days = text.trim() === '' ? null : Number(text);
    try {
      setError(null);
      onSaved(await api.updateTrail(trail._id, { daysOverride: days }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <h3 className="text-[1.3rem] leading-tight">Riding days</h3>
      <p className="text-small text-ink-soft">
        {trail.daysOverride
          ? `You set ${trail.daysOverride}. Empty the box and save to work it out again.`
          : worked
            ? `Worked out from the ${trail.stats.daysSource === 'gps' ? 'GPS recording' : 'overnight stops'}: ${worked}. Change it if that's wrong.`
            : 'Mark the places you stayed the night (the moon beside a place), or type the number of days.'}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="365"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={worked ? String(worked) : 'Days'}
          aria-label="Riding days"
          className="field w-24"
        />
        <button type="submit" className="btn-secondary btn-small">
          Save
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  );
}
