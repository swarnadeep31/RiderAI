import { expect, test } from 'vitest';
import { fuelGapChip, fuelGapSentence, kmAlong, kmLength, longGaps, offRoute, serviceName, SERVICE_KINDS } from './services.js';

const gap = { fromM: 110000, toM: 475000, lengthM: 365000, afterName: 'Tandi', beforeName: 'the end' };

test('the fuel gap, in a sentence and on a chip', () => {
  expect(fuelGapSentence(gap)).toBe('Longest stretch without a mapped fuel station: 365 km, after Tandi (km 110 → km 475).');
  expect(fuelGapChip(gap)).toBe('Longest without fuel: 365 km, after Tandi');
});

test('drawn routes say ≈ and round to 5 km', () => {
  expect(fuelGapSentence({ ...gap, lengthM: 363000, fromM: 112000 }, true)).toBe(
    'Longest stretch without a mapped fuel station: ≈ 365 km, after Tandi (≈ km 110 → ≈ km 475).',
  );
  expect(kmAlong(112400, true)).toBe('≈ km 110');
  expect(kmLength(1200, true)).toBe('≈ 5 km');
});

test('a gap from the start, and no stations at all', () => {
  expect(fuelGapChip({ ...gap, afterName: 'the start', beforeName: 'HP, Keylong' })).toBe('Longest without fuel: 365 km, from the start');
  const none = { ...gap, afterName: 'the start', beforeName: 'the end' };
  expect(fuelGapSentence(none)).toBe('No fuel stations mapped along the route.');
  expect(fuelGapChip(none)).toBe('No mapped fuel on the route');
  expect(fuelGapSentence(null)).toBeNull();
});

test('names and distances off the route', () => {
  expect(serviceName({ kind: 'fuel', brand: 'HP' })).toBe('HP');
  expect(serviceName({ kind: 'fuel' })).toBe('Fuel station');
  expect(serviceName({ kind: 'atm' })).toBe('ATM');
  expect(offRoute({ offM: 40 })).toBeNull();
  expect(offRoute({ offM: 240 })).toBe('0.2 km off route');
});

test('only stretches over the warning distance are warned about', () => {
  expect(longGaps([gap, { ...gap, lengthM: 90000 }], 150)).toEqual([gap]);
});

test('every kind has its own symbol, so colour is never the only clue', () => {
  const symbols = Object.values(SERVICE_KINDS).map((kind) => kind.symbol);
  expect(new Set(symbols).size).toBe(symbols.length);
});
