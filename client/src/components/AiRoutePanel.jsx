import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatTime, parseTime } from '../lib/time.js';
import Icon from './art/Icon.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import PlaceSearch from './PlaceSearch.jsx';
import TripEnds from './TripEnds.jsx';

const POLL_MS = 3000;

const STAGES = {
  check: 'Checking the video is public',
  extract: 'Watching the video',
  clean: 'Tidying up the places found',
  geocode: 'Finding the places on the map',
  review: 'Almost done',
};

function stageText(job) {
  if (job.source === 'transcript' && ['check', 'extract'].includes(job.stage)) return 'Reading the transcript';
  if (job.source === 'upload' && job.stage === 'check') return 'Getting your file ready';
  if (job.mediaMode === 'sound' && job.stage === 'extract') return 'Listening to the video';
  return STAGES[job.stage];
}

// The biggest caption file read in the browser (the server takes about 1 MB of text).
const MAX_CAPTION_FILE_BYTES = 1048576;

// The cheapest way, and the best timed: the video's transcript, pasted from
// YouTube's "Show transcript" panel or read from a caption file. The AI reads
// only the words, with the moment each is said.
function TranscriptOption({ busy, onStart }) {
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState(null);

  async function readFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_CAPTION_FILE_BYTES) {
      setFileNote(`${file.name} is too big for a caption file. Choose the .srt, .vtt or .sbv file of this video.`);
      return;
    }
    setText(await file.text());
    setFileNote(`Read from ${file.name}.`);
  }

  return (
    <section className="space-y-3 rounded-[3px] bg-paper p-4 ring-1 ring-ink/15">
      <h4 className="flex flex-wrap items-center gap-2 font-semibold">
        From the video&apos;s transcript <span className="tag bg-forest/12 text-forest">Cheapest</span>
      </h4>
      <ol className="list-decimal space-y-1 pl-5 text-small text-ink-soft">
        <li>On YouTube, open the video, click “…more” under it, then “Show transcript”.</li>
        <li>Select from the first line to the last, with the times, and copy it.</li>
        <li>Paste it here. Or choose the caption file (.srt, .vtt or .sbv) from YouTube Studio.</li>
      </ol>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileNote(null);
        }}
        placeholder={'0:00\nHello everyone, today we ride from Kolkata\n5:18\nWe are leaving Kolkata now'}
        aria-label="The video's transcript, with its times"
        className="field block w-full font-mono text-small"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-secondary btn-small cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-water">
          Choose a caption file
          <input type="file" accept=".srt,.vtt,.sbv,.txt,text/vtt,text/plain" onChange={readFile} className="sr-only" />
        </label>
        {fileNote && <span className="text-small text-ink-soft">{fileNote}</span>}
      </div>
      <p className="text-small text-ink-soft">
        Only the words are read, so places the rider says out loud are found, and sign boards that are only seen are
        not. Each place gets the exact moment it&apos;s said.
      </p>
      <button type="button" onClick={() => onStart(text)} disabled={busy || text.trim().length < 20} className="btn-ai">
        {busy ? 'Starting...' : 'Build the route from the transcript'}
      </button>
    </section>
  );
}

// What the AI gets from a video file uploaded from the owner's computer.
const MEDIA_MODES = [
  { value: 'full', label: 'Picture and sound', hint: 'The most to go on: sign boards, milestones and what you say.' },
  { value: 'sound', label: 'Sound only', hint: 'Just what is said: about a third of the tokens, so cheaper. Best for vlogs where you name the places.' },
  { value: 'picture', label: 'Picture only', hint: 'Sign boards, milestones and on-screen text, without the sound.' },
];

