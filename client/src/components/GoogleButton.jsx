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

const LABELS = { continue_with: 'Continue with Google', signin_with: 'Sign in with Google', signup_with: 'Sign up with Google' };

// Google's "G", for the stand-in button below.
function GoogleLogo({ className }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// "Continue with Google" (or "Sign up with Google"), always at the top of the
// log-in and sign-up forms. onCredential gets the token Google gives, for the
// server to check. With GOOGLE_CLIENT_ID set, it's Google's own button; until
// then (or if Google's script can't load), a button that looks the same and
// says why Google sign-in isn't available, so the option is never just missing.
export default function GoogleButton({ text = 'continue_with', onCredential, onError }) {
  const ref = useRef(null);
  // null while asking the server, '' when Google sign-in isn't set up.
  const [clientId, setClientId] = useState(null);
  const [scriptFailed, setScriptFailed] = useState(false);
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
          shape: 'rectangular',
          size: 'large',
          logo_alignment: 'center',
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          width: Math.min(ref.current.offsetWidth || 360, 400),
        });
      })
      .catch(() => !cancelled && setScriptFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  const ready = clientId && !scriptFailed;
  function explain() {
    if (scriptFailed) return onError?.("Couldn't load Google sign-in. Check your internet connection, or use your email or phone.");
    console.info('TrailCast: set GOOGLE_CLIENT_ID in server/.env to switch on "Continue with Google" (see README).');
    onError?.("Google sign-in isn't switched on yet. Please use your email or phone number for now.");
  }

  return (
    <div className="space-y-4">
      {ready ? (
        <div ref={ref} className="flex min-h-11 w-full justify-center" />
      ) : (
        <button
          type="button"
          onClick={explain}
          disabled={clientId === null}
          className="mx-auto flex min-h-11 w-full max-w-[400px] items-center justify-center gap-3 rounded-[3px] border border-[#dadce0] bg-white px-4 font-semibold text-[#1f1f1f] transition hover:bg-[#f8faff] disabled:opacity-60 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20]"
        >
          <GoogleLogo className="h-5 w-5" />
          {LABELS[text] ?? LABELS.continue_with}
        </button>
      )}
      <p className="flex items-center gap-3 text-small text-ink-soft">
        <span className="h-px flex-1 bg-ink/15" />
        or
        <span className="h-px flex-1 bg-ink/15" />
      </p>
    </div>
  );
}
