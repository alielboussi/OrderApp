import { getStorage } from "firebase-admin/storage";

const DEFAULT_BUCKET = "afterten-portal-system.firebasestorage.app";

export function getAppStorageBucket() {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.STORAGE_BUCKET?.trim() ||
    DEFAULT_BUCKET;
  return getStorage().bucket(bucketName);
}
