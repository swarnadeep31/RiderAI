import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagDetours, geocodeCandidates } from '../src/aiRoute/geocode.js';

const candidate = (name, extra = {}) => ({ name, region: '', altNames: [], checked: true, flags: [], lat: null, lng: null, ...extra });
const result = (name, lat, lng) => ({ name, description: `${name}, India`, lat, lng });

test('picks the match closest to where the trip just was', async () => {
  const searches = [];
  const search = async (query, options) => {
    searches.push([query, options.near ?? null]);
    if (query.startsWith('Howrah')) return [result('Howrah', 22.59, 88.31)];
    // Two villages called Rampur: one near the route, one far away.
    return [result('Rampur (far)', 28.8, 79.0), result('Rampur (near)', 22.9, 88.0)];
  };
  const candidates = [candidate('Howrah', { region: 'West Bengal' }), candidate('Rampur')];
  await geocodeCandidates(candidates, { search });

  assert.equal(candidates[1].label, 'Rampur (near), India');
  assert.deepEqual(candidates[1].alternatives.map((a) => a.name), ['Rampur (far)']);
  assert.deepEqual(searches[0], ['Howrah, West Bengal', null]);
  assert.deepEqual(searches[1], ['Rampur', [22.59, 88.31]]);
});

test('tries other spellings, and unticks places it cannot find', async () => {
  const search = async (query) => (query === 'Burdwan' ? [result('Bardhaman', 23.23, 87.86)] : []);
  const candidates = [candidate('Bardhaman', { altNames: ['Burdwan'] }), candidate('Atlantis')];
  await geocodeCandidates(candidates, { search });
  assert.equal(candidates[0].lat, 23.23);
  assert.equal(candidates[1].checked, false);
  assert.deepEqual(candidates[1].flags, ['not_found']);
});

test('flags a place that would send the route on a huge detour', () => {
  const at = (name, lat, lng) => candidate(name, { lat, lng });
  const candidates = [
    at('Kolkata', 22.57, 88.36),
    at('Durgapur (wrong one, in another state)', 26.0, 80.0),
    at('Asansol', 23.68, 86.98),
  ];
  flagDetours(candidates);
  assert.deepEqual(candidates[1].flags, ['detour']);
  assert.equal(candidates[1].checked, false);
  assert.deepEqual(candidates[0].flags, []);
});

test("inside the trip's area first, and starting from its start; found only outside it, the place is unticked", async () => {
  const area = { south: 21, west: 82.7, north: 26.4, east: 89.9 };
  const searches = [];
  const search = async (query, options) => {
    searches.push([query, options.near ?? null, options.within ?? null]);
    // A toll plaza that is only found far away (near Islamabad) without the box.
    if (query === 'Banskopa Toll Plaza') return options.within ? [] : [result('Toll Plaza', 33.515, 73.179)];
    return [result(query, 23.5, 87.3)];
  };
  const candidates = [
    { ...candidate('Kolkata'), anchor: 'start', lat: 22.57, lng: 88.36 },
    candidate('Durgapur'),
    candidate('Banskopa Toll Plaza'),
  ];
  await geocodeCandidates(candidates, { search, start: { lat: 22.57, lng: 88.36 }, area });

  // The start is on the map already; the first search is near it, inside the box.
  assert.deepEqual(searches[0], ['Durgapur', [22.57, 88.36], area]);
  assert.equal(candidates[1].checked, true);
  assert.deepEqual(searches.slice(1).map(([query, , within]) => [query, within]), [
    ['Banskopa Toll Plaza', area],
    ['Banskopa Toll Plaza', null],
  ]);
  assert.equal(candidates[2].lat, 33.515);
  assert.deepEqual(candidates[2].flags, ['outside_area']);
  assert.equal(candidates[2].checked, false);
});

test('a whole state or country is not a spot on the route', async () => {
  const search = async (query) =>
    query === 'Geetanjali Dhaba'
      ? [{ ...result('West Bengal', 24, 88) }]
      : [{ ...result('Bihar', 25.6, 85.1), coarse: true }, result('Bihar Sharif', 25.2, 85.52)];
  const candidates = [candidate('Geetanjali Dhaba'), candidate('Bihar')];
  await geocodeCandidates(candidates, { search });
  // Exactly on whole degrees: the search had nothing better than a region's middle.
  assert.deepEqual([candidates[0].lat, candidates[0].checked, candidates[0].flags], [24, false, ['region_only']]);
  // A real place is preferred to the region.
  assert.deepEqual([candidates[1].label, candidates[1].checked], ['Bihar Sharif, India', true]);
});

test("the trip's start and end are never flagged as detours", () => {
  const at = (name, lat, lng, extra) => candidate(name, { lat, lng, ...extra });
  const candidates = [at('Howrah', 22.59, 88.31), at('Kolkata', 26.0, 80.0, { anchor: 'start' }), at('Asansol', 23.68, 86.98)];
  flagDetours(candidates);
  assert.deepEqual(candidates[1].flags, []);
});
