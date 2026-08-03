"use client";

import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getWarehouseFirebaseAuth } from "@/lib/firebase-client";

export type WarehouseAuthSession = {
  userId: string;
  email: string | null;
  accessToken: string;
};

function mapFirebaseUser(user: User): WarehouseAuthSession {
  return {
    userId: user.uid,
    email: user.email,
    accessToken: "",
  };
}

function waitForWarehouseFirebaseUser(auth: Auth, timeoutMs = 4000): Promise<User | null> {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    let settled = false;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    };

    const timeout = setTimeout(() => finish(auth.currentUser), timeoutMs);
    const unsubscribe = onAuthStateChanged(auth, (user) => finish(user));
  });
}

export async function getWarehouseAuthSession(): Promise<WarehouseAuthSession | null> {
  const auth = getWarehouseFirebaseAuth();
  const user = await waitForWarehouseFirebaseUser(auth);
  if (!user) return null;
  const token = await user.getIdToken();
  return { ...mapFirebaseUser(user), accessToken: token };
}

export async function getWarehouseAccessToken(): Promise<string | null> {
  const user = getWarehouseFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function warehouseSignOut(): Promise<void> {
  await signOut(getWarehouseFirebaseAuth());
}

export async function warehouseSignInWithPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getWarehouseFirebaseAuth(), email, password);
}

export async function warehouseSignInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  const auth = getWarehouseFirebaseAuth();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

export async function warehouseCompleteGoogleCallback(): Promise<void> {
  const auth = getWarehouseFirebaseAuth();
  const result = await getRedirectResult(auth);
  if (result?.user) return;
  if (auth.currentUser) return;
  throw new Error("No session returned from Google sign-in.");
}
