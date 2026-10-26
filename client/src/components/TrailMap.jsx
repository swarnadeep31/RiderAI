import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { SERVICE_KINDS, serviceName } from '../lib/services.js';
import { useTheme } from '../lib/theme.js';
import { formatTime } from '../lib/time.js';
import { boundsOf, cumulativeDistances, indexAtOrBefore, positionAt, videoTimeAtLocation } from '../lib/track.js';

// The sheet's inks for the map: the route in road red, the rider and the AI's
// places in water blue. Read from the page's colours, which change at night.
function readInks() {
  const css = getComputedStyle(document.documentElement);
  const ink = (name, fallback) => css.getPropertyValue(`--color-${name}`).trim() || fallback;
  return { road: ink('road', '#c8261c'), ink: ink('ink', '#1b1d19'), water: ink('water', '#1d5c9c'), soft: ink('ink-soft', '#4a5047') };
}

// While dragging the marker, look for the road only this many route points
// either side of where it was, so it follows the road under the finger when a
// road is ridden twice (out and back). Further than FULL_SEARCH_M from that
// road, search the whole route.
const DRAG_WINDOW = 300;
const FULL_SEARCH_M = 200;
// Show the video frame under the marker at most this often while dragging.
const PREVIEW_MS = 250;
// The bold line's long part is redrawn at most this often, or when the tip
// to the marker would be longer than this many route points.
const LINE_MS = 500;
const TIP_MAX_POINTS = 200;

// Fuel always shows; mechanics, medical help and ATMs only from this zoom, so towns don't drown in ATMs.
const SERVICES_MIN_ZOOM = 11;

