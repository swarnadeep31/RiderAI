import { googleMapsUrl } from '../lib/exports.js';
import { formatTime } from '../lib/time.js';

export default function KeyPointList({ points, activePointId, editing, onSelect, onDelete }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        {editing ? 'No key points yet. Add the places you talk about in the video.' : 'No key points marked yet.'}
      </p>
    );
  }

  return (
    <ol className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
      {points.map((point, i) => {
        const active = point._id === activePointId;
        return (
          <li key={point._id} className={`flex items-start gap-3 p-3 ${active ? 'bg-orange-50' : ''}`}>
            <button
              type="button"
              onClick={() => onSelect(point)}
              className="flex flex-1 items-start gap-3 text-left"
              title="Jump to this moment"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${active ? 'bg-orange-600' : 'bg-stone-800'}`}
              >
                {i + 1}
              </span>
              <span>
                <span className="font-semibold">{point.name}</span>
                <span className="ml-2 font-mono text-xs text-stone-500">{formatTime(point.time)}</span>
                {point.note && <span className="mt-0.5 block text-sm text-stone-600">{point.note}</span>}
              </span>
            </button>
            <a
              href={googleMapsUrl(point.lat, point.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-medium text-orange-700 hover:underline"
            >
              Google Maps ↗
            </a>
            {editing && (
              <button
                type="button"
                onClick={() => onDelete(point)}
                aria-label={`Delete ${point.name}`}
                className="shrink-0 px-1 text-stone-400 hover:text-red-600"
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
