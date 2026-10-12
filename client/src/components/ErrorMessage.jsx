export default function ErrorMessage({ children }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
      {children}
    </p>
  );
}
