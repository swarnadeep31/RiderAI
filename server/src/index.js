import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { startWorker } from './jobs/worker.js';
import { requeueStuckServices } from './routeExtras/enrich.js';

const port = Number(process.env.PORT) || 4000;

try {
  await connectDatabase();
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  console.error('Check MONGODB_URI in server/.env (see server/.env.example).');
  process.exit(1);
}

// Services searches that gave up or lost their retry get another go.
try {
  const queued = await requeueStuckServices();
  if (queued) console.log(`Queued the services search again for ${queued} trail(s).`);
} catch (err) {
  console.warn(`Couldn't check for stuck services searches: ${err.message}`);
}

// Runs AI route analyses in the background.
const stopWorker = startWorker();

const server = createApp().listen(port, () => {
  console.log(`TrailCast API listening on http://localhost:${port}`);
});

async function shutDown() {
  stopWorker();
  server.close();
  await disconnectDatabase();
  process.exit(0);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