const serviceIcons = Object.fromEntries(
  Object.entries(SERVICE_KINDS).map(([kind, { symbol, colour, ink }]) => [
    kind,
    L.divIcon({
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div class="service-icon" style="background:${colour};color:${ink}">${symbol}</div>`,
    }),
  ]),
);

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Fuel stations, mechanics, medical help and ATMs near the route, with the
// longest stretch without fuel outlined. Drawn straight onto the map (there
// can be hundreds), only the kinds switched on in the services panel.
function ServicesLayer({ items, visibleKinds, gapLine }) {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane('fuelGap')) map.createPane('fuelGap').style.zIndex = '390'; // just under the route
    const outline = gapLine?.length > 1 ? L.polyline(gapLine, { pane: 'fuelGap', className: 'fuel-gap-outline', weight: 12, opacity: 0.5, dashArray: '2 10', lineCap: 'round', interactive: false }) : null;
    outline?.addTo(map);
    return () => outline?.remove();
  }, [map, gapLine]);

  useEffect(() => {
    const always = L.layerGroup();
    const closeUp = L.layerGroup();
    for (const item of items) {
      if (!visibleKinds.has(item.kind)) continue;
      const lines = [`<strong>${escapeHtml(serviceName(item))}</strong>`];
      if (item.brand && item.name) lines.push(escapeHtml(item.brand));
      if (item.hours) lines.push(`Open: ${escapeHtml(item.hours)}`);
      const marker = L.marker([item.lat, item.lng], { icon: serviceIcons[item.kind], keyboard: false, title: serviceName(item) }).bindTooltip(lines.join('<br>'), {
        direction: 'top',
        offset: [0, -10],
      });
      (item.kind === 'fuel' ? always : closeUp).addLayer(marker);
    }
    always.addTo(map);
    const showCloseUp = () => (map.getZoom() >= SERVICES_MIN_ZOOM ? closeUp.addTo(map) : closeUp.remove());
    showCloseUp();
    map.on('zoomend', showCloseUp);
    return () => {
      map.off('zoomend', showCloseUp);
      always.remove();
      closeUp.remove();
    };
  }, [map, items, visibleKinds]);
  return null;
}

const riderIcon = L.divIcon({ className: 'rider-marker', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="rider-dot"></div>' });

// The time bubble on the marker while it's dragged.
function bubbleText(hit) {
  if (hit.outside === 'before') return '0:00 · the video starts later';
  if (hit.outside === 'after') return `${formatTime(hit.time)} · the video ends here`;
  return formatTime(hit.time);
}

function describeMoment(hit) {
  if (hit.outside === 'before') return 'The video starts later. Click to jump to its start';
  if (hit.outside === 'after') return 'The video ends before here. Click to jump to its end';
  return `Jump to ${formatTime(hit.time)}`;
}

// An invisible, wide line over the route that turns a click into a seek, and
// shows which moment of the video it is. Wide enough for a finger.
function ScrubLine({ route, scrub }) {
  const map = useMap();
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;

  useEffect(() => {
    const playable = route.trackTimes?.length > 0 && route.trackTimes.length === route.track.length;
    const line = L.polyline(route.track, { weight: 20, opacity: 0, className: 'scrub-line', bubblingMouseEvents: false }).addTo(map);
    if (!playable) {
      line.bindTooltip("This route has no times, so it can't move the video.", { sticky: true });
      return () => line.remove();
    }
    const hitAt = (latlng) => videoTimeAtLocation(route, [latlng.lat, latlng.lng], { duration: scrubRef.current.getDuration() });
    line.bindTooltip('', { sticky: true, direction: 'top', offset: [0, -10] });
    line.on('mousemove', (event) => line.setTooltipContent(describeMoment(hitAt(event.latlng))));
    line.on('click', (event) => {
      const hit = hitAt(event.latlng);
      scrubRef.current.onSeek(hit.time, { final: true, play: true });
    });
    return () => line.remove();
  }, [map, route]);
  return null;
}

// Numbered pins matching the key point list. Cached so markers don't
// rebuild their icon on every render.
const iconCache = new Map();
function numberIcon(number, active) {
  const key = `${number}:${active}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div class="map-point" data-active="${active}">${number}</div>`,
      }),
    );
  }
  return iconCache.get(key);
}

// Zooms to the whole trail once when it first has something to show.
function FitToTrail({ trailId, locations }) {
  const map = useMap();
  const hasLocations = locations.length > 0;
  useEffect(() => {
    const bounds = boundsOf(locations);
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    // Only refit for a new trail, not every time a point is added.
  }, [map, trailId, hasLocations]);
  return null;
}

// Zooms to the AI's ticked places when their review opens (unticked ones are
// often far away: "one day we'll ride to Leh").
function FitToPreview({ places }) {
  const map = useMap();
  const showing = places.length > 0;
  useEffect(() => {
    const located = places.filter((p) => p.lat !== null);
    const ticked = located.filter((p) => p.checked);
    const bounds = boundsOf((ticked.length > 1 ? ticked : located).map((p) => [p.lat, p.lng]));
    if (showing && bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    // Only when the review opens, not on every tick or change.
  }, [map, showing]);
  return null;
}

// Pans to a key point when one is picked from the list.
function PanTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus.location, Math.max(map.getZoom(), 13));
  }, [map, focus]);
  return null;
}

// The cab-app view: a marker gliding along the route with the video, and the
// part already covered drawn bold. It's updated straight on the map about 60
// times a second, outside React, so the rest of the page doesn't redraw.
// With `scrub`, the marker can be dragged along the route to move the video:
// the video pauses and shows the frame under the marker, then carries on from
// there (playing again only if it was playing). With the marker focused, the
// arrow keys move 10 s, or 60 s with Shift.
// On a drawn route (approximate), the marker waits at the start before the
// ride sets off and at the end after it arrives.
// The bold line is two lines: the long part up to a recent route point,
// redrawn at most twice a second, and the short tip from there to the
// marker, redrawn every frame. Redrawing thousands of points 60 times a
// second is what made the marker stutter on long routes.
function RiderLayer({ route, clock, follow, approximate, scrub, inks }) {
  const { track, trackTimes, videoStartsAt, hiddenRanges } = route;
  const map = useMap();
  const followRef = useRef(follow);
  followRef.current = follow;
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  const canScrub = Boolean(scrub);

  useEffect(() => {
    if (!trackTimes?.length || trackTimes.length !== track.length) return undefined;
    // Its own layer, so the marker is drawn above the key point pins (600) and below tooltips (650).
    if (!map.getPane('rider')) map.createPane('rider').style.zIndex = '640';
    const lineStyle = { color: inks.road, weight: 6, opacity: 1, dashArray: approximate ? '10 8' : undefined, interactive: false };
    const travelled = L.polyline([], lineStyle).addTo(map);
    const tip = L.polyline([], lineStyle).addTo(map);
    // The route point the long part ends at, and when it was last redrawn.
    let shownIndex = -1;
    let lineAt = 0;
    const drawTravelled = (index, point, now) => {
      if (index < 0) {
        if (shownIndex !== -1) travelled.setLatLngs([]);
        shownIndex = -1;
        tip.setLatLngs([]);
        return;
      }
      if (shownIndex < 0 || index < shownIndex || index - shownIndex > TIP_MAX_POINTS || now - lineAt > LINE_MS) {
        travelled.setLatLngs(track.slice(0, index + 1));
        shownIndex = index;
        lineAt = now;
      }
      const piece = track.slice(shownIndex, index + 1);
      tip.setLatLngs(point ? [...piece, point] : piece);
    };
    const restingTooltip = canScrub ? 'Here now in the video. Drag me along the route to scrub.' : 'Here now in the video';
    const marker = L.marker([0, 0], { pane: 'rider', icon: riderIcon, draggable: canScrub, keyboard: canScrub, autoPan: false })
      .bindTooltip(restingTooltip, { direction: 'top', offset: [0, -12] });

    // Scrubbing: while the marker is held, the animation below leaves it alone.
    let scrubbing = false;
    let wasPlaying = false;
    let lastHit = null;
    let lastPreviewAt = 0;
    const duration = () => scrubRef.current?.getDuration() ?? 0;
    const hitNear = (latlng) => {
      const location = [latlng.lat, latlng.lng];
      const around = lastHit?.index ?? indexAtOrBefore(trackTimes, clock.now() + videoStartsAt);
      const window = { from: Math.max(0, around - DRAG_WINDOW), to: around + DRAG_WINDOW };
      const near = videoTimeAtLocation(route, location, { window, duration: duration() });
      return near.offM <= FULL_SEARCH_M ? near : videoTimeAtLocation(route, location, { duration: duration() });
    };
    marker.on('dragstart', () => {
      scrubbing = true;
      lastHit = null;
      wasPlaying = scrubRef.current.isPlaying();
      scrubRef.current.pause();
      marker.setTooltipContent(formatTime(clock.now())).openTooltip();
    });
    marker.on('drag', (event) => {
      const hit = hitNear(event.latlng);
      lastHit = hit;
      // Keep the marker on the road, and the bold line up to it.
      marker.setLatLng(hit.point);
      drawTravelled(hit.index, hit.point, performance.now());
      marker.setTooltipContent(bubbleText(hit));
      if (performance.now() - lastPreviewAt > PREVIEW_MS) {
        lastPreviewAt = performance.now();
        scrubRef.current.onSeek(hit.time, { final: false });
      }
    });
    marker.on('dragend', () => {
      if (lastHit) scrubRef.current.onSeek(lastHit.time, { final: true, play: wasPlaying });
      marker.setTooltipContent(restingTooltip);
      scrubbing = false;
      lastTime = null;
    });
    const onKey = (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !scrubRef.current) return;
      // Don't let the map pan as well.
      event.preventDefault();
      event.stopPropagation();
      const step = (event.shiftKey ? 60 : 10) * (event.key === 'ArrowLeft' ? -1 : 1);
      const end = duration() || Infinity;
      const time = Math.min(Math.max(clock.now() + step, 0), end);
      scrubRef.current.onSeek(time, { final: true, play: scrubRef.current.isPlaying() });
    };

    let frame;
    let lastTime = null;
    let lastFollow = followRef.current;
    let lastPanAt = 0;
    // After a zoom, look again even while paused (the marker may now be off screen).
    const recheck = () => {
      lastTime = null;
    };
    map.on('zoomend', recheck);
    const draw = (now) => {
      const t = clock.now();
      if (!scrubbing && (t !== lastTime || followRef.current !== lastFollow)) {
        lastFollow = followRef.current;
        const position = positionAt(track, trackTimes, videoStartsAt, t, hiddenRanges, { hold: approximate });
        let panLater = false;
        if (position) {
          if (!map.hasLayer(marker)) {
            marker.addTo(map);
            const element = marker.getElement();
            element.setAttribute('aria-label', canScrub ? "The rider's place in the video. Drag it, or use the arrow keys, to move through the ride." : "The rider's place in the video");
            element.addEventListener('keydown', onKey);
          }
          marker.setLatLng(position);
          // Keep the marker on screen, panning at most every 0.4 s.
          if (followRef.current && !map.getBounds().pad(-0.15).contains(position)) {
            if (now - lastPanAt > 400) {
              map.panTo(position);
              lastPanAt = now;
            } else {
              panLater = true;
            }
          }
        } else if (map.hasLayer(marker)) {
          marker.remove();
        }
        // The bold part up to the marker (all of it once the route is done).
        drawTravelled(indexAtOrBefore(trackTimes, t + videoStartsAt), position, now);
        lastTime = panLater ? null : t;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      map.off('zoomend', recheck);
      marker.getElement()?.removeEventListener('keydown', onKey);
      travelled.remove();
      tip.remove();
      marker.remove();
    };
  }, [map, route, track, trackTimes, videoStartsAt, hiddenRanges, clock, approximate, canScrub, inks.road]);
  return null;
}

// The AI's places while they're being reviewed: blue dots joined in order
// (unticked ones grey, suspicious ones red). Drawn in the browser, at no cost.
function AiPreview({ places, inks }) {
  const located = places.filter((p) => p.lat !== null && p.lat !== undefined);
  const ticked = located.filter((p) => p.checked);
  return (
    <>
      {ticked.length > 1 && (
        <Polyline positions={ticked.map((p) => [p.lat, p.lng])} pathOptions={{ color: inks.water, weight: 3, dashArray: '2 8', opacity: 0.9 }} />
      )}
      {located.map((p) => {
        const colour = !p.checked ? inks.soft : p.flags?.includes('detour') ? inks.road : inks.water;
        return (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: colour, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>
              {p.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function MapEvents({ onMapClick, onUserMove }) {
  useMapEvents({
    click: (event) => onMapClick?.([event.latlng.lat, event.latlng.lng]),
    dragstart: () => onUserMove?.(),
  });
  return null;
}

export default function TrailMap({
  trailId,
  track,
  trackTimes,
  videoStartsAt = 0,
  hiddenRanges,
  clock,
  approximate,
  points,
  activePointId,
  pendingLocation,
  preview = [],
  hiddenNote,
  focus,
  follow,
  onFollowChange,
  onPointClick,
  onMapClick,
  onSeek,
  isPlaying,
  pause,
  getDuration,
  ghost,
  services = [],
  serviceKinds,
  fuelGapLine,
}) {
  const playable = trackTimes?.length > 0 && trackTimes.length === track.length;
  const theme = useTheme();
  const inks = useMemo(readInks, [theme]);
  // Everything the route maths needs, worked out once per route.
  const route = useMemo(
    () => ({ track, trackTimes, videoStartsAt, hiddenRanges: hiddenRanges ?? [], cum: cumulativeDistances(track) }),
    [track, trackTimes, videoStartsAt, hiddenRanges],
  );
  // Clicking or dragging along the route moves the video, except while the
  // map is being used to place a key point or line up the route.
  const scrub = onSeek && !onMapClick ? { onSeek, isPlaying, pause, getDuration } : null;
  const locations = [...track, ...points.map((p) => [p.lat, p.lng]), ...preview.filter((p) => p.lat !== null).map((p) => [p.lat, p.lng])];

  return (
    <div className={`relative h-full w-full ${onMapClick ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
      <MapContainer center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {track.length > 1 && (
          <>
            {/* A road on a sheet: red, edged in ink. */}
            <Polyline positions={track} pathOptions={{ color: inks.ink, weight: 8, opacity: playable ? 0.3 : 0.5, interactive: false }} />
            <Polyline
              positions={track}
              // Faded when the video can play along it (the covered part is drawn bold on top).
              // Dashed for routes drawn between key points: they're approximate.
              pathOptions={{ color: inks.road, weight: 5, opacity: playable ? 0.6 : 0.95, dashArray: approximate ? '10 8' : undefined, interactive: false }}
            />
          </>
        )}
        {track.length > 1 && scrub && <ScrubLine route={route} scrub={scrub} />}
        {points.map((point, i) => (
          <Marker
            key={point._id}
            position={[point.lat, point.lng]}
            icon={numberIcon(i + 1, point._id === activePointId)}
            eventHandlers={{
              // While choosing a location, a pin counts as a click on its spot.
              click: () => (onMapClick ? onMapClick([point.lat, point.lng]) : onPointClick?.(point)),
            }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {point.name}
            </Tooltip>
          </Marker>
        ))}
        {pendingLocation && (
          <CircleMarker center={pendingLocation} radius={9} pathOptions={{ color: inks.road, weight: 3, dashArray: '4 4', fillOpacity: 0.2 }} />
        )}
        {/* While the AI's places are reviewed, the service icons step aside, so the two don't mix. */}
        {preview.length === 0 && (services.length > 0 || fuelGapLine) && <ServicesLayer items={services} visibleKinds={serviceKinds} gapLine={fuelGapLine} />}
        <AiPreview places={preview} inks={inks} />
        {/* The spot under the pointer on the elevation chart. */}
        {ghost && (
          <CircleMarker center={ghost} radius={8} interactive={false} pathOptions={{ color: inks.water, weight: 3, fill: false, dashArray: '3 3' }} />
        )}
        {playable && clock && <RiderLayer route={route} clock={clock} follow={follow} approximate={approximate} scrub={scrub} inks={inks} />}
        <FitToTrail trailId={trailId} locations={locations} />
        <FitToPreview places={preview} />
        <PanTo focus={focus} />
        <MapEvents onMapClick={onMapClick} onUserMove={() => onFollowChange?.(false)} />
      </MapContainer>

      {hiddenNote && (
        <p className="absolute top-3 left-14 z-[1000] rounded-[3px] bg-paper/95 px-3 py-1.5 text-small font-medium ring-1 ring-ink/20">{hiddenNote}</p>
      )}
      {playable && !follow && (
        <button
          type="button"
          onClick={() => onFollowChange?.(true)}
          className="btn-secondary btn-small absolute right-3 bottom-6 z-[1000]"
        >
          Follow the video
        </button>
      )}
    </div>
  );
}
