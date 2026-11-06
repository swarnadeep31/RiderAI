import { useEffect, useState } from 'react';
import Icon from './art/Icon.jsx';

// The free hosting puts the API to sleep after 15 minutes without visitors,
// and waking it takes up to a minute. When it doesn't answer quickly, a note
// says so, until it does: a slow first visit, not a broken site.
const SLOW_MS = 3000;

export default function ServerWaking() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let answered = false;
    const timer = setTimeout(() => !answered && setSlow(true), SLOW_MS);
    fetch('/api/health', { cache: 'no-store' })
      .catch(() => {})
      .finally(() => {
        answered = true;
        clearTimeout(timer);
        setSlow(false);
      });
    return () => {
      answered = true;
      clearTimeout(timer);
    };
  }, []);

  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-[2000] flex justify-center px-4">
      <p className="sheet flex max-w-md items-center gap-2.5 px-4 py-3 text-small text-ink">
        <Icon name="compass" className="h-4 w-4 shrink-0 text-road motion-safe:animate-spin" />
        Waking up TrailCast&apos;s server. After a quiet spell this can take up to a minute.
      </p>
    </div>
  );
}
