import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const CHECK_EVERY_MS = 10000;
const KEEP_CHECKING_MS = 2 * 60 * 1000;

// The services along a trail's route: { status: 'ready', items, fuelGaps },
// 'pending' (still being looked for: checked again every 10 seconds for up to
// 2 minutes), 'failed' or 'unavailable'. Null while loading, or without a route.
// Returns [services, retry]: retry (for the trail's owner) asks the server to
// look again now, and starts checking again.
export function useRouteServices(trailId, routeVersion, hasRoute) {
  const [services, setServices] = useState(null);
  // Bumped by retry, to start checking again.
  const [round, setRound] = useState(0);

  // Another trail or route: nothing known yet.
  useEffect(() => {
    setServices(null);
    setRound(0);
  }, [trailId, routeVersion, hasRoute]);

  useEffect(() => {
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
  }, [trailId, routeVersion, hasRoute, round]);

  const retry = useCallback(async () => {
    await api.enrich(trailId);
    setServices({ status: 'pending' });
    setRound((n) => n + 1);
  }, [trailId]);

  return [services, retry];
}
