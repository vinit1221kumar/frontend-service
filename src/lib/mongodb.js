import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'd_lite_backup';

let client;
let clientPromise;

if (uri) {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
}

export function isMongoBackupConfigured() {
  return Boolean(uri);
}

export async function getMongoDb() {
  if (!clientPromise) {
    throw new Error('MongoDB backup is not configured.');
  }
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}