// Instead of the YouTube link: the same video as a file from the owner's
// computer. TrailCast can then choose what Gemini gets (only the sound, for
// example), and it works for private and unlisted videos too.
// maxMb: the biggest file the server takes (checked here too, before uploading).
function UploadOption({ busy, onUpload, maxMb }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('full');
  const [progress, setProgress] = useState(null);
  const tooBig = Boolean(file && maxMb && file.size > maxMb * 1048576);

  async function upload() {
    setProgress(0);
    await onUpload(file, mode, setProgress);
    setProgress(null);
  }

  return (
    <details className="rounded-[3px] bg-paper p-3 ring-1 ring-ink/15">
      <summary className="cursor-pointer font-semibold text-water">Or use the video file from your computer</summary>
      <div className="mt-3 space-y-3">
        <p className="text-ink-soft">
          Use the same video you put on YouTube, so the places line up with it. This also works for private and unlisted
          videos. The file goes to Google's Gemini, and is deleted from TrailCast and Gemini when the analysis ends.
          {maxMb && ` Files up to ${maxMb} MB: for a bigger one, export a smaller copy (720p is plenty).`}
        </p>
        <input
          type="file"
          accept="video/*,.mkv,.mov,.mp4"
          onChange={(e) => setFile(e.target.files[0] ?? null)}
          className="block w-full text-small file:mr-3 file:rounded-[3px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:font-semibold file:text-paper"
        />
        <fieldset className="space-y-1.5">
          <legend className="font-medium">What should the AI use?</legend>
          {MEDIA_MODES.map((option) => (
            <label key={option.value} className="flex items-start gap-2">
              <input type="radio" name="media-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-1" />
              <span>
                <span className="font-semibold">{option.label}</span>
                <span className="block text-small text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {progress !== null ? (
          <div className="space-y-1" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-water transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-small text-ink-soft">{progress < 1 ? `Uploading... ${Math.round(progress * 100)}%` : 'Checking the file...'}</p>
          </div>
        ) : (
          <>
            {tooBig && (
              <ErrorMessage>
                This file is {Math.round(file.size / 1048576)} MB, and the most TrailCast takes is {maxMb} MB. Export a smaller copy
                (720p is plenty), or use the YouTube link.
              </ErrorMessage>
            )}
            <button type="button" onClick={upload} disabled={busy || !file || tooBig} className="btn-ai">
              Upload and build the route
            </button>
          </>
        )}
      </div>
    </details>
  );
}

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
  outside_area: 'Only found far from the way between the start and the end. Probably a different place with the same name.',
  region_only: 'Only found as a whole state or region, not a spot on the route. Pick the town with Change.',
  before_start: 'This comes before the ride sets off from the start, so it was left out.',
  low_confidence: 'The AI is not sure about this one.',
};

const ANCHORS = { start: 'Start', end: 'End' };

function confidenceColour(confidence) {
  if (confidence >= 0.75) return 'bg-forest';
  if (confidence >= 0.5) return 'bg-contour';
  return 'bg-road';
}

