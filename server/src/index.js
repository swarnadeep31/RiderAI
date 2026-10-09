import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db.js';

const port = Number(process.env.PORT) || 4000;

try {
  await connectDatabase();
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  console.error('Check MONGODB_URI in server/.env (see server/.env.example).');
  process.exit(1);
}

const server = createApp().listen(port, () => {
  console.log(`TrailCast API listening on http://localhost:${port}`);
});

async function shutDown() {
  server.close();
  await disconnectDatabase();
  process.exit(0);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
