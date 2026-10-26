// TrailCast's drawings, in the inks of a Survey of India map sheet.
import { memo, useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion.js';
import { CONTOURS, LAKE, PLACES, RIVER, ROAD, ROAD_IN, SHEET_SIZE } from './sheetMap.js';

// The logo: a tiny sheet with its neatline, two contours, the road in red and
// the rider in blue.
export function LogoMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="2" className="fill-paper stroke-ink" strokeWidth="2" />
      <path d="M4 22c4-6 9-8 14-6s8-2 10-8" fill="none" className="stroke-contour" strokeWidth="1.3" opacity="0.7" />
      <path d="M4 27c5-4 10-5 15-3s7-1 9-5" fill="none" className="stroke-contour" strokeWidth="1.3" opacity="0.7" />
      <path d="M6 26c4-1 6-5 9-8s6-2 7-6 3-5 5-6" fill="none" className="stroke-road" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="12" r="3" className="fill-water stroke-paper" strokeWidth="1.5" />
    </svg>
  );
}

// The little motorbike and rider, facing right, wheels on y = 0.
function Rider() {
  return (
    <g>
      <circle cx="-9" cy="-6" r="5.5" className="fill-ink" />
      <circle cx="9" cy="-6" r="5.5" className="fill-ink" />
      <circle cx="-9" cy="-6" r="2" className="fill-paper" />
      <circle cx="9" cy="-6" r="2" className="fill-paper" />
      <path d="M-9-6-3-13H5l4 7" className="stroke-ink" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M-5-12c2-5 8-5 11-1l-2 3h-8z" className="fill-road" />
      <path d="M-2-13 1-21l5 4" className="stroke-ink" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2" cy="-25" r="4" className="fill-water" />
    </g>
  );
}

