// Small line icons drawn for TrailCast (24×24, they take the text colour).
const PATHS = {
  ride: (
    <>
      <circle cx="5" cy="16.5" r="3.2" />
      <circle cx="19" cy="16.5" r="3.2" />
      <path d="M5 16.5 8.5 11h6.5l4 5.5" />
      <path d="M15 11 13.6 6.8h2.6" />
      <path d="M7.5 9h4M10 16.5h4.5l-1.5-5.5" />
    </>
  ),
  hike: (
    <>
      <circle cx="13" cy="4" r="2" />
      <path d="M12.3 8 10.3 14l3 3v4M10.5 14 8 21" />
      <path d="M12.6 8.6 15 11l2.6-.6M18 8.5V21" />
      <path d="M12 8 9.2 7.2 8 11.6l2.4.8" />
    </>
  ),
  climb: (
    <>
      <path d="M2.5 20.5 9.5 9l3.5 6 2-3 6.5 8.5z" />
      <path d="M9.5 9V3.2l4.2 1.6-4.2 1.6" />
    </>
  ),
  cycle: (
    <>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5H11L9 9.5zM9 9.5h7l-5 7M16 9.5l2.5 7" />
      <path d="M7.5 7.5h3M16 9.5l-.6-2.6h2.2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  tent: (
    <>
      <path d="M2.5 20.5h19M4 20.5 12 6l8 14.5" />
      <path d="M12 6 9.5 3M12 6l2.5-3M9.5 20.5 12 15.5l2.5 5" />
    </>
  ),
  car: (
    <>
      <path d="M3 16.5V13l2.6-1.2 2.1-3.8h8.6l2.9 3.8L21 13v3.5" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 17h6M7.5 12h10" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" />
    </>
  ),
  sparkles: (
    <>
      <path d="m11 3 1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
      <path d="m18.5 14 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  printer: (
    <>
      <path d="M7 9V3.5h10V9M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  // Going up: total climb.
  ascent: <path d="m3 18 6-6 4 4 8-8m-5 0h5v5" />,
  // A summit with a flag: the highest point.
  summit: (
    <>
      <path d="m2.5 20 7-11 3.5 5 2-3 6.5 9z" />
      <path d="M9.5 9V3.5l4 1.5-4 1.5" />
    </>
  ),
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13" />,
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />,
  // A warning: a long way without fuel.
  warning: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  satellite: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="7.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.7 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.7-3.8-9S9.4 5.6 12 3z" />
    </>
  ),
};

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name] ?? PATHS.compass}
    </svg>
  );
}

// Each activity's icon, used on tags and choices.
export const ACTIVITY_STYLE = {
  ride: { icon: 'ride' },
  hike: { icon: 'hike' },
  climb: { icon: 'climb' },
  cycle: { icon: 'cycle' },
  other: { icon: 'compass' },
};

export const INTEREST_ICON = {
  riding: 'ride',
  trekking: 'hike',
  climbing: 'climb',
  cycling: 'cycle',
  camping: 'tent',
  travel: 'car',
  other: 'compass',
};
