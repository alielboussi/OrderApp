"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

type GlobalWithFirebase = typeof globalThis & {
  __warehouseFirebaseApp?: FirebaseApp;
  __warehouseFirebaseAuth?: Auth;
};

function getFirebaseConfig() {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT?.trim() ||
    "";
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "";
  const authDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ||
    (projectId ? `${projectId}.firebaseapp.com` : "");
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "";

  if (!projectId || !apiKey) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_API_KEY are required for Firebase Auth.",
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId: appId || undefined,
  };
}

export function getWarehouseFirebaseApp(): FirebaseApp {
  const globalRef = globalThis as GlobalWithFirebase;
  if (globalRef.__warehouseFirebaseApp) {
    return globalRef.__warehouseFirebaseApp;
  }

  const existing = getApps();
  const app = existing.length > 0 ? existing[0]! : initializeApp(getFirebaseConfig());
  globalRef.__warehouseFirebaseApp = app;
  return app;
}

export function getWarehouseFirebaseAuth(): Auth {
  const globalRef = globalThis as GlobalWithFirebase;
  if (globalRef.__warehouseFirebaseAuth) {
    return globalRef.__warehouseFirebaseAuth;
  }

  const auth = getAuth(getWarehouseFirebaseApp());
  globalRef.__warehouseFirebaseAuth = auth;
  return auth;
}
