import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import ActivityBadge from '../components/ActivityBadge.jsx';
import AddStopForm from '../components/AddStopForm.jsx';
import DaysSetting from '../components/DaysSetting.jsx';
import ElevationChart from '../components/ElevationChart.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { STORY_STYLES } from '../components/NewStoryForm.jsx';
import SaveOptions from '../components/SaveOptions.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import ServicesPanel, { ServiceBadge } from '../components/ServicesPanel.jsx';
import StoryStops from '../components/StoryStops.jsx';
import TrailMap from '../components/TrailMap.jsx';
import TripStats, { Readout } from '../components/TripStats.jsx';
import Icon from '../components/art/Icon.jsx';
import { useRouteServices } from '../hooks/useRouteServices.js';
import { useServiceKinds } from '../hooks/useServiceKinds.js';
import { FUEL_CAVEAT, afterWhat, fuelGapSentence, kmLength } from '../lib/services.js';
import { cumulativeDistances, locationAtDistance, routeBetween } from '../lib/track.js';
import { useConfirm, useToast } from '../notices.jsx';

// The name shown as "Route by ...": the creator's choice; empty stays anonymous.
function NameSetting({ trail, onSaved }) {
  const [text, setText] = useState(trail.creatorName ?? '');
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    try {
      setError(null);
      onSaved(await api.updateTrail(trail._id, { creatorName: text }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <h3 className="text-[1.3rem] leading-tight">Your name to show</h3>
      <p className="text-small text-ink-soft">Shown as "Route by ...". Leave it empty to stay anonymous: your username is never shown.</p>
      <div className="flex items-center gap-2">
        <input
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How people should know you"
          aria-label="Your name to show"
          className="field w-full max-w-xs"
        />
        <button type="submit" className="btn-secondary btn-small">
          Save
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  );
}

// How the line between the stops follows the ground; changing it redraws the route.
function StyleSetting({ trail, onSaved }) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function pick(style) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.drawRoute(trail._id, style));
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <fieldset className="space-y-2" disabled={saving}>
      <legend className="text-[1.3rem] leading-tight">The line between your stops</legend>
      {Object.entries(STORY_STYLES).map(([style, label]) => (
        <label key={style} className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="storyStyle"
            checked={trail.routeStyle === style}
            onChange={() => pick(style)}
            className="h-4 w-4 accent-[var(--color-road)]"
          />
          {label}
        </label>
      ))}
      {saving && <p className="text-small text-ink-soft">Drawing the route...</p>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </fieldset>
  );
}

