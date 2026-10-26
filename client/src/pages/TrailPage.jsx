import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ActivityBadge from '../components/ActivityBadge.jsx';
import AddPointForm from '../components/AddPointForm.jsx';
import AiRoutePanel, { HIDDEN_REASONS } from '../components/AiRoutePanel.jsx';
import ElevationChart from '../components/ElevationChart.jsx';
import Icon from '../components/art/Icon.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import KeyPointList from '../components/KeyPointList.jsx';
import RoutePanel from '../components/RoutePanel.jsx';
import SaveOptions from '../components/SaveOptions.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import ServicesPanel, { ServiceBadge } from '../components/ServicesPanel.jsx';
import TrailMap from '../components/TrailMap.jsx';
import TripStats, { Readout } from '../components/TripStats.jsx';
import { useRouteServices } from '../hooks/useRouteServices.js';
import { useConfirm, useToast } from '../notices.jsx';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer.js';
import { FUEL_CAVEAT, KIND_ORDER, afterWhat, fuelGapSentence, kmLength } from '../lib/services.js';
import {
  cumulativeDistances,
  hiddenRangeAt,
  isGpxRoute,
  locationAtDistance,
  nearestIndex,
  positionAt,
  videoTimeAtDistance,
} from '../lib/track.js';
import { formatTime } from '../lib/time.js';

