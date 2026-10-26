import { formatMetres } from '../lib/elevation.js';
import { daysText, distanceText, explain } from '../lib/stats.js';

// One figure in the sheet's margin: big value, small label under it.
// onClick: the value is a button (e.g. watch the moment at the highest point).
export function Readout({ value, label, title, onClick, before = null }) {
  return (
    <div title={title} className="flex flex-col-reverse">
      <dt className="margin-text mt-1">{label}</dt>
      <dd className="font-display text-[1.75rem] leading-none font-semibold tabular-nums">
        {onClick ? (
          <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 decoration-road decoration-2 underline-offset-4 hover:underline">
            {before}
            {value}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {before}
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

// The ride's numbers, set like the margin of a map sheet. A number that isn't
// known isn't shown. Hovering one says how it was worked out; the highest
// point can be clicked to watch that moment. extra: more readouts (the longest
// stretch without fuel).
export default function TripStats({ stats, onHighest, extra = null, className = '' }) {
  const why = explain(stats);
  const readouts = [
    { key: 'distance', value: distanceText(stats), label: 'Distance', title: why.distance },
    { key: 'days', value: daysText(stats), label: 'Riding', title: why.days },
    Number.isFinite(stats?.highestM) && {
      key: 'highest',
      value: `${formatMetres(stats.highestM)} m`,
      label: stats.highestName ? `Highest · ${stats.highestName}` : 'Highest point',
      title: why.highest,
      onClick: onHighest,
    },
    Number.isFinite(stats?.ascentM) && { key: 'climb', value: `${formatMetres(stats.ascentM)} m`, label: 'Total climb', title: why.climb },
  ].filter((r) => r && r.value);
  if (readouts.length === 0 && !extra) return null;

  return (
    <dl className={`flex flex-wrap gap-x-8 gap-y-4 border-y border-ink/15 py-4 ${className}`} aria-label="Trip stats">
      {readouts.map(({ key, ...r }) => (
        <Readout key={key} {...r} />
      ))}
      {extra}
    </dl>
  );
}
