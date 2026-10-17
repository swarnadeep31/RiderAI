// Hand-drawn SVG scenery: the hero landscape, the footer ridge, a campsite and
// a summit. Animations are gentle and stop when the device asks for less motion.
// Colours come from CSS variables (--scene-*, in index.css), so the scenes
// turn to night with the rest of the site.
import { useId } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion.js';
import { toggleTheme, useTheme } from '../../lib/theme.js';

const fill = (name) => ({ fill: `var(--scene-${name})` });

// Stars for the night sky, scattered the same way every time.
function makeStars(count, width, height) {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    r: 0.8 + random() * 1.6,
    duration: 2 + random() * 3,
    delay: -random() * 5,
  }));
}
const HERO_STARS = makeStars(60, 1440, 330);
const SUMMIT_STARS = makeStars(28, 480, 300);

function Stars({ stars }) {
  return (
    <g className="night-only" fill="#fefce8">
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={star.x}
          cy={star.y}
          r={star.r}
          className="star"
          style={{ '--duration': `${star.duration}s`, '--delay': `${star.delay}s` }}
        />
      ))}
    </g>
  );
}

// The sun by day and the moon by night, centred on (x, y). On the home page it
// is also the hidden switch: click the sun for night, the moon for morning.
function SunAndMoon({ x, y, r, interactive = false }) {
  const night = useTheme() === 'dark';
  const label = night ? 'Bring back the morning (day mode)' : 'Watch the sunset (night mode)';
  const switchProps = interactive
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': label,
        className: 'sun-switch cursor-pointer outline-none',
        onClick: toggleTheme,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleTheme();
          }
        },
      }
    : { 'aria-hidden': true };
  return (
    <g {...switchProps}>
      {interactive && <title>{label}</title>}
      <g transform={`translate(${x} ${y})`}>
        {interactive && (
          <>
            <circle r={r * 1.8} fill="transparent" />
            <circle
              r={r * 1.9}
              className="sun-ring"
              fill="none"
              stroke="#ea580c"
              strokeWidth="3"
              strokeDasharray="6 8"
            />
          </>
        )}
        <g className="day-only">
          <circle r={r * 1.75} fill="#fde68a" className="svg-center motion-safe:animate-glow" />
          <circle r={r} fill="#fcd34d" />
        </g>
        <g className="night-only">
          <g opacity="0.3">
            <circle r={r * 1.6} fill="#c7d2fe" className="svg-center motion-safe:animate-glow" />
          </g>
          <circle r={r * 0.85} fill="#f1f5f9" />
          <circle cx={-r * 0.25} cy={-r * 0.2} r={r * 0.17} fill="#dbe2ec" />
          <circle cx={r * 0.32} cy={r * 0.12} r={r * 0.11} fill="#dbe2ec" />
          <circle cx={-r * 0.02} cy={r * 0.42} r={r * 0.08} fill="#dbe2ec" />
        </g>
      </g>
    </g>
  );
}

// A pine tree standing on (x, y).
function Pine({ x, y, s = 1, color }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 0h-13l9.5-13h-5.5l8-12h-4.5L0-37l5.5 12H1l8 12H3.5L13 0z"
      style={{ fill: color }}
    />
  );
}

// A fluffy cloud sailing across the sky (from left to right, forever).
function Cloud({ y, s = 1, duration, delay, opacity = 0.95 }) {
  return (
    <g className="cloud" style={{ '--duration': `${duration}s`, '--delay': `${delay}s` }}>
      <path
        transform={`translate(0 ${y}) scale(${s})`}
        d="M4 40C-3 40-3 30 5 29 3 17 16 11 25 16 29 4 48 1 57 12c9-6 25 0 24 13 10 0 15 8 11 15z"
        style={fill('cloud')}
        opacity={opacity}
      />
    </g>
  );
}

// A map pin that pops up on the route.
// The rider's lap along the hero's road: it rides the whole road in the first
// RIDE_END of RIDE_LAP seconds, then fades out and starts again.
const RIDE_LAP = 18;
const RIDE_END = 0.88;

