import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import Icon from '../components/art/Icon.jsx';
import { LogoMark } from '../components/art/Scenery.jsx';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

// Remembered in this browser, so the tour opens by itself only once.
export const TOUR_SEEN_KEY = 'trailcast.tourSeen';
export function tourSeen() {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return true; // no storage (a private window): don't keep sending people here
  }
}
function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // Not remembered; the tour may open again next time.
  }
}

// The pictures share one frame: a card the size of a phone screen's width.
function Frame({ children, label }) {
  return (
    <svg viewBox="0 0 360 240" role="img" aria-label={label} className="h-auto w-full max-w-md drop-shadow-xl">
      <rect x="0" y="0" width="360" height="240" rx="24" className="fill-surface" />
      {children}
    </svg>
  );
}

const ROUTE = 'M 210 196 C 232 160, 262 170, 268 136 S 300 92, 322 64';

// 1. A video, and beside it a map whose dot moves with the video.
function WatchPicture({ still }) {
  return (
    <Frame label="A video playing, with a map beside it where a dot follows the route">
      <rect x="18" y="40" width="160" height="104" rx="14" className="fill-pine-900" />
      <path d="M18 120 L60 84 L92 108 L124 70 L178 118 L178 130 Q178 144 164 144 L32 144 Q18 144 18 130 Z" className="fill-pine-700" />
      <circle cx="98" cy="92" r="16" fill="#ef4444" />
      <path d="M93 84 L106 92 L93 100 Z" fill="#fff" />
      <rect x="18" y="156" width="160" height="6" rx="3" className="fill-stone-200" />
      <rect x="18" y="156" width="160" height="6" rx="3" fill="#ea580c" className={still ? '' : 'tour-progress'} />
      <text x="18" y="186" className="fill-stone-500 text-[11px]">0:00</text>
      <text x="178" y="186" textAnchor="end" className="fill-stone-500 text-[11px]">12:30</text>

      <rect x="196" y="40" width="146" height="172" rx="14" className="fill-sand-100" />
      <path d="M196 120 Q240 100 260 128 T342 110" fill="none" className="stroke-pine-200" strokeWidth="10" opacity="0.6" />
      <path id="tour-route" d={ROUTE} fill="none" stroke="#ea580c" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
      <path d={ROUTE} fill="none" stroke="#ea580c" strokeWidth="5" strokeLinecap="round" pathLength="1" className="tour-draw" />
      <circle r="8" fill="#2563eb" stroke="#fff" strokeWidth="3" {...(still && { cx: 268, cy: 136 })}>
        {!still && (
          <animateMotion dur="6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1" keyTimes="0;1">
            <mpath href="#tour-route" />
          </animateMotion>
        )}
      </circle>
    </Frame>
  );
}

// 2. An elevation chart with a cursor gliding along, and a hand dragging it.
function ScrubPicture() {
  const line = 'M 30 190 L 70 170 L 105 176 L 140 130 L 175 142 L 215 80 L 250 100 L 290 62 L 330 120';
  return (
    <Frame label="An elevation chart with a cursor that moves the video">
      <text x="30" y="40" className="fill-ink text-[15px] font-bold">Elevation</text>
      <text x="290" y="54" textAnchor="middle" className="fill-ink text-[11px] font-semibold">5,328 m</text>
      {[90, 130, 170].map((y) => (
        <line key={y} x1="30" x2="330" y1={y} y2={y} className="stroke-stone-200" strokeWidth="1" />
      ))}
      <path d={`${line} L 330 200 L 30 200 Z`} fill="#1a8a5a" opacity="0.12" />
      <path d={line} fill="none" stroke="#1a8a5a" strokeWidth="3" strokeLinejoin="round" pathLength="1" className="tour-draw" />
      <circle cx="290" cy="62" r="5" fill="#1a8a5a" className="stroke-surface" strokeWidth="2" />
      <g className="tour-sweep" style={{ '--sweep': '250px' }}>
        <line x1="45" x2="45" y1="56" y2="200" stroke="#2563eb" strokeWidth="2.5" />
        <rect x="22" y="206" width="46" height="20" rx="10" fill="#2563eb" />
        <text x="45" y="220" textAnchor="middle" fill="#fff" className="text-[11px] font-bold">▶ 1:12</text>
      </g>
    </Frame>
  );
}

