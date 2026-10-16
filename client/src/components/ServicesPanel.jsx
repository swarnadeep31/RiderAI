import { useMemo } from 'react';
import { googleMapsUrl } from '../lib/exports.js';
import { FUEL_CAVEAT, KIND_ORDER, SERVICE_KINDS, fuelGapSentence, kmAlong, kmLength, longGaps, offRoute, serviceName } from '../lib/services.js';
import { formatTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';
import SectionHeading from './SectionHeading.jsx';

// A service's round icon: its colour and its own symbol (so colour is never the only clue).
export function ServiceBadge({ kind, className = 'h-5 w-5 text-[11px]' }) {
  const { symbol, colour, ink } = SERVICE_KINDS[kind];
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white ${className}`} style={{ background: colour, color: ink }}>
      {symbol}
    </span>
  );
}

// The route as a straight bar with the fuel stations on it, and the longest
// stretch without one hatched and outlined, with a label (so the warning
// never relies on colour alone).
function FuelStrip({ stations, gap, lengthM, approximate, warnKm }) {
  const x = (m) => `${(m / lengthM) * 100}%`;
  const warn = gap && gap.lengthM >= warnKm * 1000;
  return (
    <figure className="space-y-1">
      <div className="relative h-14" role="img" aria-label={fuelGapSentence(gap, approximate) ?? 'Fuel stations along the route'}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <pattern id="fuel-gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-stone-400" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="0" y="30" width="100%" height="8" rx="4" className="fill-stone-200" />
          {gap && (
            <rect
              x={x(gap.fromM)}
              y="27"
              width={`${(gap.lengthM / lengthM) * 100}%`}
              height="14"
              rx="3"
              fill="url(#fuel-gap-hatch)"
              className="stroke-ink"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
        </svg>
        {gap && (
          <p
            className="absolute top-0 -translate-x-1/2 text-xs font-semibold whitespace-nowrap text-ink"
            style={{ left: `clamp(7rem, ${((gap.fromM + gap.lengthM / 2) / lengthM) * 100}%, calc(100% - 7rem))` }}
          >
            {warn && '⚠ '}
            {kmLength(gap.lengthM, approximate)} without a mapped fuel station
          </p>
        )}
        {stations.map((station) => (
          <span key={station.osm} className="absolute top-[34px] -translate-x-1/2 -translate-y-1/2" style={{ left: x(station.alongM) }} title={`${serviceName(station)} · ${kmAlong(station.alongM, approximate)}`}>
            <ServiceBadge kind="fuel" className="h-4 w-4 text-[9px]" />
          </span>
        ))}
      </div>
      <div className="flex justify-between text-xs text-stone-500">
        <span>Start</span>
        <span>{kmLength(lengthM, approximate)}</span>
      </div>
    </figure>
  );
}

// "Along the route": fuel stops, mechanics, medical help and ATMs near the
// route from OpenStreetMap, in the order the rider passes them. Chips switch
// each kind on or off (on the map too); ▶ watches the moment the rider passes.
export default function ServicesPanel({ services, lengthM, approximate, warnKm, visibleKinds, onToggleKind, momentAt, onSeek, onFocus }) {
  const items = services?.status === 'ready' ? services.items : [];
  const counts = useMemo(() => Object.fromEntries(KIND_ORDER.map((kind) => [kind, items.filter((item) => item.kind === kind).length])), [items]);
  const gaps = services?.status === 'ready' ? services.fuelGaps : [];
  const warnings = longGaps(gaps, warnKm);

  // The list: the visible kinds, with a warning row where each long stretch without fuel starts.
  const rows = useMemo(() => {
    const list = items.filter((item) => visibleKinds.has(item.kind)).map((item) => ({ type: 'item', at: item.alongM, item }));
    if (visibleKinds.has('fuel')) for (const gap of warnings) list.push({ type: 'gap', at: gap.fromM + 0.5, gap });
    return list.sort((a, b) => a.at - b.at);
  }, [items, visibleKinds, warnings]);

  // Nothing to say without a route, or with the feature switched off.
  if (!services || (services.status === 'unavailable' && services.reason !== 'straight')) return null;

  return (
    <section className="space-y-3">
      <SectionHeading icon="route" iconClass="bg-pine-100 text-pine-700 dark:bg-pine-900/70 dark:text-pine-300" aside={items.length > 0 && `${items.length} nearby`}>
        Along the route
      </SectionHeading>
      <div className="card space-y-4 p-5">

      {services.status === 'pending' && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Icon name="compass" className="h-4 w-4 text-orange-500 motion-safe:animate-spin" /> Finding fuel stops along the route…
        </p>
      )}
      {services.status === 'failed' && <p className="text-sm text-stone-600">Couldn't load fuel stops right now. The rest of the page works as normal.</p>}
      {services.status === 'unavailable' && (
        <p className="text-sm text-stone-600">This route is drawn as straight lines, so the fuel stops near it can't be worked out. Draw it along roads or footpaths instead.</p>
      )}

      {services.status === 'ready' && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show on the map and in the list">
            {KIND_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={visibleKinds.has(kind)}
                onClick={() => onToggleKind(kind)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 transition ${
                  visibleKinds.has(kind) ? 'bg-surface text-stone-800 shadow-sm ring-stone-900/15' : 'bg-transparent text-stone-500 ring-stone-900/10 line-through'
                }`}
              >
                <ServiceBadge kind={kind} />
                {SERVICE_KINDS[kind].plural} {counts[kind]}
              </button>
            ))}
          </div>

          {visibleKinds.has('fuel') && (
            <FuelStrip stations={items.filter((item) => item.kind === 'fuel')} gap={gaps[0]} lengthM={lengthM} approximate={approximate} warnKm={warnKm} />
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-stone-600">{items.length === 0 ? 'Nothing mapped near this route.' : 'Switch a kind on to list it.'}</p>
          ) : (
            <ol className="max-h-96 divide-y divide-stone-100 overflow-y-auto rounded-2xl border border-stone-200 text-sm">
              {rows.map((row) =>
                row.type === 'gap' ? (
                  <li key={`gap-${row.gap.fromM}`} className="flex items-center gap-2 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                    <span aria-hidden="true">⚠</span> {kmLength(row.gap.lengthM, approximate)} with no mapped fuel station
                  </li>
                ) : (
                  <ServiceRow key={row.item.osm} item={row.item} approximate={approximate} moment={momentAt(row.item.alongM)} onSeek={onSeek} onFocus={onFocus} />
                ),
              )}
            </ol>
          )}
        </>
      )}

      {services.status === 'ready' && visibleKinds.has('fuel') && <p className="text-xs text-stone-500">{FUEL_CAVEAT}</p>}
      </div>
    </section>
  );
}

