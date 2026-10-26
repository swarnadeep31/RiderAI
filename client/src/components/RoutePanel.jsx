import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ErrorMessage from './ErrorMessage.jsx';

const STYLES = {
  roads: 'Follow roads (rides, drives, cycling)',
  paths: 'Follow footpaths and trails (treks, hikes)',
  straight: 'Straight lines',
};

// For videos without a GPX file: draws the route between the key points.
export default function RoutePanel({ trail, onDrawn }) {
  const drawn = trail.routeSource === 'keypoints' && trail.track.length > 1;
  const [style, setStyle] = useState(
    trail.routeSource === 'keypoints' ? trail.routeStyle : ['hike', 'climb'].includes(trail.activity) ? 'paths' : 'roads',
  );
  const [roadRouting, setRoadRouting] = useState(true);
  const [error, setError] = useState(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    api.getConfig().then((config) => setRoadRouting(config.roadRouting), () => {});
  }, []);

  async function draw() {
    setDrawing(true);
    setError(null);
    try {
      onDrawn(await api.drawRoute(trail._id, style));
    } catch (err) {
      setError(err.message);
    }
    setDrawing(false);
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display text-[1.3rem] leading-tight font-semibold">No GPS file? Draw the route through your places</h3>
      {trail.points.length < 2 ? (
        <p className="text-ink-soft">
          Add a place each time the video reaches a new one (where it starts, the next town, the pass...).
          With two or more, TrailCast can join them into a route.
        </p>
      ) : (
        <>
          <p className="text-ink-soft">
            TrailCast joins your places in video order, and the blue dot moves between them as the video plays.
          </p>
          <fieldset className="space-y-1">
            <legend className="sr-only">How should the route travel?</legend>
            {Object.entries(STYLES).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="route-style" value={value} checked={style === value} onChange={() => setStyle(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          {!roadRouting && style !== 'straight' && (
            <p className="text-contour">
              This server has no OpenRouteService key yet (ORS_API_KEY), so you'll get straight lines for now.
            </p>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button
            type="button"
            onClick={draw}
            disabled={drawing}
            className="btn-secondary"
          >
            {drawing ? 'Drawing...' : drawn ? 'Redraw route' : 'Draw route'}
          </button>
          {drawn && <p className="text-ink-soft">The route updates by itself when you add, move or remove places.</p>}
        </>
      )}
    </div>
  );
}
