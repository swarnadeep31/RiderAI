import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { CampScene } from '../components/art/Scenery.jsx';
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
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <CampScene className="mx-auto w-full max-w-sm drop-shadow-xl motion-safe:animate-fade-up" />
        <h1 className="mt-8 text-4xl font-extrabold text-pine-950">Thank you!</h1>
        <p className="mt-2 text-stone-600">
          Your feedback helps decide what TrailCast does next. We read every message by the campfire.
        </p>
        <Link to="/" className="btn-primary mt-6">
          Back to the trails
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="card p-6 motion-safe:animate-fade-up sm:p-8">
        <h1 className="text-3xl font-extrabold text-pine-950">Tell us what you think</h1>
        <p className="mt-1 text-stone-600">
          What works, what's confusing, what videos or features you'd like to see next.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-stone-800">
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
          <button type="submit" disabled={saving} className="btn-primary px-6 py-3 text-base">
            {saving ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </main>
  );
}