// A route story: someone's own trip, stop by stop with their tips, and no
// video. The map (with the route reveal), the heights and fuel stops work as
// for a ride; the stops and their tips take the video's place.
export default function StoryPage({ trail, isOwner, onChange, fuelGapWarnKm }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const toast = useToast();
  const editing = isOwner && searchParams.has('edit');

  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [focus, setFocus] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [serviceKinds, toggleKind] = useServiceKinds();
  // The route's version when editing started: if it changed, "Done" plays the new route.
  const versionAtEdit = useRef(null);

  const stops = useMemo(() => [...trail.points].sort((a, b) => a.time - b.time), [trail.points]);
  // A story's route has no video times: the map and chart only show it.
  const route = useMemo(
    () => ({ track: trail.track, trackTimes: [], videoStartsAt: 0, hiddenRanges: [], cum: cumulativeDistances(trail.track) }),
    [trail.track],
  );
  const [services, retryServices] = useRouteServices(trail._id, trail.routeVersion, trail.track.length > 1);
  const ready = services?.status === 'ready' ? services : null;
  const longestGap = ready?.fuelGaps[0];
  const fuelGapLine = useMemo(
    () => (longestGap && serviceKinds.has('fuel') ? routeBetween(route, longestGap.fromM, longestGap.toM) : null),
    [route, longestGap, serviceKinds],
  );

  const profile = trail.elevationProfile?.routeVersion === trail.routeVersion ? trail.elevationProfile : null;
  const stats = trail.stats;
  const overnights = (stats?.nights ?? []).map((night, i) => ({ alongM: night.alongM, label: `Night ${i + 1}${night.name ? ` · ${night.name}` : ''}` }));
  const goAlong = (alongM) => setFocus({ location: locationAtDistance(route.track, route.cum, alongM) });
  const noFuel = longestGap?.afterName === 'the start' && longestGap?.beforeName === 'the end';
  const fuelChip = longestGap && (
    <Readout
      value={<span className={longestGap.lengthM >= fuelGapWarnKm * 1000 ? 'text-road' : ''}>{noFuel ? 'None mapped' : kmLength(longestGap.lengthM, true)}</span>}
      label={noFuel ? 'Fuel on the route' : `Without fuel · ${afterWhat(longestGap)}`}
      title={`${fuelGapSentence(longestGap, true)} ${FUEL_CAVEAT}`}
      onClick={() => goAlong(longestGap.fromM)}
      before={<ServiceBadge kind="fuel" className="h-5 w-5 text-[10px] ring-0" />}
    />
  );

  function applyUpdate(updated) {
    onChange(updated);
    setNotice(updated.routeNotice ?? null);
  }

  // Any change to the stops: busy meanwhile, and the server's reason if it fails.
  async function change(work) {
    setBusy(true);
    try {
      applyUpdate(await work());
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
    setBusy(false);
  }

  function toggleEditing() {
    stopAdding();
    setNotice(null);
    if (editing) {
      // The route changed while editing: play it.
      if (trail.track.length > 1 && trail.routeVersion !== versionAtEdit.current) setReveal((n) => n + 1);
      setSearchParams({});
    } else {
      versionAtEdit.current = trail.routeVersion;
      setSearchParams({ edit: '1' });
    }
  }

  function stopAdding() {
    setAdding(false);
    setPendingLocation(null);
  }

  async function saveStop(stop) {
    // Stops are kept in order by their number: the next one goes after the last.
    const time = stops.length ? stops.at(-1).time + 1 : 0;
    applyUpdate(await api.addPoint(trail._id, { ...stop, time }));
    stopAdding();
  }

  // Swaps a stop with the one before or after it.
  function moveStop(point, step) {
    const i = stops.indexOf(point);
    const other = stops[i + step];
    if (!other) return;
    change(async () => {
      await api.updatePoint(trail._id, point._id, { time: other.time });
      return api.updatePoint(trail._id, other._id, { time: point.time });
    });
  }

  async function deleteStop(point) {
    const yes = await confirm({
      title: 'Are you sure you want to delete this stop?',
      message: `“${point.name}” and your tips for it will be removed, and the route redrawn without it.`,
      confirmLabel: 'Delete stop',
    });
    if (yes) change(() => api.deletePoint(trail._id, point._id));
  }

  async function deleteStory() {
    const yes = await confirm({
      title: 'Are you sure you want to delete this route?',
      message: `“${trail.title}”, its stops and your tips will be deleted. This can't be undone.`,
      confirmLabel: 'Delete route',
    });
    if (!yes) return;
    try {
      await api.deleteTrail(trail._id);
      toast(`“${trail.title}” was successfully deleted.`);
      navigate('/');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Phones: the name, the map, then the stops. Wide screens: the story on the left, the map on the right. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ActivityBadge activity={trail.activity} />
              <span className="tag bg-surface text-contour" title="A route from someone's own trip, with no video">
                <Icon name="route" className="h-3.5 w-3.5 shrink-0" />
                Route story
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {trail.supportUrl && (
                <a href={trail.supportUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  <Icon name="heart" className="h-4 w-4" />
                  Support the creator
                </a>
              )}
              {isOwner && (
                <button type="button" onClick={toggleEditing} className="btn-secondary">
                  <Icon name={editing ? 'check' : 'edit'} className="h-4 w-4" />
                  {editing ? 'Done editing' : 'Edit'}
                </button>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-title">{trail.title}</h1>
            {trail.creatorName && (
              <p className="mt-2 flex items-center gap-2 text-ink-soft">
                <Icon name="pin" className="h-5 w-5 shrink-0 text-road" />
                <span>
                  Route by <span className="font-semibold text-ink">{trail.creatorName}</span>
                </span>
              </p>
            )}
          </div>
          <TripStats stats={stats} onHighest={Number.isFinite(stats?.highestAlongM) ? () => goAlong(stats.highestAlongM) : null} extra={fuelChip} />
          {trail.description && <p className="max-w-prose text-lead whitespace-pre-line">{trail.description}</p>}
          {trail.track.length > 1 && (
            <p className="text-small text-ink-soft">The route is drawn between the stops, so the roads may differ from the ones taken.</p>
          )}
        </section>

        {/* The map, with the elevation chart under it in the same sticky column. */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-18 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100svh-6rem)] lg:self-start">
          <div className="neatline isolate m-1 h-[55vh] overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
            <TrailMap
              trailId={trail._id}
              track={trail.track}
              trackTimes={[]}
              approximate
              points={stops}
              pendingLocation={pendingLocation}
              focus={focus}
              onPointClick={(point) => setFocus({ location: [point.lat, point.lng] })}
              onMapClick={adding ? setPendingLocation : null}
              ghost={ghost}
              services={ready?.items}
              serviceKinds={serviceKinds}
              fuelGapLine={fuelGapLine}
              reveal={reveal}
              onReplay={adding ? null : () => setReveal((n) => n + 1)}
            />
          </div>
          {profile && (
            <ElevationChart profile={profile} route={route} approximate highestName={stats?.highestName} overnights={overnights} onHover={setGhost} />
          )}
        </div>

        <div className="space-y-8 lg:col-start-1 lg:row-start-2">
          {notice && (
            <p role="status" className="flex items-start gap-2 rounded-[3px] bg-water-tint px-4 py-3 font-medium text-ink motion-safe:animate-rise">
              <Icon name="compass" className="mt-1 h-4 w-4 shrink-0 text-water" />
              {notice}
            </p>
          )}

          <section className="space-y-3">
            <SectionHeading aside={stops.length > 0 && `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`}>Stops and tips</SectionHeading>
            <StoryStops
              points={stops}
              editing={editing}
              busy={busy}
              onSelect={(point) => setFocus({ location: [point.lat, point.lng] })}
              onMove={moveStop}
              onDelete={deleteStop}
              onToggleNight={(point) => change(() => api.updatePoint(trail._id, point._id, { stopKind: point.stopKind === 'overnight' ? null : 'overnight' }))}
              onSaveTips={async (point, note) => applyUpdate(await api.updatePoint(trail._id, point._id, { note }))}
            />
            {editing &&
              (adding ? (
                <AddStopForm
                  number={stops.length + 1}
                  location={pendingLocation}
                  onSave={saveStop}
                  onCancel={stopAdding}
                  onPickPlace={(place) => {
                    setPendingLocation([place.lat, place.lng]);
                    setFocus({ location: [place.lat, place.lng] });
                  }}
                />
              ) : (
                <button type="button" onClick={() => setAdding(true)} disabled={busy} className="btn-primary">
                  <Icon name="pin" className="h-4 w-4" />
                  {stops.length ? 'Add the next stop' : 'Add where the trip starts'}
                </button>
              ))}
          </section>

          {editing && (
            <section className="space-y-7 rounded-[3px] bg-surface p-5 ring-1 ring-ink/15 sm:p-6">
              <h2 className="flex items-center gap-2 text-title">
                <Icon name="edit" className="h-6 w-6 text-road" />
                Edit this route
              </h2>
              <StyleSetting trail={trail} onSaved={applyUpdate} />
              {trail.track.length > 1 && <DaysSetting key={trail.daysOverride ?? 'auto'} trail={trail} onSaved={applyUpdate} />}
              <NameSetting key={trail.creatorName ?? ''} trail={trail} onSaved={applyUpdate} />
              <button type="button" onClick={deleteStory} className="text-small font-semibold text-road underline-offset-4 hover:underline">
                Delete this route
              </button>
            </section>
          )}

          <ServicesPanel
            services={services}
            lengthM={route.cum.at(-1) ?? 0}
            approximate
            warnKm={fuelGapWarnKm}
            visibleKinds={serviceKinds}
            onToggleKind={toggleKind}
            momentAt={() => null}
            onSeek={() => {}}
            onFocus={(location) => setFocus({ location })}
            onRetry={isOwner ? retryServices : undefined}
          />

          {(stops.length > 0 || trail.track.length > 0) && (
            <section className="space-y-3">
              <SectionHeading>Take this route with you</SectionHeading>
              <SaveOptions trail={trail} services={ready?.items ?? []} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
