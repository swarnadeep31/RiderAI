import { useEffect, useState } from 'react';

// True when the visitor asked their device for less motion. CSS animations
// check this themselves; this is for SVG animations started from markup.
export function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const onChange = () => setReduced(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