function ServiceRow({ item, approximate, moment, onSeek, onFocus }) {
  const details = [item.brand && item.name ? item.brand : null, item.place, offRoute(item)].filter(Boolean);
  return (
    <li className="flex items-start gap-2.5 px-3 py-2">
      <ServiceBadge kind={item.kind} className="mt-0.5 h-5 w-5 text-[11px]" />
      <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-stone-500">{kmAlong(item.alongM, approximate)}</span>
      <span className="min-w-0 flex-1">
        <button type="button" onClick={() => onFocus([item.lat, item.lng])} className="text-left font-semibold text-ink hover:underline" title="Show on the map">
          {serviceName(item)}
        </button>
        {item.emergency && <span className="badge ml-1.5 bg-red-100 text-red-800">Emergency</span>}
        {details.length > 0 && <span className="block text-xs text-stone-500">{details.join(' · ')}</span>}
        {item.hours && <span className="block text-xs text-stone-500">Open: {item.hours}</span>}
      </span>
      {moment && !moment.outside && (
        <button type="button" onClick={() => onSeek(moment.time)} className="shrink-0 pt-0.5 font-mono text-xs font-semibold text-orange-700 hover:underline" title="Watch the moment the rider passes">
          ▶ {formatTime(moment.time)}
        </button>
      )}
      <a href={googleMapsUrl(item.lat, item.lng)} target="_blank" rel="noopener noreferrer" className="shrink-0 pt-0.5 text-xs font-semibold text-orange-700 hover:underline" aria-label={`Open ${serviceName(item)} in Google Maps`}>
        Maps ↗
      </a>
    </li>
  );
}
