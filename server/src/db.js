import mongoose from 'mongoose';

let memoryServer;

// Connects to MONGODB_URI. Without one, starts a throwaway in-memory MongoDB
// so the app runs with no setup while you develop.
export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    if (process.env.NODE_ENV === 'production') throw new Error('MONGODB_URI must be set in production.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    console.warn('No MONGODB_URI set: using a temporary in-memory database. Everything is lost when the server stops.');
    console.warn('(If MongoDB was not downloaded during npm install, it downloads now: about 100 MB.)');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('trailcast');
  }
  await mongoose.connect(uri);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
