import { googleMapsUrl } from '../lib/exports.js';
import { formatDuration, formatTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';

// "at 16:08", or "0:54 – 2:34 · stopped 1 min 40 s" for a place where the rider stayed.
function whenText(point) {
  if (!point.stayUntil) return `at ${formatTime(point.time)}`;
  return `${formatTime(point.time)} – ${formatTime(point.stayUntil)} · stopped ${formatDuration(point.stayUntil - point.time)}`;
}

// The places in the video, as a timeline in the order the rider reaches them.
// Clicking a place (or its ▶) plays the video from there and shows it on the map.
export default function KeyPointList({ points, activePointId, editing, onSelect, onDelete, onToggleNight }) {
  if (points.length === 0) {
    return (
      <p className="card flex items-center gap-3 p-5 text-sm text-stone-600">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <Icon name="pin" />
        </span>
        {editing ? 'No key points yet. Add the places you talk about in the video.' : 'No key points marked yet.'}
      </p>
    );
  }

  return (
    <ol className="card px-2 py-3 sm:px-3">
      {points.map((point, i) => {
        const active = point._id === activePointId;
        const last = i === points.length - 1;
        return (
          <li key={point._id} className="relative flex gap-3">
            {/* The number, on a line joining the places in order. */}
            <div className="relative flex w-9 shrink-0 justify-center pt-3">
              {!last && <span aria-hidden="true" className="absolute top-11 -bottom-3 border-l-2 border-dashed border-orange-300" />}
              <span
                className={`relative flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold text-white shadow-sm transition ${
                  active ? 'scale-110 bg-orange-600 ring-4 ring-orange-200' : 'bg-pine-800'
                }`}
              >
                {i + 1}
              </span>
            </div>

            <div className={`mb-1 flex min-w-0 flex-1 items-start gap-2 rounded-2xl p-2.5 transition-colors ${active ? 'bg-orange-50' : 'hover:bg-sand-50'}`}>
              <button type="button" onClick={() => onSelect(point)} className="min-w-0 flex-1 text-left" title="Watch from here">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink">{point.name}</span>
                  {point.stopKind === 'overnight' && (
                    <span className="badge bg-sky-100 text-sky-800" title="Stayed the night here">
                      <Icon name="moon" className="h-3 w-3" />
                      Night
                    </span>
                  )}
                  {point.origin === 'ai' && (
                    <span
                      className="inline-flex items-center text-violet-600"
                      title={point.quote ? `Found by AI: “${point.quote}”` : 'Found by AI in the video'}
                    >
                      <Icon name="sparkles" className="h-3.5 w-3.5" />
                      <span className="sr-only">Found by AI</span>
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-stone-500">{whenText(point)}</span>
                {point.note && <span className="mt-1 block text-sm text-stone-700">{point.note}</span>}
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(point)}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 font-mono text-xs font-semibold text-orange-800 transition hover:bg-orange-200"
                  aria-label={`Watch ${point.name} at ${formatTime(point.time)}`}
                >
                  <span aria-hidden="true">▶</span>
                  {formatTime(point.time)}
                </button>
                <a
                  href={googleMapsUrl(point.lat, point.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Google Maps"
                  aria-label={`Open ${point.name} in Google Maps`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-orange-700"
                >
                  <Icon name="map" className="h-4 w-4" />
                </a>
                {editing && (
                  <button
                    type="button"
                    onClick={() => onToggleNight(point)}
                    aria-pressed={point.stopKind === 'overnight'}
                    aria-label={`Stayed the night at ${point.name}`}
                    title={point.stopKind === 'overnight' ? 'Stayed the night here (click to undo)' : 'Mark: stayed the night here'}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-stone-100 ${
                      point.stopKind === 'overnight' ? 'text-sky-600' : 'text-stone-400 hover:text-sky-600'
                    }`}
                  >
                    <Icon name="moon" className="h-4 w-4" />
                  </button>
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() => onDelete(point)}
                    aria-label={`Delete ${point.name}`}
                    title="Delete this key point"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
