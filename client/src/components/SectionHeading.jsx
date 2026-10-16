import Icon from './art/Icon.jsx';

// The heading of each part of the page, with an optional note on the right ("5 places").
export default function SectionHeading({ icon, iconClass, aside, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold text-ink">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${iconClass}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {children}
      </h2>
      {aside && <span className="text-sm font-medium text-stone-500">{aside}</span>}
    </div>
  );
}
