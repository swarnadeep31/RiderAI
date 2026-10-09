import mongoose from 'mongoose';

let memoryServer;

// Atlas links often leave out the database name (".../?retryWrites=true").
// MongoDB would then quietly use a database called "test", so we use "trailcast".
const DEFAULT_DATABASE = 'trailcast';

export function hasDatabaseName(uri) {
  return /^mongodb(?:\+srv)?:\/\/[^/?]+\/[^/?]+/.test(uri);
}

// Connects to MONGODB_URI. Without one, starts a throwaway in-memory MongoDB
// so the app runs with no setup while you develop.
export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    if (process.env.NODE_ENV === 'production') throw new Error('MONGODB_URI must be set in production.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    console.warn('No MONGODB_URI set: using a temporary in-memory database. Everything is lost when the server stops.');
    console.warn('To keep your data, put MONGODB_URI in server/.env (see server/.env.example).');
    console.warn('(If MongoDB was not downloaded during npm install, it downloads now: about 100 MB.)');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri(DEFAULT_DATABASE);
  }
  await mongoose.connect(uri, hasDatabaseName(uri) ? {} : { dbName: DEFAULT_DATABASE });
  // Says where the data goes, so it's easy to find in MongoDB Atlas (never prints the password).
  const { name, host } = mongoose.connection;
  console.log(`Connected to MongoDB: database "${name}" on ${host}`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