const isRunning = (job) => job && ['queued', 'running'].includes(job.state);
const clockTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <button type="button" onClick={() => onSeek(place.time)} className="text-small font-semibold text-water tabular-nums hover:underline" title="Jump to this moment">
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
            {place.anchor && <span className="tag ml-1.5 bg-ink text-paper">{ANCHORS[place.anchor]}</span>}
            {place.presence === 'mentioned' && <span className="ml-1 text-small text-ink-soft">(only mentioned)</span>}
          </p>
          {located ? (
            <p className="truncate text-small text-ink-soft">{place.label}</p>
          ) : (
            <p className="text-small text-ink-soft">Not on the map yet</p>
          )}
          <p className="text-small text-ink-soft">
            {place.anchor ? `You gave this ${place.anchor === 'start' ? 'start' : 'end'}` : EVIDENCE[place.evidence]}
            {place.quote && <span className="italic"> · “{place.quote}”</span>}
          </p>
          <label className="mt-0.5 flex w-fit items-center gap-1.5 text-small text-ink">
            <input
              type="checkbox"
              checked={place.stopKind === 'overnight'}
              onChange={(e) => onChange({ stopKind: e.target.checked ? 'overnight' : null })}
            />
            <Icon name="moon" className="h-3.5 w-3.5 text-water" />
            Stayed the night here
          </label>
          {place.flags
            ?.filter((flag) => FLAGS[flag])
            .map((flag) => (
              <p key={flag} className={`text-small ${flag === 'low_confidence' ? 'text-ink-soft' : 'text-road'}`}>
                {FLAGS[flag]}
              </p>
            ))}
        </div>
        <button type="button" onClick={() => setChanging(!changing)} className="shrink-0 text-small font-medium text-road hover:underline">
          {changing ? 'Close' : 'Change'}
        </button>
      </div>
      {changing && (
        <div className="space-y-2 pl-6">
          {place.alternatives?.length > 0 && (
            <div>
              <p className="text-small font-medium text-ink-soft">Other places with this name:</p>
              <ul className="text-small">
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
        className="field px-2 py-1"
      >
        {Object.entries(HIDDEN_REASONS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input value={start} onChange={(e) => setStart(e.target.value)} onBlur={commit} aria-label="Skip from" className="field w-20 px-2 py-1 tabular-nums" />
      to
      <input value={end} onChange={(e) => setEnd(e.target.value)} onBlur={commit} aria-label="Skip until" className="field w-20 px-2 py-1 tabular-nums" />
      <button type="button" onClick={onRemove} aria-label="Stop skipping this part" className="px-1 text-ink-soft hover:text-road">
        ✕
      </button>
    </li>
  );
}

// Where the trip starts and ends, saved with the trail as soon as it's picked.
// A trail added before the title was asked for gets YouTube's title to read them from.
function TripSetting({ trail, onSaved }) {
  const [ends, setEnds] = useState({ start: trail.startPlace ?? null, end: trail.endPlace ?? null });
  const [title, setTitle] = useState(trail.videoTitle ?? '');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (trail.videoTitle) return undefined;
    let cancelled = false;
    api.videoInfo(trail.youtubeId).then(
      (info) => !cancelled && setTitle(info.title),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [trail.youtubeId, trail.videoTitle]);

  async function save(next) {
    setEnds(next);
    setError(null);
    try {
      onSaved(await api.updateTrail(trail._id, { startPlace: next.start, endPlace: next.end, ...(!trail.videoTitle && title && { videoTitle: title }) }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-2 rounded-[3px] bg-surface p-3 ring-1 ring-ink/15">
      {title && <p className="text-small text-ink-soft">Video title: “{title}”</p>}
      <TripEnds title={title} value={ends} onChange={save} />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

// For videos without a GPX file: Gemini watches the video and lists the places
// it passes; the owner checks them, and the route is drawn between them.
export default function AiRoutePanel({ trail, getDuration, onSeek, onPreview, onAccepted, onTrailChange }) {
  const [available, setAvailable] = useState(null);
  const [maxUploadMb, setMaxUploadMb] = useState(null);
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
    api.getConfig().then(
      (config) => {
        setAvailable(config.aiRoute);
        setMaxUploadMb(config.aiMaxUploadMb ?? null);
      },
      () => setAvailable(false),
    );
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

  async function startFromTranscript(text) {
    const durationSec = Math.round(getDuration());
    if (!durationSec) {
      setError('Wait for the video to load, then try again: its length is needed to check the transcript is of this video.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(await api.startAiFromTranscript(trail._id, { text, durationSec }));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function uploadFile(file, mode, onProgress) {
    const durationSec = Math.round(getDuration());
    if (!durationSec) {
      setError('Wait for the YouTube video to load, then try again: its length is needed to check the file is the same video.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(await api.uploadAiVideo(trail._id, file, { mode, durationSec, highDetail }, onProgress));
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
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 font-display text-[1.3rem] leading-tight font-semibold text-water">
        <Icon name="sparkles" className="h-4 w-4" /> Let AI find the places in the video
      </h3>
      {!available && (
        <p className="text-ink-soft">
          This server has no Gemini key yet (GEMINI_API_KEY in server/.env), so the AI route builder is off.
        </p>
      )}

      {available && !running && !reviewing && (
        <>
          <p className="text-ink-soft">
            Google&apos;s Gemini reads the video&apos;s transcript, or watches the video, and lists the towns and
            landmarks it passes, with the moment each one comes. You check the list, then TrailCast draws the route
            through them.
          </p>
          <TripSetting trail={trail} onSaved={onTrailChange} />
          {job?.state === 'failed' && <ErrorMessage>{job.error || 'The analysis failed.'}</ErrorMessage>}
          {job?.state === 'cancelled' && <p className="text-ink-soft">The last analysis was cancelled.</p>}
          {job?.state === 'needs_review' && (
            <p className="text-ink-soft">
              The AI's places are waiting for your check.{' '}
              <button type="button" onClick={() => setReviewing(true)} className="font-medium text-road underline">
                Check them now
              </button>
            </p>
          )}
          {job?.state === 'accepted' && (
            <p className="text-ink-soft">
              The AI's places are on the map.{' '}
              <button type="button" onClick={() => setReviewing(true)} className="font-medium text-road underline">
                Review them again
              </button>
            </p>
          )}
          <TranscriptOption busy={busy} onStart={startFromTranscript} />
          <section className="space-y-3 rounded-[3px] bg-paper p-4 ring-1 ring-ink/15">
            <h4 className="font-semibold">No transcript? Let the AI watch the video</h4>
            <p className="text-small text-ink-soft">
              For videos without captions. It also reads sign boards and milestones, and costs more. Public videos only.
            </p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={highDetail} onChange={(e) => setHighDetail(e.target.checked)} />
              Read sign boards and milestones closely (about 3× the cost)
            </label>
            <button type="button" onClick={() => start(job?.state === 'accepted')} disabled={busy} className="btn-secondary">
              {busy ? 'Starting...' : job?.state === 'accepted' ? 'Watch the video again' : 'Watch the video'}
            </button>
            <UploadOption busy={busy} onUpload={uploadFile} maxMb={maxUploadMb} />
          </section>
        </>
      )}

      {running && (
        <div className="space-y-2 rounded-[3px] bg-paper p-4 ring-1 ring-ink/15">
          <p className="font-medium">
            {job.state === 'running' ? `${stageText(job)}...` : job.retryAt ? `Trying again at ${clockTime(job.retryAt)}...` : 'Waiting to start...'}
            {job.state === 'running' && job.progress?.total > 1 && (
              <span className="ml-1 text-ink-soft">
                ({job.progress.done} of {job.progress.total})
              </span>
            )}
          </p>
          {/* Gemini was busy or at its limit: the analysis waits its turn again, nothing is lost. */}
          {job.retryAt && job.retryReason && <p className="text-ink-soft">{job.retryReason}</p>}
          <p className="text-ink-soft">This takes a minute or two for a short video. You can leave this page and come back.</p>
          <button type="button" onClick={cancel} className="text-road hover:underline">
            Cancel
          </button>
        </div>
      )}

      {reviewing && (
        <div className="space-y-3 rounded-[3px] bg-paper p-4 ring-1 ring-ink/15">
          <div>
            <p className="font-medium">
              Check the places the AI found{job.videoTitle && <> in “{job.videoTitle}”</>}
            </p>
            <p className="text-ink-soft">
              Ticked places are added to the ride, and the route goes through them in order (blue on the map). Untick
              anything wrong, and use Change if a place landed in the wrong spot.
              {job.trip && ' The start and end you gave are pinned on, and places were only looked for around the way between them.'}
              {job.reused
                ? ' This video was analysed before, so this cost nothing.'
                : job.costUsd > 0 && ` This analysis cost about ${usd(job.costUsd)}.`}
              {job.modelsUsed?.some((model) => model !== job.model) &&
                ` ${job.model} had reached its limit or was busy, so ${job.modelsUsed.filter((model) => model !== job.model).join(' and ')} answered instead.`}
            </p>
          </div>

          {job.source === 'transcript' && tickedCount < 2 && (
            <p className="text-ink-soft">
              The transcript names few places out loud. Let the AI watch the video instead: it also reads sign boards.
            </p>
          )}
          {places.length === 0 ? (
            <p className="text-ink-soft">The AI found no places in this video. Add the places by hand instead.</p>
          ) : (
            <ol className="max-h-[28rem] divide-y divide-ink/10 overflow-y-auto rounded-[3px] bg-paper ring-1 ring-ink/15">
              {places.map((place) => (
                <CandidateRow key={place.id} place={place} onChange={(changes) => updatePlace(place.id, changes)} onSeek={onSeek} />
              ))}
            </ol>
          )}

          <div className="space-y-1">
            <p className="font-medium">Parts of the video the map skips</p>
            {hidden.length === 0 ? (
              <p className="text-ink-soft">None. The map follows the whole video.</p>
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
              className="btn-ai"
            >
              {busy ? 'Drawing the route...' : `Use ${tickedCount} places and draw the route`}
            </button>
            <button type="button" onClick={() => setReviewing(false)} className="text-ink-soft hover:underline">
              Not now
            </button>
          </div>
          {tickedCount < 2 && <p className="text-ink-soft">Tick at least two places to draw a route.</p>}
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
