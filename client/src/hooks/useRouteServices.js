import { useEffect, useState } from 'react';
import { api } from '../api.js';

const CHECK_EVERY_MS = 10000;
const KEEP_CHECKING_MS = 2 * 60 * 1000;

// The services along a trail's route: { status: 'ready', items, fuelGaps },
// 'pending' (still being looked for: checked again every 10 seconds for up to
// 2 minutes), 'failed' or 'unavailable'. Null while loading, or without a route.
export function useRouteServices(trailId, routeVersion, hasRoute) {
  const [services, setServices] = useState(null);

  useEffect(() => {
    setServices(null);
    if (!trailId || !hasRoute) return undefined;
    let cancelled = false;
    let timer;
    const startedAt = Date.now();
    const load = () =>
      api.getServices(trailId).then(
        (data) => {
          if (cancelled) return;
          setServices(data);
          if (data.status === 'pending' && Date.now() - startedAt < KEEP_CHECKING_MS) timer = setTimeout(load, CHECK_EVERY_MS);
        },
        () => !cancelled && setServices({ status: 'failed', error: "Couldn't load fuel stops right now." }),
      );
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trailId, routeVersion, hasRoute]);

  return services;
}