// Who the page credits for the video: a name the owner types, or else the YouTube channel's.
function CreatorSetting({ trail, onSaved }) {
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
      <h3 className="text-[1.3rem] leading-tight">Video creator</h3>
      <p className="text-small text-ink-soft">
        {trail.channel?.name
          ? `Leave it empty to show the YouTube channel's name (${trail.channel.name}).`
          : 'The name shown as "Video by ...".'}
      </p>
      <div className="flex items-center gap-2">
        <input
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={trail.channel?.name ?? "The rider's or channel's name"}
          aria-label="Video creator's name"
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

// The owner can say how many days the trip took, when the worked-out number is wrong.
function DaysSetting({ trail, onSaved }) {
  const [text, setText] = useState(trail.daysOverride ? String(trail.daysOverride) : '');
  const [error, setError] = useState(null);
  const worked = trail.stats?.daysSource && trail.stats.daysSource !== 'owner' ? trail.stats.days : null;

  async function save(event) {
    event.preventDefault();
    const days = text.trim() === '' ? null : Number(text);
    try {
      setError(null);
      onSaved(await api.updateTrail(trail._id, { daysOverride: days }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <h3 className="text-[1.3rem] leading-tight">Riding days</h3>
      <p className="text-small text-ink-soft">
        {trail.daysOverride
          ? `You set ${trail.daysOverride}. Empty the box and save to work it out again.`
          : worked
            ? `Worked out from the ${trail.stats.daysSource === 'gps' ? 'GPS recording' : 'overnight stops'}: ${worked}. Change it if that's wrong.`
            : 'Mark the places you stayed the night (the moon beside a place), or type the number of days.'}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="365"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={worked ? String(worked) : 'Days'}
          aria-label="Riding days"
          className="field w-24"
        />
        <button type="submit" className="btn-secondary btn-small">
          Save
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </form>
  );
}

// Which kinds of services (fuel, mechanics...) the viewer has switched on,
// remembered in this browser.
const KINDS_KEY = 'trailcast.serviceKinds';
function loadKinds() {
  try {
    const saved = JSON.parse(localStorage.getItem(KINDS_KEY));
    if (Array.isArray(saved)) return new Set(saved.filter((kind) => KIND_ORDER.includes(kind)));
  } catch {
    // No storage (private window): everything is on.
  }
  return new Set(KIND_ORDER);
}

// The part of the route between two distances, for outlining it on the map.
function routeBetween(route, fromM, toM) {
  const inside = route.track.filter((_, i) => route.cum[i] > fromM && route.cum[i] < toM);
  return [locationAtDistance(route.track, route.cum, fromM), ...inside, locationAtDistance(route.track, route.cum, toM)];
}

function describeSync(videoStartsAt) {
  if (videoStartsAt === 0) return 'The video and the GPS recording start at the same moment.';
  return videoStartsAt > 0
    ? `The video starts ${formatTime(videoStartsAt)} into the GPS recording.`
    : `The GPS recording starts ${formatTime(-videoStartsAt)} into the video.`;
}

export default function TrailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [trail, setTrail] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  // What clicking the map does while editing: null, 'add' (place a key point) or 'sync'.
  const [mapMode, setMapMode] = useState(null);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [follow, setFollow] = useState(true);
  const [focus, setFocus] = useState(null);
  // The AI's places on the map while the owner reviews them.
  const [preview, setPreview] = useState([]);
  // The spot under the pointer on the elevation chart, shown on the map too.
  const [ghost, setGhost] = useState(null);
  const [serviceKinds, setServiceKinds] = useState(loadKinds);
  const [fuelGapWarnKm, setFuelGapWarnKm] = useState(150);

  useEffect(() => {
    api.getConfig().then((config) => config.fuelGapWarnKm && setFuelGapWarnKm(config.fuelGapWarnKm), () => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getTrail(id).then(
      (loaded) => !cancelled && setTrail(loaded),
      (err) => !cancelled && setLoadError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const video = useYouTubePlayer(trail?.youtubeId);

  // Everything the route maths needs, worked out once per route.
  const route = useMemo(
    () =>
      trail && {
        track: trail.track,
        trackTimes: trail.trackTimes,
        videoStartsAt: trail.videoStartsAt,
        hiddenRanges: trail.hiddenRanges ?? [],
        cum: cumulativeDistances(trail.track),
      },
    [trail?.track, trail?.trackTimes, trail?.videoStartsAt, trail?.hiddenRanges],
  );
  // Fuel stops and the like along the route, found by the server once per route version.
  const services = useRouteServices(trail?._id, trail?.routeVersion, trail?.track.length > 1);
  const ready = services?.status === 'ready' ? services : null;
  const longestGap = ready?.fuelGaps[0];
  const fuelGapLine = useMemo(
    () => (route && longestGap && serviceKinds.has('fuel') ? routeBetween(route, longestGap.fromM, longestGap.toM) : null),
    [route, longestGap, serviceKinds],
  );

  function toggleKind(kind) {
    setServiceKinds((kinds) => {
      const next = new Set(kinds);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      try {
        localStorage.setItem(KINDS_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered, but still switched.
      }
      return next;
    });
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-16">
        <h1 className="text-title uppercase">This ride couldn&apos;t be opened</h1>
        <ErrorMessage>{loadError}</ErrorMessage>
        <Link to="/" className="btn-primary">
          Back to the rides
        </Link>
      </main>
    );
  }
  if (!trail) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-16 font-medium text-ink-soft">
        <Icon name="compass" className="h-5 w-5 text-road motion-safe:animate-spin" /> Opening the ride...
      </p>
    );
  }

  // Only the person who added the trail sees the Edit button and the creator tools.
  const isOwner = Boolean(user && trail.owner?._id === user._id);
  const editing = isOwner && searchParams.has('edit');
  // Where the rider is now (the map draws its own smoothly moving marker; this is for new key points).
  const position = positionAt(trail.track, trail.trackTimes, trail.videoStartsAt, video.currentTime, trail.hiddenRanges);
  const activePoint = trail.points.findLast((p) => p.time <= video.currentTime + 0.5);
  const recorded = isGpxRoute(trail);
  const drawnRoute = trail.routeSource === 'keypoints' && trail.track.length > 1;
  const aiRoute = drawnRoute && trail.points.some((p) => p.origin === 'ai');
  const hidden = drawnRoute ? hiddenRangeAt(trail.hiddenRanges, video.currentTime) : null;
  // Recorded routes may need lining up with the video; drawn routes use video times already.
  const canSync = recorded && trail.trackTimes.length > 0;
  // Heights for the chart, if they belong to the route as it is now.
  const profile = trail.elevationProfile?.routeVersion === trail.routeVersion ? trail.elevationProfile : null;
  const stats = trail.stats;
  const creator = trail.creatorName || trail.channel?.name;
  const overnights = (stats?.nights ?? []).map((night, i) => ({ alongM: night.alongM, label: `Night ${i + 1}${night.name ? ` · ${night.name}` : ''}` }));
  // The longest stretch without fuel joins the stats once the services are in. Clicking it shows it on the map.
  const noFuel = longestGap?.afterName === 'the start' && longestGap?.beforeName === 'the end';
  const fuelChip = longestGap && (
    <Readout
      value={<span className={longestGap.lengthM >= fuelGapWarnKm * 1000 ? 'text-road' : ''}>{noFuel ? 'None mapped' : kmLength(longestGap.lengthM, drawnRoute)}</span>}
      label={noFuel ? 'Fuel on the route' : `Without fuel · ${afterWhat(longestGap)}`}
      title={`${fuelGapSentence(longestGap, drawnRoute)} ${FUEL_CAVEAT}`}
      onClick={() => goAlong(longestGap.fromM)}
      before={<ServiceBadge kind="fuel" className="h-5 w-5 text-[10px] ring-0" />}
    />
  );
  const statsRow = (className) => (
    <TripStats
      stats={stats}
      onHighest={Number.isFinite(stats?.highestAlongM) ? () => goAlong(stats.highestAlongM) : null}
      extra={fuelChip}
      className={className}
    />
  );

  // After any change, the server sends the updated trail, plus a message if
  // redrawing the route didn't go as asked (e.g. no road-following key).
  function applyUpdate(updated) {
    setTrail(updated);
    if (updated.routeNotice) setNotice(updated.routeNotice);
  }

  function selectPoint(point) {
    video.seekTo(point.time);
    setFocus({ location: [point.lat, point.lng] });
  }

  // A spot along the route (the highest point, a fuel stop): show it on the
  // map, and watch the moment the rider was there.
  function goAlong(alongM) {
    setFocus({ location: locationAtDistance(route.track, route.cum, alongM) });
    const moment = videoTimeAtDistance(route, alongM, { duration: video.getDuration() });
    if (moment) video.seekTo(moment.time);
  }

  async function toggleNight(point) {
    try {
      applyUpdate(await api.updatePoint(trail._id, point._id, { stopKind: point.stopKind === 'overnight' ? null : 'overnight' }));
    } catch (err) {
      setNotice(err.message);
    }
  }

  // Clicking or dragging along the route. While dragging (not final), show the
  // frame there without loading ahead or playing; when it ends, carry on.
  function seekFromRoute(seconds, { final, play = true }) {
    if (final) video.seekTo(seconds, { play });
    else video.seekTo(seconds, { allowSeekAhead: false, play: false });
  }

  function startAddingPoint() {
    video.pause();
    setPendingLocation(position);
    setMapMode('add');
  }

  function stopMapMode() {
    setMapMode(null);
    setPendingLocation(null);
  }

  async function savePoint(point) {
    applyUpdate(await api.addPoint(trail._id, point));
    stopMapMode();
  }

  function pickPlace(place) {
    setPendingLocation([place.lat, place.lng]);
    setFocus({ location: [place.lat, place.lng] });
  }

  async function deletePoint(point) {
    const yes = await confirm({
      title: 'Are you sure you want to delete this place?',
      message: `“${point.name}” will be removed from the trail and the map.`,
      confirmLabel: 'Delete place',
    });
    if (!yes) return;
    try {
      applyUpdate(await api.deletePoint(trail._id, point._id));
      toast(`“${point.name}” was successfully deleted.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  // The creator clicked where they were at this moment of the video: the
  // nearest route point tells us how the video and GPS clocks line up.
  async function syncAt(location) {
    const index = nearestIndex(trail.track, location);
    const videoStartsAt = Math.round((trail.trackTimes[index] - video.currentTime) * 10) / 10;
    try {
      setTrail(await api.updateTrail(trail._id, { videoStartsAt }));
      setNotice('Synced. Play the video to check the blue dot follows it.');
      setFollow(true);
      stopMapMode();
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleMapClick(location) {
    if (mapMode === 'add') setPendingLocation(location);
    if (mapMode === 'sync') syncAt(location);
  }

  async function deleteTrail() {
    const yes = await confirm({
      title: 'Are you sure you want to delete this trail?',
      message: `“${trail.title}” and everything worked out for it (the route, heights and fuel stops) will be deleted. This can't be undone.`,
      confirmLabel: 'Delete trail',
    });
    if (!yes) return;
    try {
      await api.deleteTrail(trail._id);
      // The message stays on screen on the home page.
      toast(`“${trail.title}” was successfully deleted.`);
      navigate('/');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Phones: video, map, details. Wide screens: video and details on the left, map on the right. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-start-1 lg:row-start-1">
          <div
            ref={video.containerRef}
            className="aspect-video w-full overflow-hidden rounded-[3px] bg-ink"
          />
          {video.error && (
            <div className="mt-2">
              <ErrorMessage>{video.error}</ErrorMessage>
            </div>
          )}
          {/* The ride's name and numbers come straight after the video, on every screen. */}
          <section className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ActivityBadge activity={trail.activity} />
                {recorded && (
                  <span className="tag bg-surface text-ink" title="The route was recorded with GPS">
                    <Icon name="satellite" className="h-3.5 w-3.5" />
                    GPS route
                  </span>
                )}
                {drawnRoute && (
                  <span className={`tag ${aiRoute ? 'bg-water-tint text-water' : 'bg-surface text-contour'}`}>
                    <Icon name={aiRoute ? 'sparkles' : 'route'} className="h-3.5 w-3.5 shrink-0" />
                    {aiRoute ? 'AI-estimated route' : 'Approximate route'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {trail.supportUrl && (
                  <a href={trail.supportUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
                    <Icon name="heart" className="h-4 w-4" />
                    Support the creator
                  </a>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      stopMapMode();
                      setNotice(null);
                      setSearchParams(editing ? {} : { edit: '1' });
                    }}
                    className="btn-secondary"
                  >
                    <Icon name={editing ? 'check' : 'edit'} className="h-4 w-4" />
                    {editing ? 'Done editing' : 'Edit'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <h1 className="text-title">{trail.title}</h1>
              {/* The video's creator: the name given for the trail, or else the YouTube channel. */}
              {creator && (
                <p className="mt-2 flex items-center gap-2 text-ink-soft">
                  <Icon name="video" className="h-5 w-5 shrink-0 text-road" />
                  <span>
                    Video by{' '}
                    {trail.channel?.url ? (
                      <a href={trail.channel.url} target="_blank" rel="noopener noreferrer" className="link">
                        {creator}
                      </a>
                    ) : (
                      <span className="font-semibold text-ink">{creator}</span>
                    )}
                  </span>
                </p>
              )}
            </div>
            {statsRow('')}
          </section>
        </div>

        {/* The map, with the elevation chart under it in the same sticky column. */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-18 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100svh-6rem)] lg:self-start">
          <div className="neatline isolate m-1 h-[55vh] overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
            <TrailMap
              trailId={trail._id}
              track={trail.track}
              trackTimes={trail.trackTimes}
              videoStartsAt={trail.videoStartsAt}
              hiddenRanges={trail.hiddenRanges}
              clock={video.clock}
              approximate={drawnRoute}
              points={trail.points}
              activePointId={activePoint?._id}
              pendingLocation={pendingLocation}
              preview={preview}
              hiddenNote={hidden && `${HIDDEN_REASONS[hidden.reason]}: the map picks up again at ${formatTime(hidden.end)}`}
              focus={focus}
              follow={follow}
              onFollowChange={setFollow}
              onPointClick={selectPoint}
              onMapClick={mapMode ? handleMapClick : null}
              onSeek={seekFromRoute}
              isPlaying={video.isPlaying}
              pause={video.pause}
              getDuration={video.getDuration}
              ghost={ghost}
              services={ready?.items}
              serviceKinds={serviceKinds}
              fuelGapLine={fuelGapLine}
            />
          </div>
          {profile && (
            <ElevationChart
              profile={profile}
              route={route}
              clock={video.clock}
              approximate={drawnRoute}
              highestName={stats?.highestName}
              overnights={overnights}
              getDuration={video.getDuration}
              onSeek={mapMode ? null : seekFromRoute}
              onHover={setGhost}
            />
          )}
        </div>

        <div className="space-y-8 lg:col-start-1 lg:row-start-2">
          <section className="space-y-4">


            {drawnRoute && (
              <p className="text-small text-ink-soft">
                {aiRoute
                  ? 'The AI worked out this route from the places in the video, so the roads may differ.'
                  : 'This route is drawn between the places, so the roads may differ.'}
              </p>
            )}
            {trail.description && <p className="max-w-prose text-lead whitespace-pre-line">{trail.description}</p>}
          </section>

          {notice && (
            <p role="status" className="flex items-start gap-2 rounded-[3px] bg-water-tint px-4 py-3 font-medium text-ink motion-safe:animate-rise">
              <Icon name="compass" className="mt-1 h-4 w-4 shrink-0 text-water" />
              {notice}
            </p>
          )}

          {editing && (
            <section className="space-y-7 rounded-[3px] bg-surface p-5 ring-1 ring-ink/15 sm:p-6">
              <h2 className="flex items-center gap-2 text-title">
                <Icon name="edit" className="h-6 w-6 text-road" />
                Edit this ride
              </h2>

              {mapMode === 'add' ? (
                <AddPointForm
                  currentTime={video.currentTime}
                  location={pendingLocation}
                  onSave={savePoint}
                  onCancel={stopMapMode}
                  onPickPlace={pickPlace}
                />
              ) : (
                <button type="button" onClick={startAddingPoint} className="btn-primary">
                  <Icon name="pin" className="h-4 w-4" />
                  Add a place at {formatTime(video.currentTime)}
                </button>
              )}

              {canSync && (
                <div className="space-y-2">
                  <h3 className="text-[1.3rem] leading-tight">Line up the map with the video</h3>
                  <p>{describeSync(trail.videoStartsAt)}</p>
                  {mapMode === 'sync' ? (
                    <p className="font-medium text-road">
                      Now click the spot on the route where you were at {formatTime(video.currentTime)} in the video.{' '}
                      <button type="button" onClick={stopMapMode} className="underline">
                        Cancel
                      </button>
                    </p>
                  ) : (
                    <>
                      <p className="text-small text-ink-soft">
                        If the blue dot is ahead of or behind the video: pause at a moment you can find on the map (a
                        bridge, a junction, the start), then press Sync and click that spot on the route.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          video.pause();
                          setMapMode('sync');
                        }}
                        disabled={mapMode !== null}
                        className="btn-secondary"
                      >
                        Sync at {formatTime(video.currentTime)}
                      </button>
                    </>
                  )}
                </div>
              )}
              {recorded && !canSync && (
                <p className="text-small text-ink-soft">
                  This route has no times, so the map can't follow the video. Key points still work.
                </p>
              )}
              {!recorded && (
                <AiRoutePanel
                  trail={trail}
                  getDuration={video.getDuration}
                  onSeek={video.seekTo}
                  onPreview={setPreview}
                  onAccepted={(updated) => {
                    applyUpdate(updated);
                    if (!updated.routeNotice) setNotice('Route drawn. Play the video to watch the blue dot follow it.');
                    setFollow(true);
                  }}
                />
              )}
              {!recorded && (
                <RoutePanel
                  trail={trail}
                  onDrawn={(updated) => {
                    applyUpdate(updated);
                    if (!updated.routeNotice) setNotice('Route drawn. Play the video to watch the blue dot follow it.');
                    setFollow(true);
                  }}
                />
              )}

              {trail.track.length > 1 && <DaysSetting key={trail.daysOverride ?? 'auto'} trail={trail} onSaved={applyUpdate} />}

              <CreatorSetting key={trail.creatorName ?? ''} trail={trail} onSaved={applyUpdate} />

              <button type="button" onClick={deleteTrail} className="text-small font-semibold text-road underline-offset-4 hover:underline">
                Delete this trail
              </button>
            </section>
          )}

          <section className="space-y-3">
            <SectionHeading aside={trail.points.length > 0 && `${trail.points.length} ${trail.points.length === 1 ? 'place' : 'places'}`}>
              Places on the way
            </SectionHeading>
            <KeyPointList
              points={trail.points}
              activePointId={activePoint?._id}
              editing={editing}
              onSelect={selectPoint}
              onDelete={deletePoint}
              onToggleNight={toggleNight}
            />
          </section>

          <ServicesPanel
            services={services}
            lengthM={route.cum.at(-1) ?? 0}
            approximate={drawnRoute}
            warnKm={fuelGapWarnKm}
            visibleKinds={serviceKinds}
            onToggleKind={toggleKind}
            momentAt={(alongM) => videoTimeAtDistance(route, alongM, { duration: video.getDuration() })}
            onSeek={(seconds) => video.seekTo(seconds)}
            onFocus={(location) => setFocus({ location })}
          />

          {(trail.points.length > 0 || trail.track.length > 0) && (
            <section className="space-y-3">
              <SectionHeading>Take this ride with you</SectionHeading>
              <SaveOptions trail={trail} services={ready?.items ?? []} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
