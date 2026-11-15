import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { boundsOf, cumulativeDistances, locationAtDistance, nearestIndex } from '../lib/track.js';

// The route revealed like a film of the trip: the map flies in from high above
// so the shape of the whole trip shows first, then the road draws itself from
// the start, led by the rider's blue dot. Each place pops up, numbered and
// named, as the line reaches it, while a counter in the corner adds up the
// kilometres. Plays once after a route is made, and whenever someone presses
// "Play the route". With reduced motion it simply shows the whole route.
//
// play: a number; each new value plays it again (0: not yet). onDone: when it
// has finished or been skipped. The rest of the map steps aside meanwhile (the
// .route-revealing class, see index.css).

const FLY_IN_S = 1.2;
const HOLD_MS = 700; // the finished route, before the map comes back
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const formatKm = (metres) => (metres < 10000 ? (metres / 1000).toFixed(1) : Math.round(metres / 1000).toLocaleString('en-US'));

export default function RouteReveal({ play, track, points, inks, reducedMotion, onDone }) {
  const map = useMap();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // Read when it plays: a refreshed trail mustn't start it again.
  const latest = useRef({ track, points, inks });
  latest.current = { track, points, inks };

  useEffect(() => {
    const { track, points, inks } = latest.current;
    if (!play || track.length < 2) return undefined;
    const bounds = boundsOf(track);
    const container = map.getContainer();
    let frame = null;
    let timer = null;
    let finished = false;
    const layers = [];
    let panel = null;

    const cleanUp = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      map.off('moveend', startDrawing);
      layers.forEach((layer) => layer.remove());
      panel?.remove();
      container.classList.remove('route-revealing');
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanUp();
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      onDoneRef.current?.();
    };

    if (reducedMotion) {
      finish();
      return cleanUp;
    }
    container.classList.add('route-revealing');

    // The places in the order the route reaches them.
    const cum = cumulativeDistances(track);
    const total = cum.at(-1) || 1;
    const stops = points
      .map((point, i) => ({ point, number: i + 1, alongM: cum[nearestIndex(track, [point.lat, point.lng])] ?? 0 }))
      .sort((a, b) => a.alongM - b.alongM);
    // Longer trips draw for longer, within reason.
    const drawMs = Math.min(12000, Math.max(6000, 4000 + total / 200 + stops.length * 250));

    // The corner sheet: how far so far, how many places, and a way out.
    const Panel = L.Control.extend({
      onAdd() {
        const div = L.DomUtil.create('div', 'reveal-panel');
        div.innerHTML =
          '<span class="reveal-figure"><b data-km>0</b> km</span><span class="reveal-label" data-stops></span><button type="button" class="reveal-skip">Skip</button>';
        L.DomEvent.disableClickPropagation(div);
        div.querySelector('.reveal-skip').addEventListener('click', finish);
        return div;
      },
    });
    panel = new Panel({ position: 'bottomleft' }).addTo(map);
    const kmText = panel.getContainer().querySelector('[data-km]');
    const stopsText = panel.getContainer().querySelector('[data-stops]');

    const casing = L.polyline([], { color: inks.ink, weight: 8, opacity: 0.55, interactive: false }).addTo(map);
    const road = L.polyline([], { color: inks.road, weight: 5, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(map);
    const head = L.marker(track[0], {
      interactive: false,
      icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="reveal-head"></div>' }),
    }).addTo(map);
    layers.push(casing, road, head);

    let shown = 0;
    let lastLabelled = null;
    const showStopsUpTo = (alongM) => {
      while (shown < stops.length && stops[shown].alongM <= alongM) {
        const { point, number } = stops[shown];
        const pin = L.marker([point.lat, point.lng], {
          interactive: false,
          icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="map-point reveal-pop">${number}</div>` }),
        })
          .bindTooltip(escapeHtml(point.name), { permanent: true, direction: 'top', offset: [0, -14], className: 'reveal-name' })
          .addTo(map);
        // Only the newest place keeps its name up, so the map doesn't fill with labels.
        lastLabelled?.closeTooltip();
        lastLabelled = pin;
        layers.push(pin);
        shown += 1;
      }
      stopsText.textContent = stops.length ? `${shown} of ${stops.length} places` : '';
    };

    let startedAt = null;
    const step = (now) => {
      startedAt ??= now;
      const t = Math.min((now - startedAt) / drawMs, 1);
      const alongM = easeInOut(t) * total;
      let end = 0;
      while (end < cum.length - 1 && cum[end + 1] <= alongM) end += 1;
      const tip = locationAtDistance(track, cum, alongM);
      const drawn = [...track.slice(0, end + 1), tip];
      casing.setLatLngs(drawn);
      road.setLatLngs(drawn);
      head.setLatLng(tip);
      kmText.textContent = formatKm(alongM);
      showStopsUpTo(alongM);
      if (t < 1) frame = requestAnimationFrame(step);
      else timer = setTimeout(finish, HOLD_MS);
    };
    function startDrawing() {
      map.off('moveend', startDrawing);
      clearTimeout(timer);
      frame = requestAnimationFrame(step);
    }

    // The fly-in: from high above the middle of the trip, down to the whole route.
    const whole = map.getBoundsZoom(L.latLngBounds(bounds), false, L.point(60, 60));
    map.setView(L.latLngBounds(bounds).getCenter(), Math.max(whole - 3, 2), { animate: false });
    showStopsUpTo(-1);
    map.once('moveend', startDrawing);
    // If the map has nothing to fly (already there), start anyway.
    timer = setTimeout(startDrawing, FLY_IN_S * 1000 + 300);
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 14, duration: FLY_IN_S });

    return cleanUp;
  }, [map, play, reducedMotion]);

  return null;
}
