import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { formatKm, formatMetres, nameNear, notablePeaks } from '../lib/elevation.js';
import { FUEL_CAVEAT, fuelGapSentence, kmAlong, kmLength, longGaps, offRoute, serviceName } from '../lib/services.js';
import { climbText, daysText, distanceText, highestText } from '../lib/stats.js';
import { googleMapsUrl, youtubeUrlAt } from '../lib/exports.js';
import { formatTime } from '../lib/time.js';
import { cumulativeDistances, locationAtDistance } from '../lib/track.js';

// The fuel stations along the route, with the stretches without one.
function FuelTable({ trail, services, warnKm }) {
  if (services?.status !== 'ready') return null;
  const approximate = trail.routeSource === 'keypoints';
  const stations = services.items.filter((item) => item.kind === 'fuel');
  const warnings = longGaps(services.fuelGaps, warnKm);
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-[1.5rem] leading-tight">Fuel along the route</h2>
      <p className="mt-1 font-semibold">{fuelGapSentence(services.fuelGaps[0], approximate)}</p>
      {warnings.map((gap) => (
        <p key={gap.fromM} className="font-semibold">
          ⚠ {kmLength(gap.lengthM, approximate)} with no mapped fuel station, from {kmAlong(gap.fromM, approximate)} to {kmAlong(gap.toM, approximate)}.
        </p>
      ))}
      {stations.length > 0 && (
        <table className="mt-2 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="py-2 pr-3">Distance</th>
              <th className="py-2 pr-3">Fuel station</th>
              <th className="py-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.osm} className="break-inside-avoid border-b border-ink/15 align-top">
                <td className="py-2 pr-3 tabular-nums">{kmAlong(station.alongM, approximate)}</td>
                <td className="py-2 pr-3">
                  <div className="font-semibold">{serviceName(station)}</div>
                  <div className="text-ink-soft">{[station.brand && station.name ? station.brand : null, station.place, offRoute(station), station.hours && `Open: ${station.hours}`].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="py-2 tabular-nums text-xs">
                  {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
                  <br />
                  <a href={googleMapsUrl(station.lat, station.lng)} className="font-sans text-road underline">
                    Open in Google Maps
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-ink-soft">{FUEL_CAVEAT}</p>
    </section>
  );
}

// The passes and summits on the way, highest first, named after the nearest key point.
function Passes({ trail }) {
  const passes = useMemo(() => {
    const profile = trail.elevationProfile;
    if (!profile || profile.routeVersion !== trail.routeVersion) return [];
    const cum = cumulativeDistances(trail.track);
    return notablePeaks(profile).map((peak) => ({ ...peak, name: nameNear(trail.points, locationAtDistance(trail.track, cum, peak.alongM)) }));
  }, [trail]);
  if (passes.length === 0) return null;
  const approximate = trail.routeSource === 'keypoints';
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-[1.5rem] leading-tight">High points on the way</h2>
      <table className="mt-2 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-ink">
            <th className="py-2 pr-3">Place</th>
            <th className="py-2 pr-3 text-right">Height</th>
            <th className="py-2 text-right">Distance from the start</th>
          </tr>
        </thead>
        <tbody>
          {passes.map((pass) => (
            <tr key={pass.alongM} className="border-b border-ink/15">
              <td className="py-2 pr-3 font-semibold">{pass.name ?? `At km ${formatKm(pass.alongM)}`}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatMetres(pass.heightM)} m</td>
              <td className="py-2 text-right tabular-nums">
                {approximate ? '≈ ' : ''}
                {formatKm(pass.alongM)} km
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// A plain page made for printing. The browser's print window can save it as a PDF.
export default function PrintPage() {
  const { id } = useParams();
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState(null);
  const [services, setServices] = useState(null);
  const [warnKm, setWarnKm] = useState(150);

  useEffect(() => {
    api.getTrail(id).then(setTrail, (err) => setError(err.message));
    api.getServices(id).then(setServices, () => {});
    api.getConfig().then((config) => config.fuelGapWarnKm && setWarnKm(config.fuelGapWarnKm), () => {});
  }, [id]);

  // The trip sheet is for paper, so it stays light even at night.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!trail) return <p className="p-8 text-ink-soft">Loading...</p>;

  // "475 km · 2 days · Highest 5,328 m · Taglang La · 5,840 m climb"
  const statsLine = [distanceText, daysText, highestText, climbText]
    .map((text) => text(trail.stats))
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto max-w-3xl bg-paper p-8 text-ink">
      <div className="no-print mb-8 flex flex-wrap items-center gap-3 rounded-[3px] bg-surface p-3 text-sm">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary btn-small"
        >
          Save as PDF / Print
        </button>
        <span className="text-ink-soft">In the print window, choose "Save as PDF" as the printer.</span>
        <Link to={`/trails/${trail._id}`} className="ml-auto underline">
          Back to the video
        </Link>
      </div>

      <h1 className="text-title">{trail.title}</h1>
      <p className="mt-1 text-ink-soft">
        {ACTIVITIES[trail.activity]} · {trail.points.length} {trail.points.length === 1 ? 'place' : 'places'} · Video:{' '}
        <a href={youtubeUrlAt(trail.youtubeId, 0)} className="underline">
          youtu.be/{trail.youtubeId}
        </a>
      </p>
      {statsLine && <p className="mt-3 font-semibold">{statsLine}</p>}
      {trail.description && <p className="mt-4 whitespace-pre-line">{trail.description}</p>}

      {trail.points.length > 0 ? (
        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Video</th>
              <th className="py-2 pr-3">Place</th>
              <th className="py-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {trail.points.map((point, i) => (
              <tr key={point._id} className="break-inside-avoid border-b border-ink/15 align-top">
                <td className="py-2 pr-3 font-semibold">{i + 1}</td>
                <td className="py-2 pr-3 tabular-nums">
                  <a href={youtubeUrlAt(trail.youtubeId, point.time)} className="underline">
                    {formatTime(point.time)}
                  </a>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-semibold">{point.name}</div>
                  {point.note && <div className="text-ink-soft">{point.note}</div>}
                </td>
                <td className="py-2 tabular-nums text-xs">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  <br />
                  <a href={googleMapsUrl(point.lat, point.lng)} className="font-sans text-road underline">
                    Open in Google Maps
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-8 text-ink-soft">No places marked yet.</p>
      )}

      <Passes trail={trail} />
      <FuelTable trail={trail} services={services} warnKm={warnKm} />

      <p className="mt-10 text-small text-ink-soft">Made with TrailCast. Map data © OpenStreetMap contributors.</p>
    </main>
  );
}
