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
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-bold">Thank you!</h1>
        <p className="mt-2 text-stone-600">Your feedback helps decide what TrailCast does next.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-orange-700 underline">
          Back to the trails
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Tell us what you think</h1>
      <p className="mt-1 text-stone-600">
        What works, what's confusing, what videos or features you'd like to see next.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block font-medium">
          Your feedback
          <textarea
            required
            rows={6}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
          />
        </label>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? 'Sending...' : 'Send feedback'}
        </button>
      </form>
    </main>
  );
}