// What never moves: contours, the valley's forest, the river, the lake and the road.
const SheetGround = memo(function SheetGround({ id }) {
  return (
    <>
      <path d={RIVER} fill="none" className="stroke-field" strokeWidth="170" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="none" className="stroke-contour">
        {CONTOURS.map((c) => (
          <path key={c.level} d={c.d} strokeWidth={c.index ? 1.3 : 0.6} strokeOpacity={c.index ? 0.7 : 0.38} />
        ))}
      </g>
      <path d={LAKE} className="fill-water-tint stroke-water" strokeWidth="1.5" />
      <path d={RIVER} fill="none" className="stroke-water" strokeWidth="3" strokeLinecap="round" />
      <text className="fill-water font-sans text-[17px] italic" letterSpacing="2">
        <textPath href={`#${id}-river`} startOffset="38%">
          Beas
        </textPath>
      </text>
      <path id={`${id}-river`} d={RIVER} fill="none" stroke="none" />
      {[ROAD_IN, ROAD].map((d) => (
        <g key={d}>
          <path d={d} fill="none" className="stroke-ink" strokeWidth="7.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" className="stroke-road" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
    </>
  );
});

// Where each place's label sits beside its pin (so none covers the road).
const LABEL_OFFSET = { Manali: [18, 10], Kothi: [18, 22], Gulaba: [-18, -18], Marhi: [18, 24], 'Rohtang La': [-20, -26] };

// The home page's sketch map of the Manali–Rohtang road (not survey data).
// progress: how far along the road the rider is, 0 to 1. Each place's pin
// drops once the rider has passed it. onPlaces: told each place's position
// along the road (0 to 1), once measured.
export function SheetMap({ progress, onPlaces, className = '' }) {
  const id = useId().replace(/:/g, '');
  const road = useRef(null);
  const [along, setAlong] = useState(null);
  const [rider, setRider] = useState({ x: PLACES[0].at[0], y: PLACES[0].at[1], angle: 0 });
  const [width, height] = SHEET_SIZE;

  // Each place's share of the way along the road, from the drawn road itself.
  useEffect(() => {
    const path = road.current;
    if (!path?.getTotalLength) return;
    const total = path.getTotalLength();
    const steps = 600;
    const samples = Array.from({ length: steps + 1 }, (_, i) => {
      const p = path.getPointAtLength((total * i) / steps);
      return [p.x, p.y, i / steps];
    });
    const measured = PLACES.map((place) => {
      let best = samples[0];
      for (const s of samples) if (Math.hypot(s[0] - place.at[0], s[1] - place.at[1]) < Math.hypot(best[0] - place.at[0], best[1] - place.at[1])) best = s;
      return best[2];
    });
    setAlong(measured);
    onPlaces?.(measured);
    // The road and places never change.
  }, []);

  // The rider sits on the road at `progress`, turned to follow it.
  useEffect(() => {
    const path = road.current;
    if (!path?.getTotalLength) return;
    const total = path.getTotalLength();
    const at = Math.min(Math.max(progress, 0), 1) * total;
    const p = path.getPointAtLength(at);
    const ahead = path.getPointAtLength(Math.min(at + 2, total));
    const behind = path.getPointAtLength(Math.max(at - 2, 0));
    let angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
    // Keep the rider upright: face left on stretches that run back west.
    const flip = Math.abs(angle) > 90;
    if (flip) angle += angle > 0 ? -180 : 180;
    setRider({ x: p.x, y: p.y, angle, flip });
  }, [progress]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="A sketch map of the road from Manali up the Beas valley to Rohtang La, with a rider on it" className={className}>
      <rect width={width} height={height} className="fill-paper" />
      <SheetGround id={id} />
      <path ref={road} d={ROAD} fill="none" stroke="none" />

      {PLACES.map((place, i) => {
        const [dx, dy] = LABEL_OFFSET[place.name] ?? [14, -12];
        const shown = along ? progress + 0.002 >= along[i] : i === 0;
        return (
          <g key={place.name}>
            <g className="sheet-pin" data-shown={shown ? 'true' : 'false'}>
              <path
                d={`M${place.at[0]} ${place.at[1]}c-3-6-10-11-10-18a10 10 0 0 1 20 0c0 7-7 12-10 18z`}
                className="fill-road stroke-paper"
                strokeWidth="2.5"
              />
              <circle cx={place.at[0]} cy={place.at[1] - 18} r="3.5" className="fill-paper" />
            </g>
            <text
              x={place.at[0] + dx}
              y={place.at[1] + dy}
              textAnchor={dx < 0 ? 'end' : 'start'}
              className="fill-ink font-display text-[30px] font-semibold"
              paintOrder="stroke"
              stroke="var(--color-paper)"
              strokeWidth="6"
              strokeLinejoin="round"
            >
              {place.name}
              <tspan className="fill-contour font-sans text-[20px] font-semibold" dx="8">
                {place.height.toLocaleString('en-IN')} m
              </tspan>
            </text>
          </g>
        );
      })}

      <g transform={`translate(${rider.x} ${rider.y}) rotate(${rider.angle}) scale(${rider.flip ? -1.3 : 1.3} 1.3)`}>
        <Rider />
      </g>

      {/* North arrow, as every sheet has one. */}
      <g transform={`translate(${width - 56} 64)`} className="fill-ink">
        <path d="M0-30 10 8 0 2-10 8z" />
        <text y="30" textAnchor="middle" className="font-display text-[20px] font-semibold">
          N
        </text>
      </g>
    </svg>
  );
}

// The ride along the sheet on its own: the rider goes from Manali to Rohtang
// and starts again, unless the visitor has asked for less motion.
export function useAutoRide({ lapMs = 16000, paused = false } = {}) {
  const still = useReducedMotion();
  const [progress, setProgressState] = useState(still ? 1 : 0);
  const current = useRef(progress);
  const setProgress = (value) => {
    current.current = value;
    setProgressState(value);
  };
  useEffect(() => {
    if (still || paused) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      // Picks up from wherever the rider is (the visitor may have dragged
      // them), and rests at the pass for a moment before the next lap.
      const step = Math.min(now - last, 100) / lapMs;
      last = now;
      let next = current.current + step;
      if (next > 1.15) next = 0;
      current.current = next;
      setProgressState(Math.min(next, 1));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still, paused, lapMs]);
  return [progress, setProgress, still];
}
