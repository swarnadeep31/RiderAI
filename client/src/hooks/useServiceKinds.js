import { useState } from 'react';
import { KIND_ORDER } from '../lib/services.js';

// Which kinds of services (fuel, mechanics...) the viewer has switched on,
// remembered in this browser. Returns [kinds (a Set), toggle(kind)].
const KINDS_KEY = 'trailcast.serviceKinds';

function loadKinds() {
  try {
    const saved = JSON.parse(localStorage.getItem(KINDS_KEY));
    if (Array.isArray(saved)) return new Set(saved.filter((kind) => KIND_ORDER.includes(kind)));
  } catch {
    // No storage (private window): everything is on.
  }
  return new Set(KIND_ORDER);
}

export function useServiceKinds() {
  const [kinds, setKinds] = useState(loadKinds);
  function toggle(kind) {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      try {
        localStorage.setItem(KINDS_KEY, JSON.stringify([...next]));
      } catch {
        // Not remembered, but still switched.
      }
      return next;
    });
  }
  return [kinds, toggle];
}
