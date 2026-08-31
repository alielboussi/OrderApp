/**
 * Shared Firebase Admin init for migration scripts.
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../../functions/node_modules/firebase-admin"));

const DEFAULT_KEY_PATH = resolve(__dirname, "../../../secrets/afterten-firebase-adminsdk.json");

function loadFirestoreExportEnv() {
  const envPath = resolve(__dirname, "../.env.firestore-export");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function getFirestoreAdmin() {
  if (!admin.apps.length) {
    loadFirestoreExportEnv();
    const keyPath = process.env.FIREBASE_CREDENTIALS_PATH?.trim() || DEFAULT_KEY_PATH;
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

module.exports = { getFirestoreAdmin };
