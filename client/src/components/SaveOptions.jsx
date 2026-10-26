import { useState } from 'react';
import { Link } from 'react-router';
import { downloadFile, fileNameFor, toGpx, toKml } from '../lib/exports.js';
import Icon from './art/Icon.jsx';

// One way to take the ride along: what you get, and what it's for.
function Way({ format, title, text }) {
  return (
    <>
      <span className="flex h-11 w-12 shrink-0 items-center justify-center rounded-[2px] bg-ink font-display text-lg font-semibold text-paper">{format}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-small text-ink-soft">{text}</span>
      </span>
      <Icon name="download" className="ml-auto h-5 w-5 shrink-0 text-ink-soft transition-colors group-hover:text-road" />
    </>
  );
}

const rowClass = 'group flex w-full items-center gap-4 py-3 text-left transition-colors hover:bg-surface';

// Ways to take the trail along: a GPX file for GPS apps, a KML file for
// Google My Maps and Google Earth, and a trip sheet to print or save as PDF.
export default function SaveOptions({ trail, services = [] }) {
  const [withServices, setWithServices] = useState(false);
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-ink/12">
        <li>
          <button
            type="button"
            className={rowClass}
            onClick={() => downloadFile(fileNameFor(trail.title, 'gpx'), toGpx(trail, { services: withServices ? services : [] }), 'application/gpx+xml')}
          >
            <Way format="GPX" title="GPS file" text="For Garmin, OsmAnd, Komoot and other GPS apps" />
          </button>
        </li>
        <li>
          <button type="button" className={rowClass} onClick={() => downloadFile(fileNameFor(trail.title, 'kml'), toKml(trail), 'application/vnd.google-earth.kml+xml')}>
            <Way format="KML" title="Map file" text="For Google My Maps and Google Earth" />
          </button>
        </li>
        <li>
          <Link to={`/trails/${trail._id}/print`} target="_blank" className={rowClass}>
            <Way format="PDF" title="Trip sheet" text="Print it, or save it as a PDF" />
          </Link>
        </li>
      </ul>
      {services.length > 0 && (
        <label className="flex items-center gap-2 text-ink-soft">
          <input type="checkbox" checked={withServices} onChange={(e) => setWithServices(e.target.checked)} className="h-4 w-4" />
          Put the fuel stops and other services in the GPS file too
        </label>
      )}
      <p className="text-small text-ink-soft">
        KML in Google: open{' '}
        <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener noreferrer" className="link">
          Google My Maps
        </a>
        , create a map and click Import.
      </p>
    </div>
  );
}
