import { useState } from 'react';
import { api } from '../api.js';
import ErrorMessage from './ErrorMessage.jsx';

// "Rohtang Pass" -> a list of matching places to pick from. Searches only when
// asked (button or Enter), as the free OpenStreetMap search service requires.
// initialQuery: a name to start from (e.g. read from the video's title).
export default function PlaceSearch({ onPick, initialQuery = '', label = 'Search for a place', placeholder = 'Search for a place, e.g. Rohtang Pass' }) {
  const [query, setQuery] = useState(initialQuery);
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
          placeholder={placeholder}
          aria-label={label}
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching || query.trim().length < 2}
          className="btn-secondary btn-small"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {results?.length === 0 && (
        <p className="text-small text-ink-soft">No places found. Try another spelling, or click the map instead.</p>
      )}
      {results?.length > 0 && (
        <ul className="divide-y divide-ink/10 overflow-hidden rounded-[3px] bg-paper ring-1 ring-ink/15">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng}`}>
              <button type="button" onClick={() => pick(place)} className="block w-full px-2 py-1.5 text-left hover:bg-surface">
                <span className="font-medium">{place.name}</span>
                <span className="block truncate text-small text-ink-soft">{place.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
