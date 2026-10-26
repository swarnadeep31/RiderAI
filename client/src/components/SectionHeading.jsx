// The heading of each part of a ride's page, ruled off like a sheet's margin
// note, with an optional figure on the right ("5 places").
export default function SectionHeading({ aside, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2">
      <h2 className="text-[1.6rem] leading-tight uppercase">{children}</h2>
      {aside && <span className="margin-text">{aside}</span>}
    </div>
  );
}
