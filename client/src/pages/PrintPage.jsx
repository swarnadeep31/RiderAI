import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { ACTIVITIES } from '../lib/activities.js';
import { googleMapsUrl, youtubeUrlAt } from '../lib/exports.js';
import { formatTime } from '../lib/time.js';

// A plain page made for printing. The browser's print window can save it as a PDF.
export default function PrintPage() {
  const { id } = useParams();
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getTrail(id).then(setTrail, (err) => setError(err.message));
  }, [id]);

  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!trail) return <p className="p-8 text-stone-500">Loading...</p>;

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-stone-900">
      <div className="no-print mb-8 flex flex-wrap items-center gap-3 rounded-lg bg-stone-100 p-3 text-sm">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-orange-600 px-3 py-1.5 font-semibold text-white hover:bg-orange-700"
        >
          Save as PDF / Print
        </button>
        <span className="text-stone-600">In the print window, choose "Save as PDF" as the printer.</span>
        <Link to={`/trails/${trail._id}`} className="ml-auto underline">
          Back to the video
        </Link>
      </div>

      <h1 className="text-3xl font-bold">{trail.title}</h1>
      <p className="mt-1 text-stone-600">
        {ACTIVITIES[trail.activity]} · {trail.points.length} key points · Video:{' '}
        <a href={youtubeUrlAt(trail.youtubeId, 0)} className="underline">
          youtu.be/{trail.youtubeId}
        </a>
      </p>
      {trail.description && <p className="mt-4 whitespace-pre-line">{trail.description}</p>}

      {trail.points.length > 0 ? (
        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-stone-800">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Video</th>
              <th className="py-2 pr-3">Place</th>
              <th className="py-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {trail.points.map((point, i) => (
              <tr key={point._id} className="break-inside-avoid border-b border-stone-200 align-top">
                <td className="py-2 pr-3 font-bold">{i + 1}</td>
                <td className="py-2 pr-3 font-mono">
                  <a href={youtubeUrlAt(trail.youtubeId, point.time)} className="underline">
                    {formatTime(point.time)}
                  </a>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-semibold">{point.name}</div>
                  {point.note && <div className="text-stone-600">{point.note}</div>}
                </td>
                <td className="py-2 font-mono text-xs">
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  <br />
                  <a href={googleMapsUrl(point.lat, point.lng)} className="font-sans text-orange-700 underline">
                    Open in Google Maps
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-8 text-stone-500">No key points marked yet.</p>
      )}

      <p className="mt-10 text-xs text-stone-400">Made with TrailCast. Map data © OpenStreetMap contributors.</p>
    </main>
  );
}
