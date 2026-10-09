import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AddPointForm from '../components/AddPointForm.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import KeyPointList from '../components/KeyPointList.jsx';
import SaveOptions from '../components/SaveOptions.jsx';
import TrailMap from '../components/TrailMap.jsx';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer.js';
import { ACTIVITIES } from '../lib/activities.js';
import { nearestIndex, positionAt } from '../lib/track.js';
import { formatTime } from '../lib/time.js';

function describeSync(videoStartsAt) {
  if (videoStartsAt === 0) return 'The video and the GPS recording start at the same moment.';
  return videoStartsAt > 0
    ? `The video starts ${formatTime(videoStartsAt)} into the GPS recording.`
    : `The GPS recording starts ${formatTime(-videoStartsAt)} into the video.`;
}

export default function TrailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [trail, setTrail] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  // What clicking the map does while editing: null, 'add' (place a key point) or 'sync'.
  const [mapMode, setMapMode] = useState(null);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [follow, setFollow] = useState(true);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getTrail(id).then(
      (loaded) => !cancelled && setTrail(loaded),
      (err) => !cancelled && setLoadError(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  const video = useYouTubePlayer(trail?.youtubeId);

  if (loadError) {
    return (
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <ErrorMessage>{loadError}</ErrorMessage>
        <Link to="/" className="text-orange-700 underline">
          Back to all trails
        </Link>
      </main>
    );
  }
  if (!trail) return <p className="px-4 py-8 text-stone-500">Loading trail...</p>;

  // Only the person who added the trail sees the Edit button and the creator tools.
  const isOwner = Boolean(user && trail.owner?._id === user._id);
  const editing = isOwner && searchParams.has('edit');
  const position = positionAt(trail.track, trail.trackTimes, trail.videoStartsAt, video.currentTime);
  const activePoint = trail.points.findLast((p) => p.time <= video.currentTime + 0.5);
  const canSync = trail.trackTimes.length > 0;

  function selectPoint(point) {
    video.seekTo(point.time);
    setFocus({ location: [point.lat, point.lng] });
  }

  function startAddingPoint() {
    video.pause();
    setPendingLocation(position);
    setMapMode('add');
  }

  function stopMapMode() {
    setMapMode(null);
    setPendingLocation(null);
  }

  async function savePoint(point) {
    setTrail(await api.addPoint(trail._id, point));
    stopMapMode();
  }

  async function deletePoint(point) {
    if (!window.confirm(`Delete "${point.name}"?`)) return;
    try {
      setTrail(await api.deletePoint(trail._id, point._id));
    } catch (err) {
      setNotice(err.message);
    }
  }

  // The creator clicked where they were at this moment of the video: the
  // nearest route point tells us how the video and GPS clocks line up.
  async function syncAt(location) {
    const index = nearestIndex(trail.track, location);
    const videoStartsAt = Math.round((trail.trackTimes[index] - video.currentTime) * 10) / 10;
    try {
      setTrail(await api.updateTrail(trail._id, { videoStartsAt }));
      setNotice('Synced. Play the video to check the blue dot follows it.');
      setFollow(true);
      stopMapMode();
    } catch (err) {
      setNotice(err.message);
    }
  }

  function handleMapClick(location) {
    if (mapMode === 'add') setPendingLocation(location);
    if (mapMode === 'sync') syncAt(location);
  }

  async function deleteTrail() {
    if (!window.confirm('Delete this whole trail? This cannot be undone.')) return;
    try {
      await api.deleteTrail(trail._id);
      navigate('/');
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Phones: video, map, details. Wide screens: video and details on the left, map on the right. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-start-1 lg:row-start-1">
          <div ref={video.containerRef} className="aspect-video w-full overflow-hidden rounded-xl bg-black" />
          {video.error && (
            <div className="mt-2">
              <ErrorMessage>{video.error}</ErrorMessage>
            </div>
          )}
        </div>

        <div className="h-[55vh] overflow-hidden rounded-xl border border-stone-200 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100vh-6rem)] lg:self-start">
          <TrailMap
            trailId={trail._id}
            track={trail.track}
            points={trail.points}
            position={position}
            activePointId={activePoint?._id}
            pendingLocation={pendingLocation}
            focus={focus}
            follow={follow}
            onFollowChange={setFollow}
            onPointClick={selectPoint}
            onMapClick={mapMode ? handleMapClick : null}
          />
        </div>

        <div className="space-y-6 lg:col-start-1 lg:row-start-2">
          <section>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{trail.title}</h1>
                <p className="text-sm text-stone-500">
                  {ACTIVITIES[trail.activity]}
                  {trail.owner && ` · by @${trail.owner.username}`}
                </p>
              </div>
              <div className="flex gap-2">
                {trail.supportUrl && (
                  <a
                    href={trail.supportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    ♥ Support the creator
                  </a>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      stopMapMode();
                      setNotice(null);
                      setSearchParams(editing ? {} : { edit: '1' });
                    }}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                  >
                    {editing ? 'Done editing' : 'Edit'}
                  </button>
                )}
              </div>
            </div>
            {trail.description && <p className="mt-3 whitespace-pre-line text-stone-700">{trail.description}</p>}
          </section>

          {notice && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm">{notice}</p>}

          {editing && (
            <section className="space-y-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
              <h2 className="font-semibold">Creator tools</h2>

              {mapMode === 'add' ? (
                <AddPointForm
                  currentTime={video.currentTime}
                  location={pendingLocation}
                  onSave={savePoint}
                  onCancel={stopMapMode}
                />
              ) : (
                <button
                  type="button"
                  onClick={startAddingPoint}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  + Add a key point at {formatTime(video.currentTime)}
                </button>
              )}

              {canSync && (
                <div className="space-y-2 text-sm">
                  <h3 className="font-semibold">Line up the map with the video</h3>
                  <p className="text-stone-700">{describeSync(trail.videoStartsAt)}</p>
                  {mapMode === 'sync' ? (
                    <p className="font-medium text-orange-800">
                      Now click the spot on the route where you were at {formatTime(video.currentTime)} in the video.{' '}
                      <button type="button" onClick={stopMapMode} className="underline">
                        Cancel
                      </button>
                    </p>
                  ) : (
                    <>
                      <p className="text-stone-600">
                        If the blue dot is ahead of or behind the video: pause at a moment you can find on the map (a
                        bridge, a junction, the start), then press Sync and click that spot on the route.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          video.pause();
                          setMapMode('sync');
                        }}
                        disabled={mapMode !== null}
                        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-medium hover:bg-stone-100 disabled:opacity-50"
                      >
                        Sync at {formatTime(video.currentTime)}
                      </button>
                    </>
                  )}
                </div>
              )}
              {trail.track.length > 0 && !canSync && (
                <p className="text-sm text-stone-600">
                  This route has no times, so the map can't follow the video. Key points still work.
                </p>
              )}

              <button type="button" onClick={deleteTrail} className="text-sm text-red-700 hover:underline">
                Delete this trail
              </button>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Key points</h2>
            <KeyPointList
              points={trail.points}
              activePointId={activePoint?._id}
              editing={editing}
              onSelect={selectPoint}
              onDelete={deletePoint}
            />
          </section>

          {(trail.points.length > 0 || trail.track.length > 0) && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Take this trail with you</h2>
              <SaveOptions trail={trail} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
