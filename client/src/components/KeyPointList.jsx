import { googleMapsUrl } from '../lib/exports.js';
import Icon from './art/Icon.jsx';
import { formatTime } from '../lib/time.js';

export default function KeyPointList({ points, activePointId, editing, onSelect, onDelete }) {
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
    <ol className="card divide-y divide-stone-100 overflow-hidden">
      {points.map((point, i) => {
        const active = point._id === activePointId;
        return (
          <li
            key={point._id}
            className={`flex items-start gap-3 p-3.5 transition-colors ${active ? 'bg-orange-50' : 'hover:bg-sand-50'}`}
          >
            <button
              type="button"
              onClick={() => onSelect(point)}
              className="flex flex-1 items-start gap-3 text-left"
              title="Jump to this moment"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white shadow-sm transition ${active ? 'scale-110 bg-orange-600 ring-4 ring-orange-200' : 'bg-pine-800'}`}
              >
                {i + 1}
              </span>
              <span className="pt-1">
                <span className="font-semibold text-pine-950">{point.name}</span>
                <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-600">
                  {formatTime(point.time)}
                  {point.stayUntil ? `–${formatTime(point.stayUntil)}` : ''}
                </span>
                {point.origin === 'ai' && (
                  <span
                    className="ml-2 rounded bg-violet-100 px-1 text-xs font-medium text-violet-800"
                    title={point.quote ? `Found by AI: “${point.quote}”` : 'Found by AI in the video'}
                  >
                    AI
                  </span>
                )}
                {point.note && <span className="mt-0.5 block text-sm text-stone-600">{point.note}</span>}
              </span>
            </button>
            <a
              href={googleMapsUrl(point.lat, point.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 pt-1 text-sm font-semibold text-orange-700 hover:underline"
            >
              <Icon name="pin" className="h-4 w-4" />
              Google Maps ↗
            </a>
            {editing && (
              <button
                type="button"
                onClick={() => onDelete(point)}
                aria-label={`Delete ${point.name}`}
                className="shrink-0 px-1 pt-1 text-stone-400 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
