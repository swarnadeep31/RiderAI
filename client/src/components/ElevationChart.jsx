import { useEffect, useMemo, useRef, useState } from 'react';
import { formatKm, formatMetres, heightAxis, kmTicks } from '../lib/elevation.js';
import { formatTime } from '../lib/time.js';
import { distanceAtTime, hiddenRangeAt, locationAtDistance, videoTimeAtDistance } from '../lib/track.js';

const HEIGHT = 136;
const MARGIN = { top: 24, right: 14, bottom: 22, left: 44 };

// Index of the sample nearest `alongM` (d is sorted).
function nearestSample(d, alongM) {
  let lo = 0;
  let hi = d.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid] <= alongM) lo = mid;
    else hi = mid;
  }
  return alongM - d[lo] <= d[hi] - alongM ? lo : hi;
}

// The height of the route under the map, with a blue line at the current
// moment of the video. Hover (or touch) to see a spot's distance, height and
// video moment, click to watch from there. With the chart focused, the arrow
// keys step 1 km and Enter jumps.
// profile: { d, e, summary } (see server/src/routeExtras/profile.js).
// route: { track, cum, trackTimes, videoStartsAt, hiddenRanges }.
// highestName: the place to name the highest point after; overnights: [{ alongM, label }].
export default function ElevationChart({ profile, route, clock, approximate, highestName, overnights = [], getDuration, onSeek, onHover }) {
  const { d, e, summary } = profile;
  const total = d.at(-1);
  const wrapRef = useRef(null);
  const cursorRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null); // index into d/e
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const playable = route.trackTimes?.length > 0 && route.trackTimes.length === route.track.length;
  const axis = useMemo(() => heightAxis([...e, summary?.highestM ?? -Infinity].filter(Number.isFinite)), [e, summary]);
  const ticks = useMemo(() => kmTicks(total), [total]);

  // Draw at the width the chart really has, so text stays crisp.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (m) => MARGIN.left + (m / total) * plotWidth;
  const y = (h) => MARGIN.top + (1 - (h - axis.min) / (axis.max - axis.min)) * plotHeight;

  const line = useMemo(() => {
    if (!width) return '';
    return d.map((m, i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(e[i]).toFixed(1)}`).join('');
    // x and y only change with these.
  }, [d, e, width, axis]);

  // The current moment of the video: drawn straight onto the chart about 60
  // times a second, outside React, like the marker on the map.
  useEffect(() => {
    if (!playable || !width || !clock) return undefined;
    let frame;
    let last = null;
    const draw = () => {
      const t = clock.now();
      if (t !== last) {
        last = t;
        const cursor = cursorRef.current;
        const recordingTime = t + (route.videoStartsAt ?? 0);
        const outside = recordingTime < route.trackTimes[0] || recordingTime > route.trackTimes.at(-1) || hiddenRangeAt(route.hiddenRanges, t);
        if (outside) cursor?.setAttribute('visibility', 'hidden');
        else {
          const px = x(distanceAtTime(route.cum, route.trackTimes, recordingTime)).toFixed(1);
          cursor?.setAttribute('x1', px);
          cursor?.setAttribute('x2', px);
          cursor?.setAttribute('visibility', 'visible');
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playable, width, clock, route, total, axis]);

  // The spot under the pointer also shows on the map.
  useEffect(() => {
    onHoverRef.current?.(hover === null ? null : locationAtDistance(route.track, route.cum, d[hover]));
  }, [hover, route, d]);
  useEffect(() => () => onHoverRef.current?.(null), []);

  const momentAt = (i) => (playable ? videoTimeAtDistance(route, d[i], { duration: getDuration?.() ?? 0 }) : null);
  const hoverMoment = hover === null ? null : momentAt(hover);

  function sampleAtPointer(event) {
    const rect = wrapRef.current.getBoundingClientRect();
    const m = ((event.clientX - rect.left - MARGIN.left) / plotWidth) * total;
    return nearestSample(d, Math.min(Math.max(m, 0), total));
  }

  function watch(i) {
    const moment = momentAt(i);
    if (moment) onSeek?.(moment.time, { final: true, play: true });
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const from = hover ?? (playable ? nearestSample(d, distanceAtTime(route.cum, route.trackTimes, clock.now() + (route.videoStartsAt ?? 0))) : 0);
      const target = d[from] + (event.key === 'ArrowLeft' ? -1000 : 1000);
      setHover(nearestSample(d, Math.min(Math.max(target, 0), total)));
    } else if ((event.key === 'Enter' || event.key === ' ') && hover !== null) {
      event.preventDefault();
      watch(hover);
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  }

  const highestX = summary ? x(summary.highestAlongM) : null;
  const highestLabel = summary && `Highest ${formatMetres(summary.highestM)} m${highestName ? ` · ${highestName}` : ''}`;
  const describe =
    `Elevation from ${formatMetres(Math.min(...e))} m to ${formatMetres(summary?.highestM ?? Math.max(...e))} m` +
    (summary ? `; highest at km ${formatKm(summary.highestAlongM)}${highestName ? `, ${highestName}` : ''}.` : '.');
  const momentText = (moment) => {
    if (!moment) return '';
    if (moment.outside === 'before') return ' · The video starts later';
    if (moment.outside === 'after') return ' · The video ends before here';
    return ` · Click to watch · ${formatTime(moment.time)}`;
  };
  const hoverText = hover === null ? '' : `km ${formatKm(d[hover])} · ${formatMetres(e[hover])} m${momentText(hoverMoment)}`;

  return (
    <figure className="card px-3 pt-2.5 pb-1">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 text-sm">
        <span className="font-display font-bold text-ink">Elevation</span>
        {approximate && <span className="text-xs text-stone-500">Approximate: heights along the drawn route</span>}
      </figcaption>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label={`${describe} Use the left and right arrow keys to move 1 km, and Enter to watch from there.`}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
        onPointerMove={(event) => setHover(sampleAtPointer(event))}
        onPointerDown={(event) => setHover(sampleAtPointer(event))}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
        onPointerUp={(event) => watch(sampleAtPointer(event))}
        className={`relative touch-pan-y rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-sky-200 ${playable ? 'cursor-pointer' : ''}`}
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true" className="block overflow-visible">
            {axis.ticks.map((h) => (
              <g key={h}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(h)} y2={y(h)} className="stroke-stone-200" strokeWidth="1" />
                <text x={MARGIN.left - 6} y={y(h)} dy="0.32em" textAnchor="end" className="fill-stone-500 text-[11px] tabular-nums">
                  {formatMetres(h)}
                </text>
              </g>
            ))}
            {ticks.map((km) => (
              <text key={km} x={x(km * 1000)} y={HEIGHT - 6} textAnchor={km === 0 ? 'start' : 'middle'} className="fill-stone-500 text-[11px] tabular-nums">
                {km === 0 ? '0 km' : km}
              </text>
            ))}

            <path d={`${line}L${x(total).toFixed(1)},${y(axis.min)}L${x(0)},${y(axis.min)}Z`} className="elevation-wash" />
            <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="elevation-line" />

            {overnights.map((night) => (
              <g key={night.alongM}>
                <line x1={x(night.alongM)} x2={x(night.alongM)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="stroke-stone-400" strokeWidth="1" strokeDasharray="3 3" />
                <text x={x(night.alongM) + 4} y={HEIGHT - MARGIN.bottom - 5} className="fill-stone-600 text-[11px]">
                  {night.label}
                </text>
              </g>
            ))}

            {summary && (
              <g>
                <circle cx={highestX} cy={Math.max(y(summary.highestM), MARGIN.top)} r="4" strokeWidth="2" className="elevation-dot" />
                <text
                  x={highestX + (highestX > width / 2 ? -8 : 8)}
                  y={Math.max(y(summary.highestM), MARGIN.top) - 8}
                  textAnchor={highestX > width / 2 ? 'end' : 'start'}
                  className="fill-ink text-[11px] font-semibold"
                >
                  {highestLabel}
                </text>
              </g>
            )}

            {playable && (
              <line ref={cursorRef} y1={MARGIN.top - 4} y2={HEIGHT - MARGIN.bottom} strokeWidth="2" className="elevation-cursor" visibility="hidden" />
            )}

            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(d[hover])} x2={x(d[hover])} y1={MARGIN.top - 4} y2={HEIGHT - MARGIN.bottom} className="stroke-stone-400" strokeWidth="1" />
                <circle cx={x(d[hover])} cy={y(e[hover])} r="4" strokeWidth="2" className="elevation-dot" />
              </g>
            )}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <p
            className="pointer-events-none absolute top-0 z-10 rounded-lg bg-pine-950/90 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md"
            style={x(d[hover]) > width / 2 ? { right: width - x(d[hover]) + 8 } : { left: x(d[hover]) + 8 }}
          >
            {hoverText}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {hoverText}
        </p>
      </div>
    </figure>
  );
}
