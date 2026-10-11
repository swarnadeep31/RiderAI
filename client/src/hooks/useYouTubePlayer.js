import { useCallback, useEffect, useRef, useState } from 'react';

// Loads YouTube's official IFrame Player API once for the whole app.
let apiPromise;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiPromise = undefined;
      reject(new Error('Could not load the YouTube player. Check your internet connection.'));
    };
    document.head.append(script);
  });
  return apiPromise;
}

// https://developers.google.com/youtube/iframe_api_reference#onError
const PLAYER_ERRORS = {
  2: "This YouTube link isn't valid.",
  5: "This video can't be played in your browser.",
  100: 'This video was removed or is private.',
  101: "The video's owner doesn't allow it to be played on other websites.",
  150: "The video's owner doesn't allow it to be played on other websites.",
};

const PLAYING = 1; // YT.PlayerState.PLAYING

// Puts a YouTube player inside the element `containerRef` points to, and
// reports the playback time 4 times a second so the map can follow along.
// `clock.now()` estimates the time between those reports (from how long ago
// the last one was and the playback speed), so the map marker can glide.
export function useYouTubePlayer(videoId) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(null);
  const clock = useRef(null);
  if (!clock.current) {
    clock.current = {
      time: 0,
      at: 0,
      playing: false,
      rate: 1,
      now() {
        return this.playing ? this.time + ((performance.now() - this.at) / 1000) * this.rate : this.time;
      },
    };
  }

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    let timer;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        // The API replaces the element it's given with an <iframe>, so give it a fresh one.
        const target = document.createElement('div');
        containerRef.current.replaceChildren(target);
        playerRef.current = new YT.Player(target, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0 },
          events: { onError: (event) => setError(PLAYER_ERRORS[event.data] ?? 'The video could not be played.') },
        });
        timer = setInterval(() => {
          const player = playerRef.current;
          const time = player?.getCurrentTime?.();
          if (typeof time !== 'number') return;
          Object.assign(clock.current, {
            time,
            at: performance.now(),
            playing: player.getPlayerState?.() === PLAYING,
            rate: player.getPlaybackRate?.() || 1,
          });
          setCurrentTime(time);
        }, 250);
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      clearInterval(timer);
      playerRef.current?.destroy?.();
      playerRef.current = null;
      containerRef.current?.replaceChildren();
      Object.assign(clock.current, { time: 0, playing: false });
      setCurrentTime(0);
      setError(null);
    };
  }, [videoId]);

  const seekTo = useCallback((seconds) => {
    const player = playerRef.current;
    if (!player?.seekTo) return;
    player.seekTo(seconds, true);
    player.playVideo();
    Object.assign(clock.current, { time: seconds, at: performance.now() });
    setCurrentTime(seconds);
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.();
    clock.current.playing = false;
  }, []);

  // The video's length in seconds (0 until the player has loaded it).
  const getDuration = useCallback(() => playerRef.current?.getDuration?.() || 0, []);

  return { containerRef, currentTime, clock: clock.current, error, seekTo, pause, getDuration };
}
