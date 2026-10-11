import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatTime, parseTime } from '../lib/time.js';
import ErrorMessage from './ErrorMessage.jsx';
import PlaceSearch from './PlaceSearch.jsx';

const POLL_MS = 3000;

const STAGES = {
  check: 'Checking the video is public',
  extract: 'Watching the video',
  clean: 'Tidying up the places found',
  geocode: 'Finding the places on the map',
  review: 'Almost done',
};

const EVIDENCE = { sign: 'Sign board', milestone: 'Milestone', speech: 'Said in the video', landmark: 'Landmark seen' };

export const HIDDEN_REASONS = {
  intro: 'Intro',
  recap: 'Recap',
  montage: 'Montage',
  flashback: 'Flashback',
  off_route: 'Off the route',
};

const FLAGS = {
  not_found: "Couldn't find this on the map. Pick it with Change, or leave it unticked.",
  detour: 'This would send the route far off its way. Probably a different place with the same name.',
  low_confidence: 'The AI is not sure about this one.',
};

function confidenceColour(confidence) {
  if (confidence >= 0.75) return 'bg-green-500';
  if (confidence >= 0.5) return 'bg-amber-400';
  return 'bg-red-400';
}

const isRunning = (job) => job && ['queued', 'running'].includes(job.state);
const usd = (amount) => `$${amount.toFixed(amount < 0.1 ? 3 : 2)}`;

