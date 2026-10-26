import { describe, expect, test } from 'vitest';
import { routesInTitle } from './titleRoute.js';

describe('routesInTitle', () => {
  test.each([
    ['Kolkata to Ladakh | EP1 Kolkata to Dehri', [['Kolkata', 'Ladakh'], ['Kolkata', 'Dehri']]],
    [
      'Kolkata to Ladakh Bike Trip | Leh Ladakh Bike Trip | Kolkata to Dehri EP1 | Ladakh Bike Ride Begins',
      [['Kolkata', 'Ladakh'], ['Kolkata', 'Dehri']],
    ],
    ['KOLKATA TO LADAKH ON BIKE 🏍️', [['Kolkata', 'Ladakh']]],
    ['Day 3: Delhi to Manali via Chandigarh', [['Delhi', 'Manali']]],
    ['Manali – Leh Highway | Part 2', [['Manali', 'Leh']]],
    ['My first solo ride from New Delhi to Spiti Valley', [['New Delhi', 'Spiti Valley']]],
    ['Bangalore - Ooty - Mysore loop', [['Bangalore', 'Mysore']]],
    ['Delhi se Leh tak bike trip', [['Delhi', 'Leh']]],
    ['Kolkata to Ladakh - EP1', [['Kolkata', 'Ladakh']]],
    ['Mumbai → Goa coastal road trip', [['Mumbai', 'Goa']]],
    ['kolkata to ladakh | Kolkata to Ladakh full video', [['Kolkata', 'Ladakh']]],
  ])('%s', (title, expected) => {
    expect(routesInTitle(title).map((r) => [r.from, r.to])).toEqual(expected);
  });

  test('nothing for a title without a way from one place to another', () => {
    expect(routesInTitle('Rain ride vlog')).toEqual([]);
    expect(routesInTitle('')).toEqual([]);
    expect(routesInTitle(undefined)).toEqual([]);
    expect(routesInTitle('Ladakh to')).toEqual([]);
  });
});
