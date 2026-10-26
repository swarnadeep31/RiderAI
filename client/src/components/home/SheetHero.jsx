import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatTime } from '../../lib/time.js';
import { SheetMap, useAutoRide } from '../art/Sheet.jsx';
import { PLACES } from '../art/sheetMap.js';

// The sample ride's video is this long; the scale bar runs from 0:00 to here.
const SAMPLE_VIDEO_SEC = 41 * 60 + 40;

// The first screen. Its left side says what TrailCast is; its right side shows
// it: a sheet of the Manali–Rohtang road whose scale bar is the video's
// timeline. The rider rides on their own; dragging the scale bar takes over,
// as dragging along a trail's route moves its video.
export default function SheetHero({ shareLink }) {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress, still] = useAutoRide({ paused });
  const [along, setAlong] = useState(null);
  const resume = useRef(null);

  // After the visitor lets go, the ride carries on by itself a little later.
  useEffect(() => () => clearTimeout(resume.current), []);
  function takeOver(value) {
    setPaused(true);
    setProgress(value);
    clearTimeout(resume.current);
    resume.current = setTimeout(() => setPaused(false), 6000);
  }

  const seconds = Math.round(progress * SAMPLE_VIDEO_SEC);
  // The next place ahead (the rider starts at the first one).
  const nextIndex = along ? along.findIndex((a, i) => i > 0 && a > progress + 0.002) : 1;
  const next = nextIndex === -1 ? null : PLACES[nextIndex];
  const last = along ? PLACES[Math.max(0, (nextIndex === -1 ? PLACES.length : nextIndex) - 1)] : PLACES[0];

  return (
    <section className="mx-auto grid max-w-7xl gap-x-12 gap-y-10 px-4 pt-10 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center lg:pt-16">
      <div className="motion-safe:animate-rise">
        <h1 className="text-display uppercase">
          Watch the ride.
          <br />
          Follow the road.
        </h1>
        <p className="mt-6 max-w-[34rem] text-lead text-ink-soft">
          Ride and trek videos from YouTube with the map beside them: the route, a dot that moves with the video, and
          every stop on the way. Then take the stops for your own trip.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#rides" className="btn-primary">
            Explore the rides
          </a>
          <Link to={shareLink} className="btn-secondary">
            Share your ride
          </Link>
          <Link to="/tour" className="btn-ghost">
            Take the 1-minute tour
          </Link>
        </div>
      </div>

      <figure className="motion-safe:animate-rise [animation-delay:120ms]">
        <div className="flex items-baseline justify-between gap-4 pb-2">
          <figcaption className="margin-text">Manali to Rohtang La · a sample ride</figcaption>
          <span className="margin-text hidden sm:inline">Sketch · not to scale</span>
        </div>
        <div className="neatline bg-paper">
          <SheetMap progress={progress} onPlaces={setAlong} className="block h-auto w-full" />
        </div>

        {/* The scale bar is the video's timeline. */}
        <div className="mt-5">
          <label htmlFor="sheet-timeline" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium">
              <span className="text-water">▶ {formatTime(seconds)}</span>
              <span className="text-ink-soft"> in the video · </span>
              {next ? (
                <>
                  past {last.name}, next <span className="font-semibold">{next.name}</span>
                </>
              ) : (
                <>
                  at <span className="font-semibold">{last.name}</span>, {last.height.toLocaleString('en-IN')} m
                </>
              )}
            </span>
            <span className="text-small text-ink-soft">{still ? 'Drag the scale bar' : 'Drag to take over'}</span>
          </label>
          <input
            id="sheet-timeline"
            type="range"
            min="0"
            max="1000"
            value={Math.round(progress * 1000)}
            onChange={(event) => takeOver(Number(event.target.value) / 1000)}
            onPointerDown={() => setPaused(true)}
            aria-valuetext={`${formatTime(seconds)} into the video${next ? `, next ${next.name}` : `, at ${last.name}`}`}
            className="scale-range mt-1"
          />
          <div className="flex justify-between text-small text-ink-soft tabular-nums">
            <span>0:00</span>
            <span>{formatTime(SAMPLE_VIDEO_SEC)}</span>
          </div>
        </div>
      </figure>
    </section>
  );
}
