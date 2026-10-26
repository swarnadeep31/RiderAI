import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function FeedbackPage() {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.sendFeedback(message);
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 motion-safe:animate-rise">
        <h1 className="text-display uppercase">Thank you</h1>
        <p className="mt-4 text-lead text-ink-soft">Your feedback helps decide what TrailCast does next. Every message is read.</p>
        <Link to="/" className="btn-primary mt-8">
          Back to the rides
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="motion-safe:animate-rise">
        <h1 className="text-title uppercase">Tell us what you think</h1>
        <p className="mt-3 text-lead text-ink-soft">
          What works, what's confusing, what videos or features you'd like to see next.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5 border-t-2 border-ink pt-8">
          <label className="field-label">
            Your feedback
            <textarea
              required
              rows={6}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="I'd love to see more treks from Uttarakhand..."
              className="input"
            />
          </label>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </main>
  );
}
