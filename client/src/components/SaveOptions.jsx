import { useState } from 'react';
import { Link } from 'react-router';
import { downloadFile, fileNameFor, toGpx, toKml } from '../lib/exports.js';
import Icon from './art/Icon.jsx';

export default function SaveOptions({ trail, services = [] }) {
  const [withServices, setWithServices] = useState(false);
  return (
    <div className="space-y-3">
      {services.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" checked={withServices} onChange={(e) => setWithServices(e.target.checked)} />
          Include fuel stops and services in the GPX file
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            downloadFile(fileNameFor(trail.title, 'gpx'), toGpx(trail, { services: withServices ? services : [] }), 'application/gpx+xml')
          }
        >
          <Icon name="download" className="h-4 w-4 text-pine-600" />
          Download GPX
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            downloadFile(fileNameFor(trail.title, 'kml'), toKml(trail), 'application/vnd.google-earth.kml+xml')
          }
        >
          <Icon name="map" className="h-4 w-4 text-sky-600" />
          Download KML
        </button>
        <Link to={`/trails/${trail._id}/print`} target="_blank" className="btn-secondary">
          <Icon name="printer" className="h-4 w-4 text-orange-600" />
          Trip sheet (PDF)
        </Link>
      </div>
      <p className="text-xs text-stone-500">
        <strong>GPX</strong> opens in GPS apps like Garmin, OsmAnd or Komoot. <strong>KML</strong> goes into Google:
        open{' '}
        <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener noreferrer" className="underline">
          Google My Maps
        </a>
        , create a map and click Import. Each key point also has its own Google Maps link above.
      </p>
    </div>
  );
}
