import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import Icon from '../components/art/Icon.jsx';
import RoadEnds from '../components/art/RoadEnds.jsx';

// Every way a page can fail, in plain words: what happened and what to do.
// action: the main button ('retry' reloads the page, 'login', or 'home').
// tell: also offer to tell us about it. sign: the lettering on the drawing.
// name: the error as the web knows it, in the sheet's margin.
export const ERRORS = {
  400: {
    name: 'Bad request',
    title: "That didn't make sense to the server",
    text: 'Something in the request was off, maybe a link that was cut short. Go back and try again.',
    sign: 'Wrong turn',
    action: 'home',
  },
  401: {
    name: 'Not logged in',
    title: 'Log in to go on',
    text: "This page is only for people who are logged in. Log in, and you'll come straight back here.",
    sign: 'Permit needed',
    action: 'login',
  },
  403: {
    name: 'Forbidden',
    title: "This one isn't yours to change",
    text: 'Only the person who added a ride can edit it. You can still watch it with everyone else.',
    sign: 'No entry',
    action: 'home',
  },
  404: {
    name: 'Not found',
    title: 'This page is off the map',
    text: 'The link may be missing a part, or the ride was deleted.',
    sign: 'Unsurveyed',
    action: 'home',
  },
  405: {
    name: 'Method not allowed',
    title: "That can't be done from here",
    text: "The page asked the server for something this address doesn't do. Go back to the page and use its buttons.",
    sign: 'One way',
    action: 'home',
  },
  408: {
    name: 'Request timeout',
    title: 'That took too long',
    text: 'The connection was too slow to finish. Try again, ideally where the signal is steadier.',
    sign: 'Slow road',
    action: 'retry',
  },
  410: {
    name: 'Gone',
    title: 'This ride has gone',
    text: "Whoever added it has removed it, so it isn't on the map any more.",
    sign: 'Track removed',
    action: 'home',
  },
  413: {
    name: 'Too large',
    title: 'That was too big to send',
    text: 'The file or text was bigger than TrailCast takes. Use a smaller copy and try again.',
    sign: 'Load limit',
    action: 'home',
  },
  429: {
    name: 'Too many requests',
    title: 'Easy, take a breather',
    text: 'Too many tries in a short time. Wait a minute, then try again.',
    sign: 'Halt',
    action: 'retry',
  },
  500: {
    name: 'Server error',
    title: 'Something broke on our side',
    text: "It's not you. Try again in a minute, and if it keeps happening, tell us what you were doing.",
    sign: 'Road works',
    action: 'retry',
    tell: true,
  },
  502: {
    name: 'Bad gateway',
    title: 'The server sent back a broken answer',
    text: "This usually lasts a moment, while TrailCast's server restarts. Try again in a minute.",
    sign: 'Bridge out',
    action: 'retry',
  },
  503: {
    name: 'Service unavailable',
    title: 'TrailCast is taking a break',
    text: 'The server is busy or being updated. Try again in a few minutes.',
    sign: 'Road closed',
    action: 'retry',
  },
  504: {
    name: 'Gateway timeout',
    title: 'The server took too long to answer',
    text: 'TrailCast runs on a free server that sleeps when nobody is riding, and it can take up to a minute to wake. Try again.',
    sign: 'Waking up',
    action: 'retry',
  },
  network: {
    name: 'No connection to the server',
    title: "Couldn't reach TrailCast",
    text: "The page couldn't connect to the server. Check your connection, then try again.",
    sign: 'No road',
    action: 'retry',
  },
  offline: {
    name: 'Offline',
    title: "You're offline",
    text: "Your phone or computer has lost its connection. Check your mobile data or Wi-Fi: the page tries again as soon as you're back.",
    sign: 'No signal',
    action: 'retry',
  },
  update: {
    name: 'New version',
    title: 'TrailCast has been updated',
    text: 'A newer version came out while this page was open. Reload to get it.',
    sign: 'New road',
    action: 'retry',
  },
  crash: {
    name: 'Page error',
    title: 'This page tripped over',
    text: "Something inside the page went wrong. Reloading usually fixes it; if it doesn't, tell us which page it was.",
    sign: 'Rockfall',
    action: 'retry',
    tell: true,
  },
};

// Codes without their own words get their family's: any 4xx is the
// request's problem, any 5xx the server's.
function errorFor(code) {
  if (ERRORS[code]) return ERRORS[code];
  const number = Number(code);
  if (number >= 500 && number < 600) return ERRORS[500];
  if (number >= 400 && number < 500) return ERRORS[400];
  return ERRORS[404];
}

// Which error page an API error needs (see api.js): offline, no answer at
// all, or the status the server answered with.
export function errorCodeFor(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return err?.status ? err.status : 'network';
}

// The server's own words, worth showing under a 4xx page's ("Only the person
// who added this trail can change it."). A 404's and the 5xx's say nothing more.
export function serverWords(err) {
  return err?.status >= 400 && err.status < 500 && err.status !== 404 ? err.message : null;
}

// A page that broke while loading one of its parts: after a new version of
// the site goes out, the old parts are gone.
export function isOldVersion(err) {
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(String(err?.message ?? err));
}

const reload = () => window.location.reload();

// code: an HTTP status (404, 504...) or one of 'network', 'offline',
// 'update', 'crash'. detail: the server's own words, when it gave any.
export default function ErrorPage({ code = 404, detail = null }) {
  const location = useLocation();
  const error = errorFor(code);
  const numeric = Number.isFinite(Number(code));
  const next = encodeURIComponent(location.pathname + location.search);

  // Offline: try again by itself as soon as the connection is back.
  useEffect(() => {
    if (code !== 'offline') return undefined;
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [code]);

  const home = (
    <Link to="/" className={error.action === 'home' ? 'btn-primary' : 'btn-secondary'}>
      Back to the rides
    </Link>
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16 lg:py-20">
      <div className="motion-safe:animate-rise">
        <h1 className="text-display uppercase">{error.title}</h1>
        <p className="mt-4 max-w-xl text-lead text-ink-soft">{error.text}</p>
        {detail && <p className="mt-3 max-w-xl text-ink-soft">The server said: “{detail}”</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          {error.action === 'retry' && (
            <button type="button" onClick={reload} className="btn-primary">
              {code === 'update' ? 'Reload the page' : 'Try again'} <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          )}
          {error.action === 'login' && (
            <Link to={`/login?next=${next}`} className="btn-primary">
              Log in <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          )}
          {home}
          {error.tell && (
            <Link to="/feedback" className="btn-ghost">
              Tell us what happened
            </Link>
          )}
        </div>
        <p className="margin-text mt-10">{numeric ? `Error ${code} · ${error.name}` : error.name}</p>
      </div>
      <figure className="neatline bg-paper">
        <RoadEnds sign={error.sign} className="block h-auto w-full" />
      </figure>
    </main>
  );
}

// /error/504 and the like: any error page by its code, to link to or check.
export function ErrorRoute() {
  const { code } = useParams();
  const number = Number(code);
  return <ErrorPage code={Number.isFinite(number) ? number : code} />;
}
