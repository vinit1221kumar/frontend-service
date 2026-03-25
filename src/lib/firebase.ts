import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Database, getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

let appInstance: FirebaseApp | null = null;
let dbInstance: Database | null = null;
const requiredKeys: Array<keyof typeof firebaseConfig> = ["apiKey", "authDomain", "projectId", "appId"];

function ensureBrowserRuntime() {
  if (typeof window === "undefined") {
    throw new Error("Firebase client access is only available in the browser.");
  }
}

export function isFirebaseConfigured() {
  return requiredKeys.every((key) => Boolean(firebaseConfig[key]));
}

function ensureFirebaseConfigured() {
  if (!isFirebaseConfigured()) {
    const error = new Error("Firebase configuration is missing. Set NEXT_PUBLIC_FIREBASE_* values.");
    (error as Error & { code?: string }).code = "auth/firebase-not-configured";
    throw error;
  }
}

export function getFirebaseApp(): FirebaseApp {
  ensureBrowserRuntime();
  ensureFirebaseConfigured();
  if (appInstance) return appInstance;
  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return appInstance;
}

export function getRealtimeDb(): Database {
  if (dbInstance) return dbInstance;
  dbInstance = getDatabase(getFirebaseApp());
  return dbInstance;
}
