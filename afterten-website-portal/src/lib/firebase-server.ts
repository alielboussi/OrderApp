import "server-only";

import { readFileSync } from "fs";
import { getApps, initializeApp, applicationDefault, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const DEFAULT_STORAGE_BUCKET = "afterten-portal-system-catalog-images";

let firestoreDb: Firestore | null = null;

function resolveCredentials() {
  const jsonInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonInline) {
    return cert(JSON.parse(jsonInline));
  }
  const path = process.env.FIREBASE_CREDENTIALS_PATH?.trim();
  if (path) {
    const json = readFileSync(path, "utf8");
    return cert(JSON.parse(json));
  }
  return applicationDefault();
}

function getFirebaseApp(): App {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required when CLOUD_BACKEND=firebase");
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.STORAGE_BUCKET?.trim() ||
    DEFAULT_STORAGE_BUCKET;

  return initializeApp({
    credential: resolveCredentials(),
    projectId,
    storageBucket,
  });
}

export function resolveFirebaseStorageBucketName(): string {
  return (
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.STORAGE_BUCKET?.trim() ||
    DEFAULT_STORAGE_BUCKET
  );
}

export function getFirebaseStorageBucket() {
  return getStorage(getFirebaseApp()).bucket(resolveFirebaseStorageBucketName());
}

export function ensureFirebaseAdmin(): App {
  return getFirebaseApp();
}

export function getFirestoreDb(): Firestore {
  if (!firestoreDb) {
    firestoreDb = getFirestore(getFirebaseApp());
  }
  return firestoreDb;
}
