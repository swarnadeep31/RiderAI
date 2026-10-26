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
      <div role="radiogroup" aria-label="Use your email or phone number" className="grid grid-cols-2 gap-1 rounded-[3px] bg-surface p-1 ring-1 ring-ink/15">
        {METHODS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={method === option.value}
            onClick={() => onMethod(option.value)}
            className={`rounded-[2px] px-3 py-1.5 font-semibold transition-colors ${
              method === option.value ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {method === 'email' ? (
        <label className="field-label">
          Email
          <input type="email" required autoComplete="email" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
        </label>
      ) : (
        <label className="field-label">
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
            <span className="hint flex items-center gap-1">
              <Icon name="check" className="h-3.5 w-3.5" /> With the country code. Indian numbers can skip the +91.
            </span>
          )}
        </label>
      )}
    </div>
  );
}
