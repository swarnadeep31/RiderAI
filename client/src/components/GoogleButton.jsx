import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Google's own sign-in script, loaded once, only on pages that show the button.
let scriptPromise;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("Couldn't load Google sign-in. Check your internet connection."));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

// "Continue with Google" (or "Sign up with Google"). onCredential gets the
// token Google gives, for the server to check. Nothing shows if this server
// has no GOOGLE_CLIENT_ID set up.
export default function GoogleButton({ text = 'continue_with', onCredential, onError }) {
  const ref = useRef(null);
  const [clientId, setClientId] = useState(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    api.getConfig().then((config) => setClientId(config.googleClientId || ''), () => setClientId(''));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then((google) => {
        if (cancelled || !ref.current) return;
        google.accounts.id.initialize({ client_id: clientId, callback: (response) => callbackRef.current(response.credential) });
        google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          text,
          shape: 'pill',
          size: 'large',
          logo_alignment: 'center',
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          width: Math.min(ref.current.offsetWidth || 360, 400),
        });
      })
      .catch((err) => !cancelled && onError?.(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <div className="space-y-4">
      <div ref={ref} className="flex min-h-11 w-full justify-center" />
      <p className="flex items-center gap-3 text-xs font-semibold tracking-wide text-stone-400 uppercase">
        <span className="h-px flex-1 bg-stone-200" />
        or
        <span className="h-px flex-1 bg-stone-200" />
      </p>
    </div>
  );
}
