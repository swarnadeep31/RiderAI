// A corner of a map sheet where the road stops: the rider at the end of the
// red road, a dotted track going on into blank paper, and the sheet's
// lettering for why ("Unsurveyed", "Road closed"). Drawn for the error pages.
const CONTOURS = [
  'M206 40c34-14 82-12 108 8s30 58 4 78-80 22-110 4-36-76-2-90z',
  'M222 56c26-10 60-8 78 6s20 40 2 54-56 16-78 2-26-52-2-62z',
  'M238 72c18-6 40-4 52 6s12 26 0 34-36 10-50 0-18-34-2-40z',
  'M254 86c10-3 22-2 28 4s6 14-1 18-19 4-26-1-9-18-1-21z',
  'M18 118c30-20 74-24 104-8s34 44 8 58-70 14-98 0-44-30-14-50z',
  'M38 128c22-12 50-14 70-4s22 28 4 38-46 8-64-2-30-20-10-32z',
];

export default function RoadEnds({ sign, className = '' }) {
  return (
    <svg viewBox="0 0 360 240" className={className} aria-hidden="true">
      <rect width="360" height="240" className="fill-paper" />
      {/* The hills, as contour lines; every fourth one bolder, as on the sheets. */}
      {CONTOURS.map((d, i) => (
        <path key={d} d={d} className="fill-none stroke-contour" strokeOpacity={0.55} strokeWidth={i === 2 || i === 5 ? 1.4 : 0.8} />
      ))}
      {/* A river down the valley. */}
      <path d="M0 205c40-6 70-24 104-22s58 24 96 20 70-30 110-34 50 4 50 4" className="fill-none stroke-water" strokeOpacity={0.6} strokeWidth="2.5" />
      {/* The road, cased in ink, up to where the rider stopped. */}
      <path d="M-6 232c28-14 52-36 82-46s58-6 82-22 26-36 40-50" className="fill-none stroke-ink" strokeWidth="8" strokeLinecap="round" />
      <path d="M-6 232c28-14 52-36 82-46s58-6 82-22 26-36 40-50" className="fill-none stroke-road" strokeWidth="4.5" strokeLinecap="round" />
      {/* From there, only a track nobody has mapped. */}
      <path d="M198 114c12-12 22-30 38-40s40-14 58-28 26-26 40-40" className="fill-none stroke-ink" strokeOpacity={0.7} strokeWidth="1.6" strokeDasharray="2 6" strokeLinecap="round" />
      <circle cx="198" cy="114" r="7" className="fill-water stroke-paper" strokeWidth="2.5" />
      <text x="296" y="230" textAnchor="middle" className="fill-ink-soft font-display text-[17px] font-semibold tracking-[0.18em] uppercase">
        {sign}
      </text>
    </svg>
  );
}
