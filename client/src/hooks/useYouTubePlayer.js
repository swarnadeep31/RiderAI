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

// Puts a YouTube player inside the element `containerRef` points to, and
// reports the playback time 4 times a second so the map can follow along.
export function useYouTubePlayer(videoId) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(null);

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
          const time = playerRef.current?.getCurrentTime?.();
          if (typeof time === 'number') setCurrentTime(time);
        }, 250);
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      clearInterval(timer);
      playerRef.current?.destroy?.();
      playerRef.current = null;
      containerRef.current?.replaceChildren();
      setCurrentTime(0);
      setError(null);
    };
  }, [videoId]);

  const seekTo = useCallback((seconds) => {
    const player = playerRef.current;
    if (!player?.seekTo) return;
    player.seekTo(seconds, true);
    player.playVideo();
    setCurrentTime(seconds);
  }, []);

  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), []);

  return { containerRef, currentTime, error, seekTo, pause };
}