// One place the AI found, as the owner reviews it.
function CandidateRow({ place, onChange, onSeek }) {
  const [changing, setChanging] = useState(false);
  const located = place.lat !== null && place.lat !== undefined;

  function moveTo(spot) {
    onChange({ lat: spot.lat, lng: spot.lng, label: spot.label ?? spot.description ?? spot.name, checked: true, flags: [] });
    setChanging(false);
  }

  return (
    <li className={`space-y-1 p-2 ${place.checked ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={place.checked}
          disabled={!located}
          onChange={(e) => onChange({ checked: e.target.checked })}
          aria-label={`Use ${place.name}`}
          className="mt-1"
        />
        <button type="button" onClick={() => onSeek(place.time)} className="font-mono text-xs text-orange-700 hover:underline" title="Jump to this moment">
          {formatTime(place.time)}
          {place.stayUntil ? `–${formatTime(place.stayUntil)}` : ''}
        </button>
        <div className="min-w-0 flex-1">
          <p>
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${confidenceColour(place.confidence)}`}
              title={`AI confidence ${Math.round(place.confidence * 100)}%`}
            />
            <span className="font-semibold">{place.name}</span>
            {place.presence === 'mentioned' && <span className="ml-1 text-xs text-stone-500">(only mentioned)</span>}
          </p>
          {located ? (
            <p className="truncate text-xs text-stone-500">{place.label}</p>
          ) : (
            <p className="text-xs text-stone-500">Not on the map yet</p>
          )}
          <p className="text-xs text-stone-600">
            {EVIDENCE[place.evidence]}
            {place.quote && <span className="italic"> · “{place.quote}”</span>}
          </p>
          {place.flags
            ?.filter((flag) => FLAGS[flag])
            .map((flag) => (
              <p key={flag} className={`text-xs ${flag === 'low_confidence' ? 'text-stone-600' : 'text-red-700'}`}>
                {FLAGS[flag]}
              </p>
            ))}
        </div>
        <button type="button" onClick={() => setChanging(!changing)} className="shrink-0 text-xs font-medium text-orange-700 hover:underline">
          {changing ? 'Close' : 'Change'}
        </button>
      </div>
      {changing && (
        <div className="space-y-2 pl-6">
          {place.alternatives?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-600">Other places with this name:</p>
              <ul className="text-xs">
                {place.alternatives.map((alt) => (
                  <li key={`${alt.lat},${alt.lng}`}>
                    <button type="button" onClick={() => moveTo(alt)} className="text-left hover:underline">
                      {alt.label || alt.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PlaceSearch onPick={moveTo} />
        </div>
      )}
    </li>
  );
}

// A part of the video the map should skip (intro, recap...), editable.
function HiddenRangeRow({ range, onChange, onRemove }) {
  const [start, setStart] = useState(formatTime(range.start));
  const [end, setEnd] = useState(formatTime(range.end));

  function commit() {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s !== null && e !== null && e > s) onChange({ start: s, end: e });
    else {
      setStart(formatTime(range.start));
      setEnd(formatTime(range.end));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <select
        value={range.reason}
        onChange={(e) => onChange({ reason: e.target.value })}
        aria-label="Why this part is skipped"
        className="rounded-md border border-stone-300 bg-white px-1 py-0.5"
      >
        {Object.entries(HIDDEN_REASONS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input value={start} onChange={(e) => setStart(e.target.value)} onBlur={commit} aria-label="Skip from" className="w-20 rounded-md border border-stone-300 px-1 py-0.5 font-mono" />
      to
      <input value={end} onChange={(e) => setEnd(e.target.value)} onBlur={commit} aria-label="Skip until" className="w-20 rounded-md border border-stone-300 px-1 py-0.5 font-mono" />
      <button type="button" onClick={onRemove} aria-label="Stop skipping this part" className="px-1 text-stone-400 hover:text-red-600">
        ✕
      </button>
    </li>
  );
}

// For videos without a GPX file: Gemini watches the video and lists the places
// it passes; the owner checks them, and the route is drawn between them.
export default function AiRoutePanel({ trail, getDuration, onSeek, onPreview, onAccepted }) {
  const [available, setAvailable] = useState(null);
  const [job, setJob] = useState(null);
  const [places, setPlaces] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [reviewing, setReviewing] = useState(false);
  const [highDetail, setHighDetail] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  useEffect(() => {
    api.getConfig().then((config) => setAvailable(config.aiRoute), () => setAvailable(false));
    api.latestAiRoute(trail._id).then(setJob, () => {});
  }, [trail._id]);

  // Ask how the analysis is going every few seconds while it runs.
  const running = isRunning(job);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      api.getJob(job._id).then(setJob, (err) => setError(err.message));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, job?._id]);

  // A finished analysis opens for review (an accepted one only when asked).
  // Loaded once per analysis, so the owner's edits aren't thrown away.
  const loadedJobId = useRef(null);
  useEffect(() => {
    if (!job?.result || loadedJobId.current === job._id) return;
    loadedJobId.current = job._id;
    setPlaces(job.result.candidates.map((c) => ({ ...c })));
    setHidden((job.result.hiddenRanges ?? []).map((r) => ({ ...r })));
    setReviewing(job.state === 'needs_review');
  }, [job]);

  // Show the places on the map while reviewing.
  useEffect(() => {
    onPreviewRef.current?.(reviewing ? places : []);
  }, [reviewing, places]);
  useEffect(() => () => onPreviewRef.current?.([]), []);

  async function start(fresh = false) {
    const durationSec = Math.round(getDuration());
    if (!durationSec) {
      setError('Wait for the video to load, then try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(await api.startAiRoute(trail._id, { durationSec, highDetail, fresh }));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function cancel() {
    try {
      setJob(await api.cancelJob(job._id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.acceptAiRoute(trail._id, {
        jobId: job._id,
        places: places.filter((p) => p.checked),
        hiddenRanges: hidden,
      });
      setJob({ ...job, state: 'accepted' });
      setReviewing(false);
      onAccepted(updated);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const updatePlace = (id, changes) => setPlaces((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const updateHidden = (i, changes) => setHidden((list) => list.map((r, j) => (j === i ? { ...r, ...changes } : r)));
  const tickedCount = places.filter((p) => p.checked).length;

  if (available === null) return null;

  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">Let AI find the places in the video</h3>
      {!available && (
        <p className="text-stone-600">
          This server has no Gemini key yet (GEMINI_API_KEY in server/.env), so the AI route builder is off.
        </p>
      )}

      {available && !running && !reviewing && (
        <>
          <p className="text-stone-600">
            Google's Gemini watches the video and lists the towns and landmarks it passes, with the moment each one
            appears. You check the list, then TrailCast draws the route through them. Works with public videos only.
          </p>
          {job?.state === 'failed' && <ErrorMessage>{job.error || 'The analysis failed.'}</ErrorMessage>}
          {job?.state === 'cancelled' && <p className="text-stone-600">The last analysis was cancelled.</p>}
          {job?.state === 'needs_review' && (
            <p className="text-stone-600">
              The AI's places are waiting for your check.{' '}
              <button type="button" onClick={() => setReviewing(true)} className="font-medium text-orange-700 underline">
                Check them now
              </button>
            </p>
          )}
          {job?.state === 'accepted' && (
            <p className="text-stone-600">
              The AI's places are on the map as key points.{' '}
              <button type="button" onClick={() => setReviewing(true)} className="font-medium text-orange-700 underline">
                Review them again
              </button>
            </p>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={highDetail} onChange={(e) => setHighDetail(e.target.checked)} />
            Read sign boards and milestones closely (about 3× the cost)
          </label>
          <button
            type="button"
            onClick={() => start(job?.state === 'accepted')}
            disabled={busy}
            className={
              job?.state === 'accepted'
                ? 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium hover:bg-stone-100 disabled:opacity-50'
                : 'rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 disabled:opacity-50'
            }
          >
            {busy ? 'Starting...' : job?.state === 'accepted' ? 'Analyse the video again' : 'Build the route with AI'}
          </button>
        </>
      )}

      {running && (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="font-medium">
            {job.state === 'queued' ? 'Waiting to start...' : `${STAGES[job.stage]}...`}
            {job.state === 'running' && job.progress?.total > 1 && (
              <span className="ml-1 text-stone-500">
                ({job.progress.done} of {job.progress.total})
              </span>
            )}
          </p>
          <p className="text-stone-600">This takes a minute or two for a short video. You can leave this page and come back.</p>
          <button type="button" onClick={cancel} className="text-red-700 hover:underline">
            Cancel
          </button>
        </div>
      )}

      {reviewing && (
        <div className="space-y-3 rounded-lg bg-white p-3">
          <div>
            <p className="font-medium">
              Check the places the AI found{job.videoTitle && <> in “{job.videoTitle}”</>}
            </p>
            <p className="text-stone-600">
              Ticked places become key points and the route goes through them in order (violet on the map). Untick
              anything wrong, and use Change if a place landed in the wrong spot.
              {job.reused
                ? ' This video was analysed before, so this cost nothing.'
                : job.costUsd > 0 && ` This analysis cost about ${usd(job.costUsd)}.`}
            </p>
          </div>

          {places.length === 0 ? (
            <p className="text-stone-600">The AI found no places in this video. Add key points by hand instead.</p>
          ) : (
            <ol className="max-h-[28rem] divide-y divide-stone-200 overflow-y-auto rounded-md border border-stone-200">
              {places.map((place) => (
                <CandidateRow key={place.id} place={place} onChange={(changes) => updatePlace(place.id, changes)} onSeek={onSeek} />
              ))}
            </ol>
          )}

          <div className="space-y-1">
            <p className="font-medium">Parts of the video the map skips</p>
            {hidden.length === 0 ? (
              <p className="text-stone-600">None. The map follows the whole video.</p>
            ) : (
              <ul className="space-y-1">
                {hidden.map((range, i) => (
                  <HiddenRangeRow
                    key={`${i}:${range.start}:${range.end}`}
                    range={range}
                    onChange={(changes) => updateHidden(i, changes)}
                    onRemove={() => setHidden((list) => list.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={accept}
              disabled={busy || tickedCount < 2}
              className="rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {busy ? 'Drawing the route...' : `Use ${tickedCount} places and draw the route`}
            </button>
            <button type="button" onClick={() => setReviewing(false)} className="text-stone-600 hover:underline">
              Not now
            </button>
          </div>
          {tickedCount < 2 && <p className="text-stone-600">Tick at least two places to draw a route.</p>}
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
