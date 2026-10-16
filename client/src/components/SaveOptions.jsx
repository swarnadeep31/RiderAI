import { useState } from 'react';
import { Link } from 'react-router';
import { downloadFile, fileNameFor, toGpx, toKml } from '../lib/exports.js';
import Icon from './art/Icon.jsx';

// A row on phones (icon beside the words), a tile on wider screens.
const tileClass =
  'flex h-full w-full items-center gap-3 rounded-2xl border border-stone-200 bg-surface p-3.5 text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:ring-4 focus-visible:ring-stone-300 focus-visible:outline-none sm:flex-col sm:items-start sm:gap-2 sm:p-4';

function Tile({ icon, iconClass, title, text }) {
  return (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-sm text-stone-500">{text}</span>
      </span>
    </>
  );
}

// Ways to take the trail along: a GPX file for GPS apps, a KML file for
// Google My Maps and Google Earth, and a trip sheet to print or save as PDF.
export default function SaveOptions({ trail, services = [] }) {
  const [withServices, setWithServices] = useState(false);
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-3">
        <li>
          <button
            type="button"
            className={tileClass}
            onClick={() =>
              downloadFile(fileNameFor(trail.title, 'gpx'), toGpx(trail, { services: withServices ? services : [] }), 'application/gpx+xml')
            }
          >
            <Tile icon="download" iconClass="bg-pine-100 text-pine-700 dark:bg-pine-900/70 dark:text-pine-300" title="GPX file" text="For Garmin, OsmAnd, Komoot and other GPS apps" />
          </button>
        </li>
        <li>
          <button
            type="button"
            className={tileClass}
            onClick={() => downloadFile(fileNameFor(trail.title, 'kml'), toKml(trail), 'application/vnd.google-earth.kml+xml')}
          >
            <Tile icon="map" iconClass="bg-sky-100 text-sky-700" title="KML file" text="For Google My Maps and Google Earth" />
          </button>
        </li>
        <li>
          <Link to={`/trails/${trail._id}/print`} target="_blank" className={tileClass}>
            <Tile icon="printer" iconClass="bg-orange-100 text-orange-700" title="Trip sheet" text="Print it, or save it as a PDF" />
          </Link>
        </li>
      </ul>
      {services.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={withServices} onChange={(e) => setWithServices(e.target.checked)} />
          Add the fuel stops and other services to the GPX file
        </label>
      )}
      <p className="text-xs text-stone-500">
        KML in Google: open{' '}
        <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener noreferrer" className="underline">
          Google My Maps
        </a>
        , create a map and click Import.
      </p>
    </div>
  );
}