// 3. The fuel stations along the route, the longest stretch without one, and the trip's numbers.
function FuelPicture() {
  const stations = [40, 98, 128];
  return (
    <Frame label="Fuel stations along the route, and a warning about the longest stretch without one">
      <text x="24" y="40" className="fill-ink text-[15px] font-bold">Along the route</text>
      {[
        ['475 km', 24],
        ['2 days', 104],
        ['5,328 m', 176],
      ].map(([text, x], i) => (
        <g key={text} className="tour-rise" style={{ '--delay': `${0.1 + i * 0.12}s` }}>
          <rect x={x} y="56" width={text.length * 8 + 22} height="26" rx="13" className="fill-sand-100 stroke-stone-200" />
          <text x={x + 12} y="73" className="fill-ink text-[12px] font-semibold">{text}</text>
        </g>
      ))}
      <rect x="24" y="132" width="312" height="10" rx="5" className="fill-stone-200" />
      <g className="tour-rise" style={{ '--delay': '1.1s' }}>
        <rect x="128" y="126" width="208" height="22" rx="6" fill="none" className="stroke-ink" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="232" y="116" textAnchor="middle" className="fill-ink text-[12px] font-bold">⚠ 365 km without fuel</text>
      </g>
      {stations.map((x, i) => (
        <g key={x} className="tour-pop" style={{ '--delay': `${0.5 + i * 0.18}s` }}>
          <circle cx={x} cy="137" r="11" fill="#1baf7a" stroke="#fff" strokeWidth="2.5" />
          <text x={x} y="141.5" textAnchor="middle" fill="#0b201a" className="text-[11px] font-extrabold">F</text>
        </g>
      ))}
      {[
        ['M', '#eda100', 70],
        ['+', '#e87ba4', 200],
        ['₹', '#6250d6', 260],
      ].map(([symbol, colour, x], i) => (
        <g key={symbol} className="tour-pop" style={{ '--delay': `${1.4 + i * 0.15}s` }}>
          <circle cx={x} cy="186" r="11" fill={colour} stroke="#fff" strokeWidth="2.5" />
          <text x={x} y="190.5" textAnchor="middle" fill={symbol === '₹' ? '#fff' : '#0b201a'} className="text-[11px] font-extrabold">
            {symbol}
          </text>
        </g>
      ))}
      <text x="24" y="222" className="fill-stone-500 text-[11px]">Mechanics · medical help · ATMs</text>
    </Frame>
  );
}

// 4. Places found by AI popping onto the map, then joined into a route.
function AiPicture() {
  const places = [
    [56, 190],
    [118, 150],
    [190, 160],
    [246, 104],
    [310, 70],
  ];
  return (
    <Frame label="Places found by AI appearing on a map, then joined into a route">
      <rect x="16" y="16" width="328" height="208" rx="16" className="fill-sand-100" />
      <path d="M16 140 Q90 110 150 136 T344 120" fill="none" className="stroke-pine-200" strokeWidth="14" opacity="0.5" />
      <path
        d={`M ${places.map(([x, y]) => `${x} ${y}`).join(' L ')}`}
        fill="none"
        stroke="#7c3aed"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength="1"
        className="tour-draw"
        style={{ '--delay': '1.3s' }}
      />
      {places.map(([x, y], i) => (
        <g key={x} className="tour-pop" style={{ '--delay': `${0.15 + i * 0.22}s` }}>
          <circle cx={x} cy={y} r="13" className="fill-pine-800" stroke="#fff" strokeWidth="2.5" />
          <text x={x} y={y + 4.5} textAnchor="middle" fill="#fff" className="text-[12px] font-bold">
            {i + 1}
          </text>
        </g>
      ))}
      <g className="tour-pop" style={{ '--delay': '0.05s' }}>
        <rect x="200" y="186" width="128" height="26" rx="13" fill="#7c3aed" />
        <text x="264" y="203" textAnchor="middle" fill="#fff" className="text-[12px] font-bold">✦ Found by AI</text>
      </g>
    </Frame>
  );
}

// 5. The ways to take a trail along.
function TakeAlongPicture() {
  const tiles = [
    ['GPX', 'Garmin, OsmAnd', '#236c50'],
    ['KML', 'Google My Maps', '#0284c7'],
    ['PDF', 'Trip sheet', '#ea580c'],
  ];
  return (
    <Frame label="Download the route as GPX or KML, or print a trip sheet">
      {tiles.map(([title, text, colour], i) => (
        <g key={title} className="tour-rise" style={{ '--delay': `${0.1 + i * 0.15}s` }}>
          <rect x={24 + i * 108} y="54" width="96" height="132" rx="16" className="fill-sand-100 stroke-stone-200" />
          <rect x={44 + i * 108} y="74" width="56" height="56" rx="14" fill={colour} opacity="0.15" />
          <text x={72 + i * 108} y="109" textAnchor="middle" fill={colour} className="text-[15px] font-extrabold">
            {title}
          </text>
          <text x={72 + i * 108} y="160" textAnchor="middle" className="fill-stone-500 text-[10px]">
            {text}
          </text>
        </g>
      ))}
      <text x="180" y="216" textAnchor="middle" className="fill-ink text-[12px] font-semibold">Free · your video stays on YouTube</text>
    </Frame>
  );
}

