import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';

function TrailCard({ trail }) {
  return (
    <li>
      <Link
        to={`/trails/${trail._id}`}
        className="group block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm hover:shadow-md"
      >
        <img
          src={`https://i.ytimg.com/vi/${trail.youtubeId}/hqdefault.jpg`}
          alt=""
          className="aspect-video w-full bg-stone-200 object-cover"
          loading="lazy"
        />
        <div className="p-3">
          <h2 className="font-semibold group-hover:text-orange-700">{trail.title}</h2>
          <p className="mt-1 text-sm text-stone-500">
            {ACTIVITIES[trail.activity]} · {trail.points.length} key {trail.points.length === 1 ? 'point' : 'points'}
            {trail.owner && ` · by @${trail.owner.username}`}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default function HomePage() {
  const [trails, setTrails] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listTrails().then(setTrails, (err) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Adventure videos with the map beside them</h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Watch rides, treks and climbs while the map follows along. Save the places they visit to Google Maps, your GPS
          or a printable trip sheet.
        </p>
      </section>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {!trails && !error && <p className="text-stone-500">Loading trails...</p>}
      {trails?.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center">
          <p className="text-stone-600">No trails yet.</p>
          <Link to="/new" className="mt-3 inline-block font-semibold text-orange-700 underline">
            Add the first one
          </Link>
        </div>
      )}
      {trails?.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trails.map((trail) => (
            <TrailCard key={trail._id} trail={trail} />
          ))}
        </ul>
      )}
    </main>
  );
}
