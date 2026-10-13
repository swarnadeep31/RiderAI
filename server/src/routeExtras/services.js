// Services along the route: fuel stations, mechanics, medical help and ATMs
// from OpenStreetMap, found with Overpass in the route-enrich job, plus the
// stretches without fuel. Plain functions; the job (enrich.js) runs them.
import { cumulativeDistances, distanceMeters, projectOnTrack, simplify } from '../utils/geo.js';

// What to look for, and how far from the route it can be.
export const KINDS = {
  fuel: { radiusM: 2000 },
  mechanic: { radiusM: 1000 },
  medical: { radiusM: 5000 },
  atm: { radiusM: 1000 },
};
export const MAX_PER_KIND = 300;
const MAX_CHUNK_VERTICES = 300;
// Fuel gap ends are named after the nearest key point this close.
const GAP_NAME_WITHIN_M = 20000;

// The points to send to Overpass, split into pieces of at most `chunkKm`
// and 300 points, each piece starting where the last one ended. The route is
// simplified first (100 m at first, more for very winding routes), so a
// version of a route costs about one query per `chunkKm`.
export function chunkRoute(track, { chunkKm = 200 } = {}) {
  if (track.length < 2) return [];
  const cum = cumulativeDistances(track);
  const chunkM = chunkKm * 1000;
  const target = Math.ceil(cum.at(-1) / chunkM) * MAX_CHUNK_VERTICES;
  let tolerance = 100;
  let kept = simplify(track, tolerance);
  while (kept.length > target && tolerance < 1600) {
    tolerance *= 2;
    kept = simplify(track, tolerance);
  }

  const chunks = [];
  let chunk = [kept[0]];
  for (const index of kept.slice(1)) {
    const tooLong = cum[index] - cum[chunk[0]] > chunkM && chunk.length > 1;
    if (tooLong || chunk.length >= MAX_CHUNK_VERTICES) {
      chunks.push(chunk);
      chunk = [chunk.at(-1)];
    }
    chunk.push(index);
  }
  if (chunk.length > 1) chunks.push(chunk);
  return chunks.map((indexes) => indexes.map((i) => track[i]));
}

// One Overpass query for a piece of the route.
export function buildQuery(locations) {
  const line = locations.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',');
  return [
    '[out:json][timeout:90][maxsize:67108864];',
    '(',
    `  nwr["amenity"="fuel"](around:${KINDS.fuel.radiusM},${line});`,
    `  nwr["shop"~"^(car_repair|motorcycle_repair|tyres)$"](around:${KINDS.mechanic.radiusM},${line});`,
    `  nwr["amenity"~"^(hospital|clinic)$"](around:${KINDS.medical.radiusM},${line});`,
    `  nwr["amenity"="atm"](around:${KINDS.atm.radiusM},${line});`,
    `  nwr["amenity"="bank"]["atm"="yes"](around:${KINDS.atm.radiusM},${line});`,
    ');',
    'out center tags;',
  ].join('\n');
}

function kindOf(tags) {
  if (tags.amenity === 'fuel') return 'fuel';
  if (['car_repair', 'motorcycle_repair', 'tyres'].includes(tags.shop)) return 'mechanic';
  if (['hospital', 'clinic'].includes(tags.amenity)) return 'medical';
  if (tags.amenity === 'atm' || (tags.amenity === 'bank' && tags.atm === 'yes')) return 'atm';
  return null;
}

const text = (value, max = 100) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

// Overpass elements -> places: { kind, osm, name, brand, lat, lng, hours, emergency, place }.
// Ways and areas (a big hospital) use their centre point.
export function readElements(elements) {
  const items = [];
  for (const element of elements ?? []) {
    const tags = element.tags ?? {};
    const kind = kindOf(tags);
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!kind || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    items.push({
      kind,
      osm: `${element.type?.[0] ?? 'n'}${element.id}`,
      name: text(tags.name ?? tags['name:en']),
      brand: text(tags.brand ?? tags.operator),
      lat,
      lng,
      hours: text(tags.opening_hours, 200),
      emergency: kind === 'medical' ? tags.emergency === 'yes' : undefined,
      place: text(tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? tags['addr:place']),
    });
  }
  return items;
}

// Places from all the pieces, each once, placed along the route (metres from
// the start, and off it), keeping only those close enough to matter.
export function placeItems(items, track) {
  const cum = cumulativeDistances(track);
  const seen = new Set();
  const placed = [];
  for (const item of items) {
    if (seen.has(item.osm)) continue;
    seen.add(item.osm);
    const { alongM, offM } = projectOnTrack(track, cum, [item.lat, item.lng]);
    if (offM > KINDS[item.kind].radiusM) continue;
    placed.push({ ...item, alongM: Math.round(alongM), offM: Math.round(offM) });
  }
  return placed.sort((a, b) => a.alongM - b.alongM);
}

// At most MAX_PER_KIND of each kind (towns can have hundreds of ATMs): if
// there are more, the closest one per kilometre of route, then the closest.
export function capItems(items, max = MAX_PER_KIND) {
  const capped = [];
  for (const kind of Object.keys(KINDS)) {
    let ofKind = items.filter((item) => item.kind === kind);
    if (ofKind.length > max) {
      const perKm = new Map();
      for (const item of ofKind) {
        const km = Math.floor(item.alongM / 1000);
        if (!perKm.has(km) || item.offM < perKm.get(km).offM) perKm.set(km, item);
      }
      ofKind = [...perKm.values()];
      if (ofKind.length > max) ofKind = [...ofKind].sort((a, b) => a.offM - b.offM).slice(0, max);
    }
    capped.push(...ofKind);
  }
  return capped.sort((a, b) => a.alongM - b.alongM);
}

// "HP, Tandi": a station's name or brand, and the nearest key point within 20 km.
function stationName(station, points) {
  let nearest = null;
  for (const p of points ?? []) {
    const distance = distanceMeters([station.lat, station.lng], [p.lat, p.lng]);
    if (distance <= GAP_NAME_WITHIN_M && (!nearest || distance < nearest.distance)) nearest = { name: p.name, distance };
  }
  const label = station.brand ?? station.name;
  return [label, nearest?.name].filter(Boolean).join(', ') || station.place || 'a fuel station';
}

// The stretches between fuel stations (and the start and end), longest first.
// Each end is named: a station, "the start" or "the end".
export function fuelGaps(items, routeLengthM, points) {
  const stations = items.filter((item) => item.kind === 'fuel').sort((a, b) => a.alongM - b.alongM);
  const marks = [
    { atM: 0, name: 'the start' },
    ...stations.map((s) => ({ atM: s.alongM, name: stationName(s, points) })),
    { atM: Math.round(routeLengthM), name: 'the end' },
  ];
  const gaps = marks.slice(1).map((to, i) => ({
    fromM: marks[i].atM,
    toM: to.atM,
    lengthM: to.atM - marks[i].atM,
    afterName: marks[i].name,
    beforeName: to.name,
  }));
  return gaps.filter((gap) => gap.lengthM > 0).sort((a, b) => b.lengthM - a.lengthM);
}
