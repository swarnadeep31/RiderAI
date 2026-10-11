import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { boundsOf, indexAtOrBefore, positionAt, travelledAt } from '../lib/track.js';

const ORANGE = '#ea580c';
const VIOLET = '#7c3aed';

// Numbered pins matching the key point list. Cached so markers don't
// rebuild their icon on every render.
const iconCache = new Map();
function numberIcon(number, active) {
  const key = `${number}:${active}`;
  if (!iconCache.has(key)) {
    const colour = active ? 'bg-orange-600 ring-4 ring-orange-300' : 'bg-stone-800';
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
function RiderLayer({ track, trackTimes, videoStartsAt, hiddenRanges, clock, follow, approximate }) {
  const map = useMap();
  const followRef = useRef(follow);
  followRef.current = follow;

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
    const marker = L.circleMarker([0, 0], { pane: 'rider', radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
      .bindTooltip('Here now in the video', { direction: 'top', offset: [0, -8] });

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
      if (t !== lastTime || followRef.current !== lastFollow) {
        lastFollow = followRef.current;
        const position = positionAt(track, trackTimes, videoStartsAt, t, hiddenRanges);
        let panLater = false;
        if (position) {
          if (!map.hasLayer(marker)) marker.addTo(map);
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
      travelled.remove();
      marker.remove();
    };
  }, [map, track, trackTimes, videoStartsAt, hiddenRanges, clock, approximate]);
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
}) {
  const playable = trackTimes?.length > 0 && trackTimes.length === track.length;
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
            pathOptions={{ color: ORANGE, weight: 5, opacity: playable ? 0.35 : 0.85, dashArray: approximate ? '10 8' : undefined }}
          />
        )}
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
        {playable && clock && (
          <RiderLayer
            track={track}
            trackTimes={trackTimes}
            videoStartsAt={videoStartsAt}
            hiddenRanges={hiddenRanges}
            clock={clock}
            follow={follow}
            approximate={approximate}
          />
        )}
        <FitToTrail trailId={trailId} locations={locations} />
        <FitToPreview places={preview} />
        <PanTo focus={focus} />
        <MapEvents onMapClick={onMapClick} onUserMove={() => onFollowChange?.(false)} />
      </MapContainer>

      {hiddenNote && (
        <p className="absolute top-3 left-14 z-[1000] rounded-lg bg-white/95 px-3 py-1.5 text-sm shadow-md">{hiddenNote}</p>
      )}
      {playable && !follow && (
        <button
          type="button"
          onClick={() => onFollowChange?.(true)}
          className="absolute right-3 bottom-6 z-[1000] rounded-lg bg-white px-3 py-1.5 text-sm font-semibold shadow-md hover:bg-stone-100"
        >
          Follow the video
        </button>
      )}
    </div>
  );
}
