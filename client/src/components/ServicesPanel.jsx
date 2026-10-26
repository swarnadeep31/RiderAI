import { useMemo } from 'react';
import { googleMapsUrl } from '../lib/exports.js';
import { FUEL_CAVEAT, KIND_ORDER, SERVICE_KINDS, fuelGapSentence, kmAlong, kmLength, longGaps, offRoute, serviceName } from '../lib/services.js';
import { formatTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';
import SectionHeading from './SectionHeading.jsx';

// A service's round symbol: its colour and its own letter (so colour is never the only clue).
export function ServiceBadge({ kind, className = 'h-5 w-5 text-[11px]' }) {
  const { symbol, colour, ink } = SERVICE_KINDS[kind];
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-paper ${className}`} style={{ background: colour, color: ink }}>
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
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-ink/40" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="0" y="30" width="100%" height="8" className="fill-surface-2" />
          {gap && (
            <rect
              x={x(gap.fromM)}
              y="27"
              width={`${(gap.lengthM / lengthM) * 100}%`}
              height="14"
              fill="url(#fuel-gap-hatch)"
              className={warn ? 'stroke-road' : 'stroke-ink'}
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
        </svg>
        {gap && (
          <p
            className={`absolute top-0 flex -translate-x-1/2 items-center gap-1 text-small font-semibold whitespace-nowrap ${warn ? 'text-road' : 'text-ink'}`}
            style={{ left: `clamp(7rem, ${((gap.fromM + gap.lengthM / 2) / lengthM) * 100}%, calc(100% - 7rem))` }}
          >
            {warn && <Icon name="warning" className="h-4 w-4" />}
            {kmLength(gap.lengthM, approximate)} without a mapped fuel station
          </p>
        )}
        {stations.map((station) => (
          <span key={station.osm} className="absolute top-[34px] -translate-x-1/2 -translate-y-1/2" style={{ left: x(station.alongM) }} title={`${serviceName(station)} · ${kmAlong(station.alongM, approximate)}`}>
            <ServiceBadge kind="fuel" className="h-4 w-4 text-[9px]" />
          </span>
        ))}
      </div>
      <div className="flex justify-between text-small text-ink-soft tabular-nums">
        <span>Start</span>
        <span>{kmLength(lengthM, approximate)}</span>
      </div>
    </figure>
  );
}

// "Along the route": fuel stops, mechanics, medical help and ATMs near the
// route from OpenStreetMap, in the order the rider passes them. The legend
// switches each kind on or off (on the map too); the time watches the moment
// the rider passes.
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
    <section className="space-y-4">
      <SectionHeading aside={items.length > 0 && `${items.length} nearby`}>Along the route</SectionHeading>

      {services.status === 'pending' && (
        <p className="flex items-center gap-2 text-ink-soft">
          <Icon name="compass" className="h-4 w-4 text-road motion-safe:animate-spin" /> Finding fuel stops along the route…
        </p>
      )}
      {services.status === 'failed' && <p className="text-ink-soft">Couldn&apos;t load the fuel stops right now. The rest of the page works as normal.</p>}
      {services.status === 'unavailable' && (
        <p className="text-ink-soft">This route is drawn as straight lines, so the fuel stops near it can&apos;t be worked out. Draw it along roads or footpaths instead.</p>
      )}

      {services.status === 'ready' && (
        <>
          {/* The legend: each kind's symbol, how many, and whether it's shown. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show on the map and in the list">
            {KIND_ORDER.map((kind) => {
              const on = visibleKinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleKind(kind)}
                  className={`inline-flex items-center gap-2 rounded-[3px] py-1.5 pr-3 pl-2 font-medium transition-colors ${
                    on ? 'bg-paper text-ink ring-[1.5px] ring-ink' : 'text-ink-soft ring-1 ring-ink/20 hover:text-ink'
                  }`}
                >
                  <span className={on ? '' : 'opacity-40 grayscale'}>
                    <ServiceBadge kind={kind} />
                  </span>
                  {SERVICE_KINDS[kind].plural}
                  <span className="text-small text-ink-soft tabular-nums">{counts[kind]}</span>
                </button>
              );
            })}
          </div>

          {visibleKinds.has('fuel') && <FuelStrip stations={items.filter((item) => item.kind === 'fuel')} gap={gaps[0]} lengthM={lengthM} approximate={approximate} warnKm={warnKm} />}

          {rows.length === 0 ? (
            <p className="text-ink-soft">{items.length === 0 ? 'Nothing mapped near this route.' : 'Switch a kind on to list it.'}</p>
          ) : (
            <ol className="max-h-96 divide-y divide-ink/12 overflow-y-auto border-y border-ink/12">
              {rows.map((row) =>
                row.type === 'gap' ? (
                  <li key={`gap-${row.gap.fromM}`} className="flex items-center gap-2 bg-road/8 px-3 py-2 font-semibold text-road">
                    <Icon name="warning" className="h-4 w-4 shrink-0" /> {kmLength(row.gap.lengthM, approximate)} with no mapped fuel station
                  </li>
                ) : (
                  <ServiceRow key={row.item.osm} item={row.item} approximate={approximate} moment={momentAt(row.item.alongM)} onSeek={onSeek} onFocus={onFocus} />
                ),
              )}
            </ol>
          )}
          {visibleKinds.has('fuel') && <p className="text-small text-ink-soft">{FUEL_CAVEAT}</p>}
        </>
      )}
    </section>
  );
}

function ServiceRow({ item, approximate, moment, onSeek, onFocus }) {
  const details = [item.brand && item.name ? item.brand : null, item.place, offRoute(item)].filter(Boolean);
  return (
    <li className="flex items-start gap-3 px-1 py-2.5">
      <ServiceBadge kind={item.kind} className="mt-0.5 h-5 w-5 text-[11px]" />
      <span className="w-16 shrink-0 pt-0.5 text-small text-ink-soft tabular-nums">{kmAlong(item.alongM, approximate)}</span>
      <span className="min-w-0 flex-1">
        <button type="button" onClick={() => onFocus([item.lat, item.lng])} className="text-left font-semibold hover:text-road" title="Show on the map">
          {serviceName(item)}
        </button>
        {item.emergency && <span className="tag ml-1.5 bg-road/10 text-road">Emergency</span>}
        {details.length > 0 && <span className="block text-small text-ink-soft">{details.join(' · ')}</span>}
        {item.hours && <span className="block text-small text-ink-soft">Open: {item.hours}</span>}
      </span>
      {moment && !moment.outside && (
        <button
          type="button"
          onClick={() => onSeek(moment.time)}
          className="inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-small font-semibold text-water tabular-nums hover:bg-water-tint"
          title="Watch the moment the rider passes"
        >
          <Icon name="video" className="h-3.5 w-3.5" />
          {formatTime(moment.time)}
        </button>
      )}
      <a
        href={googleMapsUrl(item.lat, item.lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-small font-semibold text-ink underline-offset-4 hover:underline"
        aria-label={`Open ${serviceName(item)} in Google Maps`}
      >
        Maps <Icon name="external" className="h-3.5 w-3.5" />
      </a>
    </li>
  );
}
