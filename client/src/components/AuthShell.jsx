import { SheetMap, useAutoRide } from './art/Sheet.jsx';

// The frame around the sign-up and log-in forms: the form on its own sheet,
// and beside it (on wide screens) the Manali–Rohtang sheet with the rider on it.
export default function AuthShell({ title, subtitle, children, footer }) {
  const [progress] = useAutoRide({ lapMs: 22000 });
  return (
    <main className="mx-auto grid max-w-7xl gap-x-14 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:py-16">
      <div className="mx-auto w-full max-w-md motion-safe:animate-rise lg:mx-0">
        <h1 className="text-title uppercase">{title}</h1>
        {subtitle && <p className="mt-3 text-lead text-ink-soft">{subtitle}</p>}
        {children}
        {footer && <p className="mt-8 border-t border-ink/15 pt-5 text-ink-soft">{footer}</p>}
      </div>

      <figure aria-hidden="true" className="hidden lg:block">
        <div className="neatline bg-paper">
          <SheetMap progress={progress} className="block h-auto w-full" />
        </div>
        <figcaption className="margin-text mt-3">Manali to Rohtang La · a sample ride</figcaption>
      </figure>
    </main>
  );
}