// A pin on the road that drops in (from above, with a little bounce) just as
// the rider reaches it, stays while the ride goes on, and lifts away when the
// ride starts over. along: where it is on the road, as a share of the road's
// length, so it keeps in step with the rider (both run on the same clock).
// still: no motion wanted, so the pin just stands there.
function MapPin({ x, y, along, still }) {
  const arrive = along * RIDE_END;
  const at = (offset) => Math.min(arrive + offset, 0.89).toFixed(4);
  const lap = { dur: `${RIDE_LAP}s`, repeatCount: 'indefinite' };
  return (
    <g transform={`translate(${x} ${y})`}>
      <g opacity={still ? 1 : 0}>
        {!still && (
          <>
            <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={`0;${arrive.toFixed(4)};${at(0.006)};0.9;0.96;1`} {...lap} />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 -46;0 -46;0 4;0 0;0 0;0 -46"
              keyTimes={`0;${arrive.toFixed(4)};${at(0.016)};${at(0.026)};0.96;1`}
              calcMode="spline"
              // Falls faster and faster, then settles after the bounce.
              keySplines="0 0 1 1;0.5 0 1 1;0 0 0.5 1;0 0 1 1;0 0 1 1"
              {...lap}
            />
          </>
        )}
        <path
          d="M0 0C-3-6-11-12-11-20a11 11 0 0 1 22 0C11-12 3-6 0 0z"
          fill="#ea580c"
          stroke="#fff"
          strokeWidth="2.5"
        />
        <circle cy="-20" r="4" fill="#fff" />
      </g>
    </g>
  );
}

