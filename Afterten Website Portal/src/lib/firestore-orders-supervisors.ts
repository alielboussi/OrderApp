import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb } from "./firebase-server";

export type OrdersSupervisorRow = {
  id: string;
  name: string;
  email: string;
  password: string | null;
  active: boolean;
};

function readSupervisorName(data: FirebaseFirestore.DocumentData | undefined): string {
  if (!data) return "";
  if (typeof data.displayName === "string" && data.displayName.trim()) return data.displayName.trim();
  if (typeof data.supervisorName === "string" && data.supervisorName.trim()) return data.supervisorName.trim();
  return "";
}

function readStoredPassword(data: FirebaseFirestore.DocumentData | undefined): string | null {
  if (!data) return null;
  if (typeof data.ordersAppPassword === "string" && data.ordersAppPassword) return data.ordersAppPassword;
  if (typeof data.orders_app_password === "string" && data.orders_app_password) return data.orders_app_password;
  return null;
}

export async function listFirestoreOrdersSupervisors(): Promise<OrdersSupervisorRow[]> {
  const db = getFirestoreDb();
  const snap = await db.collection("app_users").where("allOutlets", "==", true).get();
  const rows: OrdersSupervisorRow[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const roles = Array.isArray(data.roles) ? data.roles.map(String) : [];
    if (!roles.includes("supervisor")) continue;

    let email = typeof data.email === "string" && data.email.trim() ? data.email.trim() : "";
    if (!email) {
      try {
        const authUser = await getAuth().getUser(doc.id);
        email = authUser.email ?? "";
      } catch {
        // no linked Firebase Auth user
      }
    }

    rows.push({
      id: doc.id,
      name: readSupervisorName(data),
      email,
      password: readStoredPassword(data),
      active: data.active !== false,
    });
  }

  return rows.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
  });
}

export async function createFirestoreOrdersSupervisor(input: {
  name: string;
  email: string;
  password: string;
}): Promise<OrdersSupervisorRow> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!name) throw new Error("Supervisor name is required");
  if (!email) throw new Error("Supervisor email is required");
  if (!password || password.length < 6) throw new Error("Supervisor password must be at least 6 characters");

  const db = getFirestoreDb();
  const now = new Date().toISOString();
  let authUserId: string;

  try {
    const existing = await getAuth().getUserByEmail(email);
    authUserId = existing.uid;
    await getAuth().updateUser(existing.uid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
    const created = await getAuth().createUser({
      email,
      password,
      emailVerified: true,
    });
    authUserId = created.uid;
  }

  await db.collection("app_users").doc(authUserId).set(
    {
      email,
      displayName: name,
      outletId: "",
      outletName: "All outlets",
      allOutlets: true,
      roles: ["supervisor"],
      active: true,
      ordersAppPassword: password,
      updatedAt: now,
      assignedVia: "orders_supervisors_page",
    },
    { merge: true },
  );

  return {
    id: authUserId,
    name,
    email,
    password,
    active: true,
  };
}

export async function updateFirestoreOrdersSupervisor(input: {
  id: string;
  name?: string;
  email?: string;
  password?: string;
}): Promise<OrdersSupervisorRow> {
  const db = getFirestoreDb();
  const docRef = db.collection("app_users").doc(input.id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Supervisor not found");

  const data = snap.data() ?? {};
  if (data.allOutlets !== true) throw new Error("Account is not a global orders supervisor");

  const currentEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const currentName = readSupervisorName(data);
  const currentPassword = readStoredPassword(data) ?? "";
  const nextName = input.name !== undefined ? input.name.trim() : currentName;
  const nextEmail = input.email !== undefined ? input.email.trim().toLowerCase() : currentEmail;
  const nextPassword = input.password !== undefined ? input.password : currentPassword;

  if (!nextName) throw new Error("Supervisor name is required");
  if (!nextEmail) throw new Error("Supervisor email is required");
  if (input.password !== undefined && (!nextPassword || nextPassword.length < 6)) {
    throw new Error("Supervisor password must be at least 6 characters");
  }

  const authUpdates: { email?: string; password?: string; emailVerified: boolean; disabled: boolean } = {
    emailVerified: true,
    disabled: false,
  };
  if (input.email !== undefined) authUpdates.email = nextEmail;
  if (input.password !== undefined) authUpdates.password = nextPassword;
  if (input.email !== undefined || input.password !== undefined) {
    await getAuth().updateUser(input.id, authUpdates);
  }

  const now = new Date().toISOString();
  await docRef.set(
    {
      email: nextEmail,
      displayName: nextName,
      outletId: "",
      outletName: "All outlets",
      allOutlets: true,
      roles: ["supervisor"],
      active: true,
      ordersAppPassword: nextPassword || null,
      updatedAt: now,
    },
    { merge: true },
  );

  return {
    id: input.id,
    name: nextName,
    email: nextEmail,
    password: nextPassword || null,
    active: true,
  };
}

export async function deleteFirestoreOrdersSupervisor(id: string): Promise<void> {
  const db = getFirestoreDb();
  const docRef = db.collection("app_users").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Supervisor not found");
  if (snap.data()?.allOutlets !== true) throw new Error("Account is not a global orders supervisor");

  const now = new Date().toISOString();
  await docRef.set({ active: false, updatedAt: now }, { merge: true });

  try {
    await getAuth().updateUser(id, { disabled: true });
  } catch {
    // auth user may already be removed
  }
}
