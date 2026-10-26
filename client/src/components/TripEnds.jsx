import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { routesInTitle } from '../lib/titleRoute.js';
import Icon from './art/Icon.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import PlaceSearch from './PlaceSearch.jsx';

// A place from the map search as a trip end, as the server keeps it (coarse
// is only for the hint below: a whole state or region, not a town).
const asEnd = (place, name = place.name) => ({
  name,
  label: String(place.description ?? place.label ?? '').slice(0, 200),
  lat: place.lat,
  lng: place.lng,
  coarse: Boolean(place.coarse),
});

// The start or the end: the place picked, or a search for it.
// choices: other places the search found for the name from the title.
function EndField({ label, value, guess, choices, onChange }) {
  const [changing, setChanging] = useState(false);

  function pick(place, name) {
    onChange(asEnd(place, name));
    setChanging(false);
  }

  if (value && !changing) {
    return (
      <div className="flex min-w-0 items-start gap-3 rounded-[3px] bg-paper px-3 py-2.5 ring-1 ring-ink/15">
        <Icon name="pin" className="mt-1 h-5 w-5 shrink-0 text-road" />
        <div className="min-w-0 flex-1">
          <p className="margin-text">{label}</p>
          <p className="font-semibold">{value.name}</p>
          {value.label && value.label !== value.name && <p className="truncate text-small text-ink-soft">{value.label}</p>}
          {value.coarse && (
            <p className="text-small text-road">That&apos;s a whole region, so its middle is used. A town in it is better, like Leh for Ladakh.</p>
          )}
        </div>
        <button type="button" onClick={() => setChanging(true)} className="text-small font-medium text-road hover:underline">
          Change
        </button>
        <button type="button" onClick={() => onChange(null)} aria-label={`Clear “${label}”`} className="text-ink-soft hover:text-road">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2 rounded-[3px] bg-paper px-3 py-2.5 ring-1 ring-ink/15">
      <p className="margin-text">{label}</p>
      {choices?.length > 0 && (
        <ul className="space-y-0.5 text-small">
          {choices.map((place) => (
            <li key={`${place.lat},${place.lng}`}>
              <button type="button" onClick={() => pick(place, value?.name)} className="text-left hover:text-road hover:underline">
                {place.description || place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PlaceSearch
        key={guess ?? value?.name ?? ''}
        initialQuery={guess ?? value?.name ?? ''}
        label={`${label}: search for the place`}
        placeholder="The town, e.g. Kolkata"
        onPick={(place) => pick(place)}
      />
      {changing && (
        <button type="button" onClick={() => setChanging(false)} className="text-small text-ink-soft hover:underline">
          Keep {value.name}
        </button>
      )}
    </div>
  );
}

// Where the ride starts and ends, read from the video's title and found on
// the map, so they're known before the video is watched: the AI collects
// places from the moment the ride leaves the start, and the route is pinned
// to both ends. value: { start, end }, each { name, label, lat, lng } or null.
export default function TripEnds({ title, value, onChange, disabled = false, optional = false }) {
  const routes = useMemo(() => routesInTitle(title), [title]);
  const [picked, setPicked] = useState(null);
  const [choices, setChoices] = useState({ start: [], end: [] });
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState(null);

  // One of the title's "X to Y": find both on the map, taking the best match
  // for each (a town before a whole region), and keep the others to choose from.
  async function chooseRoute(route) {
    setPicked(route);
    setFinding(true);
    setError(null);
    const next = { ...value };
    const others = { start: [], end: [] };
    try {
      for (const [key, name] of [
        ['start', route.from],
        ['end', route.to],
      ]) {
        const results = await api.searchPlaces(name);
        const best = results.find((place) => !place.coarse) ?? results[0];
        next[key] = best ? asEnd(best, name) : null;
        others[key] = results.filter((place) => place !== best).slice(0, 3);
      }
    } catch (err) {
      setError(err.message);
    }
    setChoices(others);
    onChange(next);
    setFinding(false);
  }

  const isPicked = (route) => picked?.from === route.from && picked?.to === route.to;

  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      <legend className="field-label">
        Where the ride starts and ends {optional && <span className="font-normal text-ink-soft">(optional, for the AI)</span>}
      </legend>
      <p className="hint">
        The AI starts collecting places when the video leaves the start, and the route is pinned to both ends. For one
        episode of a longer trip, choose where this episode ends.
      </p>
      {routes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small text-ink-soft">From the title:</span>
          {routes.map((route) => (
            <button
              key={`${route.from}>${route.to}`}
              type="button"
              aria-pressed={isPicked(route)}
              aria-label={`${route.from} to ${route.to}`}
              onClick={() => chooseRoute(route)}
              className={`rounded-[3px] px-2.5 py-1 text-small font-semibold transition-colors ${
                isPicked(route) ? 'bg-ink text-paper' : 'bg-paper text-ink ring-[1.5px] ring-ink/25 hover:ring-ink'
              }`}
            >
              {route.from} <span aria-hidden="true">→</span> {route.to}
            </button>
          ))}
        </div>
      )}
      {finding && (
        <p role="status" className="flex items-center gap-2 text-small text-ink-soft">
          <Icon name="compass" className="h-4 w-4 text-road motion-safe:animate-spin" /> Finding {picked.from} and {picked.to} on the map…
        </p>
      )}
      <div className="grid gap-3">
        <EndField
          label="Starts at"
          value={value.start}
          guess={value.start ? null : picked?.from}
          choices={choices.start}
          onChange={(start) => onChange({ ...value, start })}
        />
        <EndField
          label="Ends at"
          value={value.end}
          guess={value.end ? null : picked?.to}
          choices={choices.end}
          onChange={(end) => onChange({ ...value, end })}
        />
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </fieldset>
  );
}
