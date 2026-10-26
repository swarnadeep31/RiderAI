import { Link } from 'react-router';
import { cardSummary } from '../lib/stats.js';
import ActivityBadge from './ActivityBadge.jsx';
import Icon from './art/Icon.jsx';

// One ride on the home page: the video's picture, its name, how far and how
// long, and whose video it is. onDelete: only for the person who added it.
export default function TrailCard({ trail, onDelete }) {
  const aiRoute = trail.routeSource === 'keypoints' && trail.points.some((p) => p.origin === 'ai');
  const credit = trail.creatorName || trail.channel?.name;
  const summary = cardSummary(trail.stats);
  const places = trail.points.length;
  return (
    <li className="group relative">
      <Link to={`/trails/${trail._id}`} className="block h-full rounded-[3px] focus-visible:outline-offset-4">
        <div className="relative overflow-hidden rounded-[3px] bg-surface-2">
          <img
            src={`https://i.ytimg.com/vi/${trail.youtubeId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="aspect-video w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <ActivityBadge activity={trail.activity} className="absolute top-2.5 left-2.5 bg-paper/95 text-ink" />
        </div>
        <div className="pt-3">
          <h3 className="text-[1.45rem] leading-tight group-hover:text-road">{trail.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-ink-soft">
            {summary && <span className="font-semibold text-ink">{summary}</span>}
            {places > 0 && (
              <span>
                {places} {places === 1 ? 'place' : 'places'}
              </span>
            )}
            {aiRoute && (
              <span className="inline-flex items-center gap-1 text-water">
                <Icon name="sparkles" className="h-3.5 w-3.5" /> Route found by AI
              </span>
            )}
          </p>
          {credit && <p className="mt-0.5 text-small text-ink-soft">Video by {credit}</p>}
        </div>
      </Link>
      {/* Outside the link, so deleting doesn't open the trail. */}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(trail)}
          aria-label={`Delete “${trail.title}”`}
          title="Delete this trail"
          className="absolute top-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-[3px] bg-paper/95 text-road transition-colors hover:bg-road hover:text-road-ink"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
