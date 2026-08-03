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
import type { SupabaseClient } from "@supabase/supabase-js";
import { useFirebaseAuthClient } from "@/lib/cloud-backend-client";
import { getWarehouseFirebaseAuth } from "@/lib/firebase-client";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";

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

export function getWarehouseAuthSupabaseClient(): SupabaseClient {
  return getWarehouseBrowserClient();
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
  if (useFirebaseAuthClient()) {
    const auth = getWarehouseFirebaseAuth();
    const user = await waitForWarehouseFirebaseUser(auth);
    if (!user) return null;
    const token = await user.getIdToken();
    return { ...mapFirebaseUser(user), accessToken: token };
  }

  const supabase = getWarehouseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    accessToken: session.access_token,
  };
}

export async function getWarehouseAccessToken(): Promise<string | null> {
  const session = await getWarehouseAuthSession();
  if (!session) return null;
  if (useFirebaseAuthClient()) {
    const user = getWarehouseFirebaseAuth().currentUser;
    if (!user) return null;
    return user.getIdToken();
  }
  return session.accessToken;
}

export async function warehouseSignOut(): Promise<void> {
  if (useFirebaseAuthClient()) {
    await signOut(getWarehouseFirebaseAuth());
    return;
  }
  await getWarehouseBrowserClient().auth.signOut();
}

export async function warehouseSignInWithPassword(email: string, password: string): Promise<void> {
  if (useFirebaseAuthClient()) {
    await signInWithEmailAndPassword(getWarehouseFirebaseAuth(), email, password);
    return;
  }
  const { error } = await getWarehouseBrowserClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function warehouseSignInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  if (useFirebaseAuthClient()) {
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
    return;
  }

  const redirectTo = `${window.location.origin}/Warehouse_Backoffice/auth/callback`;
  const { error } = await getWarehouseBrowserClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  if (error) throw error;
}

export async function warehouseCompleteGoogleCallback(): Promise<void> {
  if (useFirebaseAuthClient()) {
    const auth = getWarehouseFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (result?.user) return;
    if (auth.currentUser) return;
    throw new Error("No session returned from Google sign-in.");
  }

  const supabase = getWarehouseBrowserClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");
  if (errorDescription) {
    throw new Error(errorDescription);
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    throw new Error("No session returned from Google sign-in.");
  }
}
