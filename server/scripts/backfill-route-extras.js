// Queues the route tools' work (heights, services along the route, trip
// stats) for every trail that already has a route. Run it once after
// deploying the route tools; the server's worker then works through the
// trails one by one, at the pace the free services allow.
//
//   npm run backfill-route-extras -w server
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Trail } from '../src/models/Trail.js';
import { queueRouteEnrich } from '../src/routeExtras/enrich.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI (in server/.env) to the database to backfill.');
  process.exit(1);
}
await connectDatabase();
let queued = 0;
// Only trails with at least two route points.
for await (const trail of Trail.find({ 'track.1': { $exists: true } }).select('track routeVersion owner')) {
  if (await queueRouteEnrich(trail)) queued += 1;
}
console.log(`Queued the route tools for ${queued} trail${queued === 1 ? '' : 's'}. The server's worker does the rest.`);
await disconnectDatabase();
