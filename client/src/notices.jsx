import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './components/art/Icon.jsx';

// Two ways for any page to talk to the user:
// - confirm({ title, message, confirmLabel }): an "Are you sure?" dialog on the
//   page. Resolves true when confirmed, false when cancelled (Cancel, Escape,
//   or a click outside).
// - toast(message, { tone }): a short message at the bottom of the screen that
//   goes away by itself ("“lad” was successfully deleted.").
const NoticesContext = createContext(null);

const TOAST_MS = 4000;

// The dialog uses the browser's own <dialog>, which keeps the keyboard inside
// it and closes on Escape. Cancel comes first, so a stray Enter doesn't delete.
function ConfirmDialog({ request, onAnswer }) {
  const ref = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
      // A click on the dim backdrop (the dialog itself, outside its panel) cancels.
      onClick={(event) => event.target === ref.current && onAnswer(false)}
      className="m-auto max-w-[calc(100%-2rem)] bg-transparent p-0 backdrop:bg-pine-950/60 backdrop:backdrop-blur-sm"
    >
      {request && (
        <div className="card w-96 max-w-full p-6 motion-safe:animate-pop">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Icon name={request.icon ?? 'trash'} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-extrabold text-ink">
                {request.title}
              </h2>
              <p id={messageId} className="mt-1 text-sm text-stone-600">
                {request.message}
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => onAnswer(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={() => onAnswer(true)} className="btn-danger">
              {request.confirmLabel ?? 'Delete'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// The opposite of the page (dark by day, light at night), so it always stands out.
const TONES = {
  success: { icon: 'check', className: 'bg-ink text-surface', iconClass: 'bg-pine-600 text-white' },
  error: { icon: 'compass', className: 'bg-red-600 text-white', iconClass: 'bg-white/20 text-white' },
};

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2000] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const tone = TONES[toast.tone] ?? TONES.success;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-2.5 pr-2 pl-3 text-sm font-semibold shadow-xl motion-safe:animate-fade-up ${tone.className}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.iconClass}`}>
              <Icon name={tone.icon} className="h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="min-w-0">{toast.message}</span>
            <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss" className="ml-1 rounded-full px-2 py-1 opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function NoticesProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
  const toast = useCallback(
    (message, { tone = 'success' } = {}) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((list) => [...list, { id, message, tone }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  function answer(yes) {
    request?.resolve(yes);
    setRequest(null);
  }

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);
  return (
    <NoticesContext value={value}>
      {children}
      <ConfirmDialog request={request} onAnswer={answer} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </NoticesContext>
  );
}

export const useConfirm = () => useContext(NoticesContext).confirm;
export const useToast = () => useContext(NoticesContext).toast;
