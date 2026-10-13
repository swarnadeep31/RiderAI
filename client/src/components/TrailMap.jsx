import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { formatTime } from '../lib/time.js';
import { boundsOf, cumulativeDistances, indexAtOrBefore, positionAt, travelledAt, videoTimeAtLocation } from '../lib/track.js';

const ORANGE = '#ea580c';
const VIOLET = '#7c3aed';

// While dragging the marker, look for the road only this many route points
// either side of where it was, so it follows the road under the finger when a
// road is ridden twice (out and back). Further than FULL_SEARCH_M from that
// road, search the whole route.
const DRAG_WINDOW = 300;
const FULL_SEARCH_M = 200;
// Show the video frame under the marker at most this often while dragging.
const PREVIEW_MS = 250;

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
    const colour = active ? 'bg-orange-600 ring-4 ring-orange-300' : 'bg-pine-800';
    iconCache.set(
      key,
      L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${colour}">${number}</div>`,
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
function RiderLayer({ route, clock, follow, approximate, scrub }) {
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
    const travelled = L.polyline([], {
      color: ORANGE,
      weight: 6,
      opacity: 1,
      dashArray: approximate ? '10 8' : undefined,
      interactive: false,
    }).addTo(map);
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
      travelled.setLatLngs([...track.slice(0, hit.index + 1), hit.point]);
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
    let lastIndex = null;
    let lastLineAt = 0;
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
        const position = positionAt(track, trackTimes, videoStartsAt, t, hiddenRanges);
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
        // Redraw the bold part when a new route point is reached, and a few times a second in between.
        const index = indexAtOrBefore(trackTimes, t + videoStartsAt);
        if (index !== lastIndex || now - lastLineAt > 150) {
          travelled.setLatLngs(travelledAt(track, trackTimes, videoStartsAt, t));
          lastIndex = index;
          lastLineAt = now;
        }
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
      marker.remove();
    };
  }, [map, route, track, trackTimes, videoStartsAt, hiddenRanges, clock, approximate, canScrub]);
  return null;
}

// The AI's places while they're being reviewed: violet dots joined in order
// (unticked ones grey, suspicious ones red). Drawn in the browser, at no cost.
function AiPreview({ places }) {
  const located = places.filter((p) => p.lat !== null && p.lat !== undefined);
  const ticked = located.filter((p) => p.checked);
  return (
    <>
      {ticked.length > 1 && (
        <Polyline positions={ticked.map((p) => [p.lat, p.lng])} pathOptions={{ color: VIOLET, weight: 3, dashArray: '2 8', opacity: 0.9 }} />
      )}
      {located.map((p) => {
        const colour = !p.checked ? '#a8a29e' : p.flags?.includes('detour') ? '#dc2626' : VIOLET;
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
}) {
  const playable = trackTimes?.length > 0 && trackTimes.length === track.length;
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
          <Polyline
            positions={track}
            // Faded when the video can play along it (the covered part is drawn bold on top).
            // Dashed for routes drawn between key points: they're approximate.
            pathOptions={{ color: ORANGE, weight: 5, opacity: playable ? 0.35 : 0.85, dashArray: approximate ? '10 8' : undefined, interactive: false }}
          />
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
          <CircleMarker center={pendingLocation} radius={9} pathOptions={{ color: ORANGE, weight: 3, dashArray: '4 4', fillOpacity: 0.2 }} />
        )}
        <AiPreview places={preview} />
        {/* The spot under the pointer on the elevation chart. */}
        {ghost && (
          <CircleMarker center={ghost} radius={8} interactive={false} pathOptions={{ color: '#2563eb', weight: 3, fill: false, dashArray: '3 3' }} />
        )}
        {playable && clock && <RiderLayer route={route} clock={clock} follow={follow} approximate={approximate} scrub={scrub} />}
        <FitToTrail trailId={trailId} locations={locations} />
        <FitToPreview places={preview} />
        <PanTo focus={focus} />
        <MapEvents onMapClick={onMapClick} onUserMove={() => onFollowChange?.(false)} />
      </MapContainer>

      {hiddenNote && (
        <p className="absolute top-3 left-14 z-[1000] rounded-lg bg-surface/95 px-3 py-1.5 text-sm shadow-md">{hiddenNote}</p>
      )}
      {playable && !follow && (
        <button
          type="button"
          onClick={() => onFollowChange?.(true)}
          className="absolute right-3 bottom-6 z-[1000] rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold shadow-md hover:bg-stone-100"
        >
          Follow the video
        </button>
      )}
    </div>
  );
}