// A little motorbike and rider, facing right, wheels on y = 0.
function Rider({ beamId }) {
  return (
    <g>
      {beamId && <path className="night-only" d="M13-13 78-34v38z" fill={`url(#${beamId})`} />}
      <circle cx="-10" cy="-6" r="6" fill="#1c1917" />
      <circle cx="10" cy="-6" r="6" fill="#1c1917" />
      <circle cx="-10" cy="-6" r="2" fill="#e7e5e4" />
      <circle cx="10" cy="-6" r="2" fill="#e7e5e4" />
      <path d="M-10-6-4-14H5l5 8" stroke="#1c1917" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M-6-13c2-5 9-5 12-1l-2 3h-9z" fill="#ea580c" />
      <path
        d="M-3-14 0-22l5 4"
        stroke="#15392e"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="1" cy="-26" r="4.2" fill="#f59e0b" />
      <path d="M-1-27h6" stroke="#1c1917" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

const ROAD =
  'M-30 520C90 516 200 512 300 505S380 466 470 460 600 470 690 452 790 404 870 392 980 386 1040 368 1118 318 1150 290';

// The big landscape on the home page: a morning sky, mountains, a road with a
// dotted route drawing itself, pins popping up, and a rider heading for the summit.
export function HeroScene({ className = '' }) {
  const id = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" className={className} focusable="false">
      <defs>
        <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse">
          <path d={ROAD} pathLength="1" className="route-draw" stroke="#fff" strokeWidth="14" fill="none" />
        </mask>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-fireglow`}>
          <stop offset="0" stopColor="#fb923c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g aria-hidden="true">
        <Stars stars={HERO_STARS} />
      </g>
      {/* The hidden day/night switch */}
      <SunAndMoon x={1180} y={170} r={58} interactive />

      {/* Everything else is scenery: it doesn't take clicks, so the sun stays clickable behind the clouds. */}
      <g aria-hidden="true" pointerEvents="none">
        <Cloud y={70} s={1.1} duration={110} delay={-20} />
        <Cloud y={150} s={0.7} duration={80} delay={-55} opacity={0.85} />
        <Cloud y={40} s={0.55} duration={95} delay={-80} opacity={0.8} />
        <Cloud y={210} s={0.9} duration={130} delay={-100} opacity={0.9} />

        {/* Birds (they go to sleep at night) */}
        <g className="day-only">
          <g className="motion-safe:animate-float" stroke="#44403c" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path className="bird" d="M880 120q6-6 12 0q6-6 12 0" />
            <path className="bird" style={{ animationDelay: '0.3s' }} d="M915 100q5-5 10 0q5-5 10 0" />
            <path className="bird" style={{ animationDelay: '0.6s' }} d="M940 132q4-4 8 0q4-4 8 0" />
          </g>
        </g>

        {/* Far snowy range */}
        <path
          d="M0 430 120 400l90 18 120-58 90 32 100-62 90 42 90-72 90 45 90-95 80 50 80-90 90 75 80-50 90 65 80-30 60 20v270H0z"
          style={fill('far')}
        />
        <path
          d="M1040 210l-28 31 12-5 9 10 12-11 11 6 11-9zM880 250l-27 28 11-6 9 9 11-11 12 5 12-8zM1210 235l-28 17 11-2 8 8 11-9 12 7 13-2z"
          style={fill('snow')}
        />

        {/* Middle hills with the summit flag */}
        <path
          d="M0 470c80-15 140-30 220-25s120-25 200-35 120 20 190 10 110-60 190-70 100 30 160 22 90-52 150-72l40-12 40 12c60 18 110 50 170 52 40 2 60 8 80 10v198H0z"
          style={fill('mid')}
        />
        <g transform="translate(1150 290)">
          <path d="M0 0v-46" stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
          <path d="M1-46h26l-7 8 7 8H1z" fill="#ea580c" className="svg-left motion-safe:animate-flutter" />
        </g>

        {/* Near hills and trees */}
        <path
          d="M0 500c120-30 220-32 330-20s190-10 290-22 180 12 280 20 180-23 280-28 180 20 260 16v94H0z"
          style={fill('near')}
        />
        {[
          [60, 488, 1],
          [92, 492, 0.8],
          [560, 470, 0.9],
          [590, 474, 0.7],
          [1250, 458, 1],
          [1280, 462, 0.8],
          [1385, 470, 0.9],
        ].map(([x, y, s]) => (
          <Pine key={`${x}`} x={x} y={y} s={s} color="var(--scene-tree)" />
        ))}

        {/* A hiker taking in the view */}
        <g transform="translate(176 474)">
          <g className="motion-safe:animate-float" style={{ animationDuration: '5s' }}>
            <circle cx="0" cy="-30" r="4.5" style={fill('figure')} />
            <path
              d="M0-25-3-12l4 5v7M-3-12l-4 12M1-23l6 6 4-1M11-18V0"
              style={{ stroke: 'var(--scene-figure)' }}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M-2-24l-6-2-3 10 6 2z" fill="#f59e0b" />
          </g>
        </g>

        {/* The road, the route drawing itself along it, and pins */}
        <path
          d={ROAD}
          style={{ stroke: 'var(--scene-road-edge)' }}
          strokeWidth="18"
          fill="none"
          strokeLinecap="round"
        />
        <path
          id={`${id}-road`}
          d={ROAD}
          style={{ stroke: 'var(--scene-road)' }}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={ROAD}
          mask={`url(#${id}-reveal)`}
          stroke="#ea580c"
          strokeWidth="4"
          strokeDasharray="0.1 11"
          strokeLinecap="round"
          fill="none"
        />
        {/* Each pin drops as the rider passes it (where it is along the road, measured on ROAD). */}
        <MapPin x={300} y={505} along={0.269} still={reduced} />
        <MapPin x={690} y={452} along={0.5934} still={reduced} />
        <MapPin x={1040} y={368} along={0.8887} still={reduced} />

        {/* The rider, riding up to the flag again and again */}
        {reduced ? (
          <g transform="translate(470 460) rotate(-4)">
            <Rider beamId={`${id}-beam`} />
          </g>
        ) : (
          <g>
            <Rider beamId={`${id}-beam`} />
            <animateMotion
              dur={`${RIDE_LAP}s`}
              repeatCount="indefinite"
              rotate="auto"
              keyPoints="0;1;1"
              keyTimes={`0;${RIDE_END};1`}
              calcMode="linear"
            >
              <mpath href={`#${id}-road`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;1;1;0;0"
              keyTimes="0;0.04;0.9;0.96;1"
              dur={`${RIDE_LAP}s`}
              repeatCount="indefinite"
            />
          </g>
        )}

        {/* Foreground: trees, a tent with a campfire, and the page's sand */}
        <path d="M0 535c160-23 300-15 460-7s300-13 460-16 320 18 520 8v40H0z" style={fill('front')} />
        {[
          [20, 540, 1.3],
          [62, 546, 1],
          [880, 528, 1.1],
          [1418, 534, 1.2],
        ].map(([x, y, s]) => (
          <Pine key={`f${x}`} x={x} y={y} s={s} color="var(--scene-front-tree)" />
        ))}
        <g transform="translate(1320 530)">
          <circle cx="30" cy="-14" r="80" className="night-only" fill={`url(#${id}-fireglow)`} />
          <path d="M-26 0 0-38 26 0z" fill="#f59e0b" />
          <path d="M-9 0 0-14 9 0z" fill="#92400e" />
          <path d="M0-38-6-46M0-38l6-8" stroke="#78350f" strokeWidth="2.4" strokeLinecap="round" />
          <g transform="translate(44 0)">
            <path d="M-8 0h16M-6-2l12-4M6-2-6-6" stroke="#78350f" strokeWidth="2.4" strokeLinecap="round" />
            <path
              d="M0-24c5 6 7 10 6 15-1 4-4 6-6 6s-6-2-6-6c-1-5 3-8 6-15z"
              fill="#f97316"
              className="svg-bottom motion-safe:animate-flicker"
            />
            <path
              d="M0-14c3 3 3 6 2 8-1 1-2 2-2 2s-2-1-2-2c-1-2 0-5 2-8z"
              fill="#fde047"
              className="svg-bottom motion-safe:animate-flicker"
              style={{ animationDelay: '0.3s' }}
            />
          </g>
        </g>
        <path d="M0 552c240-12 480-4 720-2s480-6 720-2v12H0z" style={fill('page')} />
      </g>
    </svg>
  );
}

// Mountains, pines and a glowing tent along the top of the footer.
export function FooterRidge({ className = '' }) {
  return (
    <svg viewBox="0 0 1440 110" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d="M0 110V78l60-8 50 12 60-24 60 16 70-34 60 26 60-6 60 16 80-28 60 16 80-34 60 28 60-4 60 18 80-28 60 18 70-26 60 24 70-4 70 18 70-22 80 12v46z"
        fill="#15392e"
      />
    </svg>
  );
}

export function FooterCamp({ className = '' }) {
  return (
    <svg viewBox="0 0 120 70" className={className} aria-hidden="true">
      <Pine x={14} y={66} s={1.3} color="#15392e" />
      <Pine x={34} y={66} s={0.9} color="#15392e" />
      <path d="M46 66 66 36l20 30z" fill="#f59e0b" />
      <path d="M60 66l6-11 6 11z" fill="#7c2d12" />
      <g transform="translate(100 66)">
        <path d="M-6 0h12" stroke="#a16207" strokeWidth="2.4" strokeLinecap="round" />
        <path
          d="M0-18c4 4 5 8 4 11-1 3-3 4-4 4s-4-1-4-4c-1-3 2-6 4-11z"
          fill="#f97316"
          className="svg-bottom motion-safe:animate-flicker"
        />
        <path
          d="M0-10c2 2 2 4 1 6l-1 1-1-1c-1-2 0-4 1-6z"
          fill="#fde047"
          className="svg-bottom motion-safe:animate-flicker"
          style={{ animationDelay: '0.25s' }}
        />
      </g>
    </svg>
  );
}

// A campsite at dusk: for empty pages, "not found" and thank-you messages.
export function CampScene({ className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7d2fe" />
          <stop offset="0.6" stopColor="#fed7aa" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
        <clipPath id={`${id}-round`}>
          <rect width="320" height="200" rx="28" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-round)`}>
        <rect width="320" height="200" fill={`url(#${id}-sky)`} />
        {[
          [40, 30],
          [90, 18],
          [150, 40],
          [230, 22],
          [280, 44],
        ].map(([x, y], i) => (
          <circle
            key={x}
            cx={x}
            cy={y}
            r="1.8"
            fill="#fff"
            className="motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}
        <circle cx="250" cy="70" r="16" fill="#fef3c7" />
        <path d="M0 140 60 90l40 26 50-48 60 50 40-24 70 46v60H0z" fill="#a5b4c9" />
        <path d="M150 68l-14 13 8-2 6 6 6-6 8 2z" fill="#fff" />
        <path d="M0 160c60-14 120-16 180-8s100-6 140-10v58H0z" fill="#4f9a74" />
        <Pine x={36} y={168} s={1.4} color="#2d6a50" />
        <Pine x={62} y={166} s={1} color="#2d6a50" />
        <Pine x={292} y={160} s={1.2} color="#2d6a50" />
        <path d="M120 176 152 128l32 48z" fill="#ea580c" />
        <path d="M144 176l8-16 8 16z" fill="#7c2d12" />
        <path d="M152 128l-6-8M152 128l6-8" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" />
        <g transform="translate(222 178)">
          <path d="M-10 0h20M-8-2l16-5M8-2-8-7" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M0-30c6 7 9 12 8 18-1 5-5 8-8 8s-7-3-8-8c-1-6 3-10 8-18z"
            fill="#f97316"
            className="svg-bottom motion-safe:animate-flicker"
          />
          <path
            d="M0-17c3 3 4 7 3 9-1 2-2 3-3 3s-3-1-3-3c-1-2 1-6 3-9z"
            fill="#fde047"
            className="svg-bottom motion-safe:animate-flicker"
            style={{ animationDelay: '0.3s' }}
          />
        </g>
      </g>
    </svg>
  );
}

// A sunny summit with a zig-zag trail and a climber near the flag: for the
// sign-up and log-in pages.
export function SummitScene({ className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 480 600" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--scene-sky-top)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--scene-sky-middle)' }} />
          <stop offset="1" style={{ stopColor: 'var(--scene-sky-bottom)' }} />
        </linearGradient>
      </defs>
      <rect width="480" height="600" fill={`url(#${id}-sky)`} />
      <Stars stars={SUMMIT_STARS} />
      <SunAndMoon x={370} y={120} r={40} />
      <Cloud y={90} s={0.8} duration={70} delay={-10} />
      <Cloud y={190} s={0.6} duration={55} delay={-35} opacity={0.85} />
      <path d="M0 420 90 330l60 40 70-80 90 90 60-40 100 90v170H0z" style={fill('far')} />
      <path d="M40 600 240 200l200 400z" style={fill('mid')} />
      <path d="M240 200l-42 84 22-12 20 22 20-22 22 12z" style={fill('snow')} />
      <path
        d="M150 560c60-10 120-20 160-40s-100-30-60-60 110-20 70-60-80-30-40-70 20-40 0-60"
        stroke="#ea580c"
        strokeWidth="4"
        strokeDasharray="0.1 12"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(240 200)">
        <path d="M0 0v-50" stroke="#1c1917" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M1-50h32l-8 9 8 9H1z" fill="#ea580c" className="svg-left motion-safe:animate-flutter" />
      </g>
      <g transform="translate(262 278)">
        <g className="motion-safe:animate-float">
          <circle cx="0" cy="-28" r="5" fill="#15392e" />
          <path
            d="M0-23-3-10l5 4v8M-3-10l-6 11M1-21l8-6M7-27l3-8"
            stroke="#15392e"
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M-2-22l-7-2-3 11 7 2z" fill="#f59e0b" />
        </g>
      </g>
      <path d="M0 540c80-20 160-24 240-14s160 4 240-6v80H0z" style={fill('front')} />
      <Pine x={40} y={556} s={2} color="var(--scene-front-tree)" />
      <Pine x={90} y={560} s={1.4} color="var(--scene-front-tree)" />
      <Pine x={420} y={552} s={1.8} color="var(--scene-front-tree)" />
      <Pine x={455} y={560} s={1.3} color="var(--scene-front-tree)" />
    </svg>
  );
}

// TrailCast's mark: mountains and a dotted route under a morning sun.
export function LogoMark({ className = 'h-9 w-9' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id}-bg)`} />
      <circle cx="29" cy="11.5" r="4.5" fill="#fde68a" />
      <path d="M3 31 14.5 14l6 8.5 4-5L37 31z" fill="#fff" />
      <path d="M14.5 14 11 19.2l2.4-1 1.4 1.6 1.6-1.6 2.2.8z" fill="#fed7aa" />
      <path
        d="M6 36.5c5-3.5 9-1.5 13-3.5s8-3.5 15-1.5"
        stroke="#15392e"
        strokeWidth="2.6"
        strokeDasharray="0.1 4.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
