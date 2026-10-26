import { googleMapsUrl } from '../lib/exports.js';
import { formatDuration, formatTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';

// "Stopped 1 min 40 s, until 2:34" for a place where the rider stayed.
function stayText(point) {
  if (!point.stayUntil) return null;
  return `Stopped ${formatDuration(point.stayUntil - point.time)}, until ${formatTime(point.stayUntil)}`;
}

// The places in the video, as a sheet's gazetteer: numbered as on the map, in
// the order the rider reaches them, each with its moment in the video.
// Clicking a place plays the video from there and shows it on the map.
export default function KeyPointList({ points, activePointId, editing, onSelect, onDelete, onToggleNight }) {
  if (points.length === 0) {
    return (
      <p className="py-4 text-ink-soft">
        {editing ? 'No places yet. Add the places the video passes, from where it starts to where it ends.' : 'No places marked yet.'}
      </p>
    );
  }

  return (
    <ol className="divide-y divide-ink/12">
      {points.map((point, i) => {
        const active = point._id === activePointId;
        const stay = stayText(point);
        return (
          <li key={point._id} className={`flex items-start gap-3 py-3 transition-colors ${active ? 'bg-road/6' : ''}`}>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-small font-bold text-paper ring-2 ring-paper ${
                active ? 'bg-road' : 'bg-ink'
              }`}
            >
              {i + 1}
            </span>

            <button type="button" onClick={() => onSelect(point)} className="group min-w-0 flex-1 text-left" title="Watch from here">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-display text-[1.3rem] leading-tight font-semibold group-hover:text-road">{point.name}</span>
                {point.stopKind === 'overnight' && (
                  <span className="tag bg-water-tint text-water" title="Stayed the night here">
                    <Icon name="moon" className="h-3.5 w-3.5" />
                    Night
                  </span>
                )}
                {point.origin === 'ai' && (
                  <span className="inline-flex items-center text-water" title={point.quote ? `Found by AI: “${point.quote}”` : 'Found by AI in the video'}>
                    <Icon name="sparkles" className="h-3.5 w-3.5" />
                    <span className="sr-only">Found by AI</span>
                  </span>
                )}
              </span>
              {stay && <span className="block text-small text-ink-soft">{stay}</span>}
              {point.note && <span className="mt-0.5 block text-ink-soft">{point.note}</span>}
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(point)}
                className="inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-semibold text-water tabular-nums transition-colors hover:bg-water-tint"
                aria-label={`Watch ${point.name} at ${formatTime(point.time)}`}
              >
                <Icon name="video" className="h-4 w-4" />
                {formatTime(point.time)}
              </button>
              <a
                href={googleMapsUrl(point.lat, point.lng)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Google Maps"
                aria-label={`Open ${point.name} in Google Maps`}
                className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-ink/6 hover:text-ink"
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
                  className={`flex h-8 w-8 items-center justify-center rounded-[3px] transition-colors hover:bg-ink/6 ${
                    point.stopKind === 'overnight' ? 'text-water' : 'text-ink-soft hover:text-water'
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
                  title="Delete this place"
                  className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-road/10 hover:text-road"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
