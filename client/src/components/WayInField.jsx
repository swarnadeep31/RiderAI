import Icon from './art/Icon.jsx';

const METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

// How someone signs up or logs in: their email, or their phone number.
// A switch between the two, then the matching box.
export default function WayInField({ method, onMethod, value, onChange, newAccount = false }) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Use your email or phone number" className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1">
        {METHODS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={method === option.value}
            onClick={() => onMethod(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              method === option.value ? 'bg-surface text-ink shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {method === 'email' ? (
        <label className="block text-sm font-semibold text-stone-800">
          Email
          <input type="email" required autoComplete="email" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
        </label>
      ) : (
        <label className="block text-sm font-semibold text-stone-800">
          Phone number
          <input
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="+91 98765 43210"
            className="input"
          />
          {newAccount && (
            <span className="mt-1 flex items-center gap-1 text-sm font-normal text-stone-500">
              <Icon name="check" className="h-3.5 w-3.5" /> With the country code. Indian numbers can skip the +91.
            </span>
          )}
        </label>
      )}
    </div>
  );
}