const SLIDES = [
  {
    title: 'Adventure videos, with the map beside them',
    text: 'Watch a ride, trek or climb from YouTube and follow it on the map at the same time: the route, a dot that moves with the video, and every place they talk about.',
    Picture: WatchPicture,
  },
  {
    title: 'Jump to any moment',
    text: 'Click anywhere on the route, or drag the dot, and the video goes there. The elevation chart shows every climb and pass on the way.',
    Picture: ScrubPicture,
  },
  {
    title: 'Ride prepared',
    text: 'Fuel stations, mechanics, medical help and ATMs along the way, plus the longest stretch without fuel. Distance, days and the highest point at a glance.',
    Picture: FuelPicture,
  },
  {
    title: 'No GPS file? AI finds the places',
    text: 'Paste a YouTube link and AI spots the towns and landmarks in the video, then draws the route through them. You check the list in a minute.',
    Picture: AiPicture,
  },
  {
    title: 'Take it on the road',
    text: 'Download the route for Garmin, OsmAnd or Google Maps, or print a trip sheet. TrailCast is free, and your video stays on YouTube.',
    Picture: TakeAlongPicture,
  },
];

// A short, animated tour of what TrailCast does and why it helps, then a
// way to sign up or log in. Opens by itself on a first visit (once).
export default function TourPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const still = useReducedMotion();
  const [step, setStep] = useState(0);
  const last = SLIDES.length; // the step after the slides: sign up or log in
  const startX = useRef(null);

  useEffect(() => markTourSeen(), []);

  const go = (to) => setStep(Math.min(Math.max(to, 0), last));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') setStep((s) => Math.min(s + 1, last));
      if (event.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
      if (event.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, navigate]);

  const slide = SLIDES[step];

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: 'var(--sky-hero)' }}
      // Swipe left or right on a phone.
      onPointerDown={(event) => (startX.current = event.clientX)}
      onPointerUp={(event) => {
        if (startX.current === null) return;
        const moved = event.clientX - startX.current;
        startX.current = null;
        if (Math.abs(moved) > 60) go(step + (moved < 0 ? 1 : -1));
      }}
    >
      <div className="sky-night absolute inset-0" style={{ background: 'var(--sky-night)' }} aria-hidden="true" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
          <LogoMark className="h-9 w-9" />
          TrailCast
        </Link>
        {step < last && (
          <Link to="/" className="btn-ghost">
            Skip
          </Link>
        )}
      </header>

      {/* Progress: one bar per slide. */}
      <nav aria-label="Tour steps" className="relative z-10 mx-auto flex w-full max-w-5xl gap-1.5 px-4">
        {[...SLIDES, null].map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={i < last ? `Step ${i + 1}: ${SLIDES[i].title}` : 'Get started'}
            aria-current={i === step ? 'step' : undefined}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"
          >
            <span className={`block h-full rounded-full bg-orange-600 transition-all duration-500 ${i <= step ? 'w-full' : 'w-0'}`} />
          </button>
        ))}
      </nav>

      <section aria-live="polite" className="relative z-10 mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 py-8 lg:grid-cols-2 lg:gap-12">
        {step < last ? (
          <>
            <div key={`picture-${step}`} className="flex justify-center motion-safe:animate-fade-up lg:order-2">
              <slide.Picture still={still} />
            </div>
            <div key={`text-${step}`} className="motion-safe:animate-fade-up lg:order-1">
              <p className="eyebrow">
                {step + 1} of {SLIDES.length}
              </p>
              <h1 className="mt-4 text-4xl leading-tight font-extrabold text-ink sm:text-5xl">{slide.title}</h1>
              <p className="mt-4 max-w-lg text-lg text-stone-700">{slide.text}</p>
              <div className="mt-8 flex items-center gap-3">
                {step > 0 && (
                  <button type="button" onClick={() => go(step - 1)} className="btn-secondary px-5 py-2.5 text-base">
                    Back
                  </button>
                )}
                <button type="button" onClick={() => go(step + 1)} className="btn-primary px-6 py-2.5 text-base">
                  {step === SLIDES.length - 1 ? 'Get started' : 'Next'}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div key="finish" className="mx-auto max-w-xl text-center motion-safe:animate-fade-up lg:col-span-2">
            <LogoMark className="mx-auto h-16 w-16" />
            <h1 className="mt-6 text-4xl leading-tight font-extrabold text-ink sm:text-5xl">Ready to ride along?</h1>
            <p className="mt-4 text-lg text-stone-700">
              {user
                ? "You're all set. Find a trail to watch, or add your own."
                : 'Create a free account to share your own trips, or just start watching. It takes a minute, with Google, your email or your phone number.'}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {user ? (
                <Link to="/new" className="btn-primary px-6 py-3 text-base">
                  Add your first trail
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="btn-primary px-6 py-3 text-base">
                    Create a free account
                  </Link>
                  <Link to="/login" className="btn-secondary px-6 py-3 text-base">
                    I already have an account
                  </Link>
                </>
              )}
            </div>
            <Link to="/" className="mt-6 inline-block text-sm font-semibold text-stone-600 underline">
              Explore trails first
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
