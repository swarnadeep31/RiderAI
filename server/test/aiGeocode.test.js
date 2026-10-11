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
