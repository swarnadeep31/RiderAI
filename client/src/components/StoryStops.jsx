import { useState } from 'react';
import { googleMapsUrl } from '../lib/exports.js';
import Icon from './art/Icon.jsx';
import ErrorMessage from './ErrorMessage.jsx';

const iconButton = 'flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-30';

// One stop's tips, written or changed by the route's creator.
function TipsEditor({ point, onSave, onClose }) {
  const [text, setText] = useState(point.note ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(point, text);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-2">
      <textarea
        autoFocus
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Your tips for ${point.name}`}
        placeholder="Where to eat or sleep, fuel, the view, what to watch out for..."
        className="input"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary btn-small">
          {saving ? 'Saving...' : 'Save tips'}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost btn-small">
          Cancel
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  );
}

// A route story's stops, numbered as on the map, in order, each with the
// creator's tips. Clicking a stop shows it on the map. While editing, stops
// can be moved up or down, marked as a night's stay, given tips, or removed.
export default function StoryStops({ points, editing, busy, onSelect, onMove, onDelete, onToggleNight, onSaveTips }) {
  const [tipsFor, setTipsFor] = useState(null);

  if (points.length === 0) {
    return (
      <p className="py-4 text-ink-soft">
        {editing ? 'No stops yet. Add where the trip starts, then each stop on the way, to where it ends.' : 'No stops yet.'}
      </p>
    );
  }

  return (
    <ol className="divide-y divide-ink/12">
      {points.map((point, i) => (
        <li key={point._id} className="flex items-start gap-3 py-4">
          <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-small font-bold text-paper ring-2 ring-paper">
            {i + 1}
          </span>

          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => onSelect(point)} className="group text-left" title="Show on the map">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-display text-[1.3rem] leading-tight font-semibold group-hover:text-road">{point.name}</span>
                {point.stopKind === 'overnight' && (
                  <span className="tag bg-water-tint text-water" title="Stayed the night here">
                    <Icon name="moon" className="h-3.5 w-3.5" />
                    Night
                  </span>
                )}
              </span>
            </button>
            {tipsFor === point._id ? (
              <TipsEditor point={point} onSave={onSaveTips} onClose={() => setTipsFor(null)} />
            ) : (
              <>
                {point.note && <p className="mt-1 max-w-prose whitespace-pre-line">{point.note}</p>}
                {editing && (
                  <button type="button" onClick={() => setTipsFor(point._id)} className="mt-1 text-small font-semibold text-road underline-offset-4 hover:underline">
                    {point.note ? 'Change your tips' : 'Add your tips'}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <a
              href={googleMapsUrl(point.lat, point.lng)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Maps"
              aria-label={`Open ${point.name} in Google Maps`}
              className={iconButton}
            >
              <Icon name="map" className="h-4 w-4" />
            </a>
            {editing && (
              <>
                <button type="button" onClick={() => onMove(point, -1)} disabled={busy || i === 0} aria-label={`Move ${point.name} earlier`} title="Earlier on the route" className={iconButton}>
                  <Icon name="arrowUp" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(point, 1)}
                  disabled={busy || i === points.length - 1}
                  aria-label={`Move ${point.name} later`}
                  title="Later on the route"
                  className={iconButton}
                >
                  <Icon name="arrowDown" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleNight(point)}
                  disabled={busy}
                  aria-pressed={point.stopKind === 'overnight'}
                  aria-label={`Stayed the night at ${point.name}`}
                  title={point.stopKind === 'overnight' ? 'Stayed the night here (click to undo)' : 'Mark: stayed the night here'}
                  className={`${iconButton} ${point.stopKind === 'overnight' ? 'text-water' : 'hover:text-water'}`}
                >
                  <Icon name="moon" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(point)}
                  disabled={busy}
                  aria-label={`Delete ${point.name}`}
                  title="Delete this stop"
                  className={`${iconButton} hover:bg-road/10 hover:text-road`}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
