import { Link } from 'react-router';
import { downloadFile, fileNameFor, toGpx, toKml } from '../lib/exports.js';

const buttonClass = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100';

export default function SaveOptions({ trail }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => downloadFile(fileNameFor(trail.title, 'gpx'), toGpx(trail), 'application/gpx+xml')}
        >
          Download GPX
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => downloadFile(fileNameFor(trail.title, 'kml'), toKml(trail), 'application/vnd.google-earth.kml+xml')}
        >
          Download KML
        </button>
        <Link to={`/trails/${trail._id}/print`} target="_blank" className={buttonClass}>
          Trip sheet (PDF)
        </Link>
      </div>
      <p className="text-xs text-stone-500">
        <strong>GPX</strong> opens in GPS apps like Garmin, OsmAnd or Komoot. <strong>KML</strong> goes into Google: open{' '}
        <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener noreferrer" className="underline">
          Google My Maps
        </a>
        , create a map and click Import. Each key point also has its own Google Maps link above.
      </p>
    </div>
  );
}
