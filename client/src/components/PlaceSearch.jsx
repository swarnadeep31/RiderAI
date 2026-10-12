import { useState } from 'react';
import { api } from '../api.js';
import ErrorMessage from './ErrorMessage.jsx';

// "Rohtang Pass" -> a list of matching places to pick from. Searches only when
// asked (button or Enter), as the free OpenStreetMap search service requires.
export default function PlaceSearch({ onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await api.searchPlaces(query.trim()));
    } catch (err) {
      setError(err.message);
      setResults(null);
    }
    setSearching(false);
  }

  function pick(place) {
    onPick(place);
    setResults(null);
    setQuery('');
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter searches, instead of saving the whole form.
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search for a place, e.g. Rohtang Pass"
          aria-label="Search for a place"
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching || query.trim().length < 2}
          className="btn-secondary py-1.5"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {results?.length === 0 && (
        <p className="text-sm text-stone-600">No places found. Try another spelling, or click the map instead.</p>
      )}
      {results?.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng}`}>
              <button type="button" onClick={() => pick(place)} className="block w-full px-2 py-1.5 text-left hover:bg-orange-50">
                <span className="font-medium">{place.name}</span>
                <span className="block truncate text-xs text-stone-500">{place.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
