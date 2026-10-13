import { SummitScene } from './art/Scenery.jsx';

// The frame around the sign-up and log-in forms: a sunny summit beside the form.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-2 lg:items-stretch lg:py-12">
      <div className="relative hidden min-h-[600px] overflow-hidden rounded-[2rem] shadow-xl shadow-pine-900/20 lg:block">
        <SummitScene className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-pine-950/85 via-pine-950/50 to-transparent p-10 pt-24">
          <p className="font-display text-4xl leading-tight font-extrabold text-white">Every trail tells a story.</p>
          <p className="mt-2 font-semibold text-pine-100">Share yours, with the map right beside it.</p>
        </div>
      </div>

      <div className="card self-center overflow-hidden motion-safe:animate-fade-up">
        <SummitScene className="h-28 w-full lg:hidden" />
        <div className="p-6 sm:p-10">
          <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-stone-600">{subtitle}</p>}
          {children}
          {footer && (
            <div className="mt-6 border-t border-stone-100 pt-5 text-center text-sm text-stone-600">{footer}</div>
          )}
        </div>
      </div>
    </main>
  );
}
