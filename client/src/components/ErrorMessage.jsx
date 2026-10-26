// Something went wrong: what, and (in the words) what to do about it.
export default function ErrorMessage({ children }) {
  return (
    <p role="alert" className="rounded-[3px] bg-road/10 px-3.5 py-2.5 text-small font-medium text-ink ring-1 ring-road/40">
      {children}
    </p>
  );
}
