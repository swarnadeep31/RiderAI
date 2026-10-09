import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { boundsOf } from '../lib/track.js';

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

// Pans to a key point when one is picked from the list.
function PanTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus.location, Math.max(map.getZoom(), 13));
  }, [map, focus]);
  return null;
}

// Keeps the rider's dot on screen while following.
function FollowRider({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && position && !map.getBounds().pad(-0.15).contains(position)) map.panTo(position);
  }, [map, position, follow]);
  return null;
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
  points,
  position,
  activePointId,
  pendingLocation,
  focus,
  follow,
  onFollowChange,
  onPointClick,
  onMapClick,
}) {
  const locations = [...track, ...points.map((p) => [p.lat, p.lng])];

  return (
    <div className={`relative h-full w-full ${onMapClick ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
      <MapContainer center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {track.length > 1 && <Polyline positions={track} pathOptions={{ color: '#ea580c', weight: 4, opacity: 0.85 }} />}
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
          <CircleMarker
            center={pendingLocation}
            radius={9}
            pathOptions={{ color: '#ea580c', weight: 3, dashArray: '4 4', fillOpacity: 0.2 }}
          />
        )}
        {/* Its own layer, so the rider's dot is drawn above the key point pins (600) and below tooltips (650). */}
        <Pane name="rider" style={{ zIndex: 640 }}>
          {position && (
            <CircleMarker
              center={position}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                Here now in the video
              </Tooltip>
            </CircleMarker>
          )}
        </Pane>
        <FitToTrail trailId={trailId} locations={locations} />
        <PanTo focus={focus} />
        <FollowRider position={position} follow={follow} />
        <MapEvents onMapClick={onMapClick} onUserMove={() => onFollowChange?.(false)} />
      </MapContainer>

      {position && !follow && (
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
