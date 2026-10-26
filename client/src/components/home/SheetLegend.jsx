import { SERVICE_KINDS, KIND_ORDER } from '../../lib/services.js';

// The symbols, drawn the way they appear on a trail's page.
function Symbol({ kind }) {
  const box = 'h-10 w-16 shrink-0';
  if (kind === 'route') {
    return (
      <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
        <path d="M4 30c10-2 14-14 24-14s14 10 32-8" fill="none" className="stroke-ink" strokeWidth="7" strokeLinecap="round" />
        <path d="M4 30c10-2 14-14 24-14s14 10 32-8" fill="none" className="stroke-road" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'rider') {
    return (
      <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
        <path d="M4 30c10-2 14-14 24-14s14 10 32-8" fill="none" className="stroke-road" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
        <circle cx="29" cy="16" r="8" className="fill-water stroke-paper" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === 'climbs') {
    return (
      <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
        <path d="M2 36 12 28 20 30 32 12 40 20 50 6 62 22V38H2Z" className="fill-contour" fillOpacity="0.15" />
        <path d="M2 36 12 28 20 30 32 12 40 20 50 6 62 22" fill="none" className="stroke-contour" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="50" cy="6" r="3" className="fill-contour" />
      </svg>
    );
  }
  if (kind === 'places') {
    return (
      <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
        {[
          [12, 22, '1'],
          [32, 22, '2'],
          [52, 22, '3'],
        ].map(([x, y, n]) => (
          <g key={n}>
            <circle cx={x} cy={y} r="9" className={n === '2' ? 'fill-road' : 'fill-ink'} stroke="#fff" strokeWidth="2" />
            <text x={x} y={y + 4.5} textAnchor="middle" fill="#fff" className="font-sans text-[12px] font-bold">
              {n}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  if (kind === 'services') {
    return (
      <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
        {KIND_ORDER.map((service, i) => {
          const { symbol, colour, ink } = SERVICE_KINDS[service];
          const x = 9 + i * 15.5;
          return (
            <g key={service}>
              <circle cx={x} cy="20" r="7.5" fill={colour} stroke="#fff" strokeWidth="1.5" />
              <text x={x} y="24" textAnchor="middle" fill={ink} className="font-sans text-[10px] font-bold">
                {symbol}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true" className={box}>
      {['GPX', 'KML'].map((label, i) => (
        <g key={label}>
          <rect x={4 + i * 30} y="8" width="26" height="24" rx="2" className={i ? 'fill-paper stroke-ink' : 'fill-ink'} strokeWidth="1.5" />
          <text x={17 + i * 30} y="24" textAnchor="middle" className={`font-sans text-[9px] font-bold ${i ? 'fill-ink' : 'fill-paper'}`}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const ENTRIES = [
  { kind: 'route', term: 'The route', text: "From the rider's GPS file, worked out by AI from the places in the video, or tapped in by hand." },
  { kind: 'rider', term: 'The rider, now', text: 'Moves with the video. Drag it, or click anywhere on the route, and the video jumps there.' },
  { kind: 'places', term: 'The places', text: 'Every stop in the video, in order, with its moment. Click one to watch from there.' },
  { kind: 'climbs', term: 'The climbs', text: 'The heights along the way, with the highest pass marked. Drag along it to scrub the video too.' },
  { kind: 'services', term: 'Help on the road', text: 'Fuel, mechanics, medical help and ATMs near the route, and the longest stretch without fuel.' },
  { kind: 'take', term: 'Take it with you', text: 'A GPX file for Garmin or OsmAnd, KML for Google My Maps, or a trip sheet to print.' },
];

// "How it works", as a map sheet explains itself: a legend.
export default function SheetLegend() {
  return (
    <section id="how" className="mt-24 scroll-mt-16 bg-field">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h2 className="text-title uppercase">How to read a ride</h2>
            <p className="mt-4 max-w-md text-lead text-ink-soft">
              Every trail is a map sheet. Here is what you&apos;ll find on one, and what it&apos;s for.
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {ENTRIES.map((entry) => (
              <li key={entry.kind} className="flex gap-4">
                <Symbol kind={entry.kind} />
                <p>
                  <span className="block font-display text-[1.35rem] leading-tight font-semibold">{entry.term}</span>
                  <span className="mt-1 block text-ink-soft">{entry.text}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
