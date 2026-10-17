import { climbText, daysText, distanceText, explain, highestText } from '../lib/stats.js';
import Icon from './art/Icon.jsx';

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-stone-800 shadow-sm ring-1 ring-stone-900/10';

// One row of chips under a trail's title: distance, riding days, highest
// point, total climb, plus `extra` chips (the longest stretch without fuel).
// A number that isn't known has no chip. Hovering a chip says how it was
// worked out; the highest point can be clicked to watch that moment.
export default function TripStats({ stats, onHighest, extra = null, className = '' }) {
  const why = explain(stats);
  const chips = [
    { key: 'distance', text: distanceText(stats), icon: 'route', title: why.distance },
    { key: 'days', text: daysText(stats), icon: 'tent', title: why.days },
    { key: 'highest', text: highestText(stats), icon: 'summit', title: why.highest, onClick: onHighest },
    { key: 'climb', text: climbText(stats), icon: 'ascent', title: why.climb },
  ].filter((chip) => chip.text);
  if (chips.length === 0 && !extra) return null;

  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Trip stats">
      {chips.map((chip) => (
        <li key={chip.key}>
          {chip.onClick ? (
            <button type="button" onClick={chip.onClick} title={chip.title} className={`${chipClass} transition hover:-translate-y-0.5 hover:ring-orange-300`}>
              <Icon name={chip.icon} className="h-4 w-4 text-orange-600" />
              {chip.text}
            </button>
          ) : (
            <span title={chip.title} className={chipClass}>
              <Icon name={chip.icon} className="h-4 w-4 text-pine-600 dark:text-pine-300" />
              {chip.text}
            </span>
          )}
        </li>
      ))}
      {extra}
    </ul>
  );
}
