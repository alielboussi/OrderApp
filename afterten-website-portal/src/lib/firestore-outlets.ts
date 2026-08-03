import { randomUUID } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb } from "@/lib/firebase-server";
import {
  isMiddlewareCatalogSyncOutlet,
  isPosMiddlewareOutlet,
  middlewareSalesApiProfileForOutletId,
  MIDDLEWARE_SALES_API_PATHS,
} from "@/lib/outletScope";
import { isHeartbeatMonitoredOutlet } from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

export type FirestoreOutletListItem = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  channel: string | null;
  has_pos_middleware: boolean | null;
  default_sales_warehouse_id: string | null;
  middleware_sales_api_profile: string | null;
  middleware_sales_api_path: string | null;
};

export async function listFirestoreOutlets(): Promise<FirestoreOutletListItem[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("outlets").get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const warehouseIds = Array.isArray(data.warehouseIds) ? data.warehouseIds : [];
    const profile = middlewareSalesApiProfileForOutletId(doc.id);
    return {
      id: doc.id,
      name: String(data.name ?? "Outlet").trim(),
      code: null,
      active: data.active !== false,
      channel: null,
      has_pos_middleware: data.hasPosMiddleware === true,
      default_sales_warehouse_id: typeof warehouseIds[0] === "string" ? warehouseIds[0] : null,
      middleware_sales_api_profile: profile,
      middleware_sales_api_path: profile ? MIDDLEWARE_SALES_API_PATHS[profile] : null,
    };
  });
}

export async function updateFirestoreOutletDefaultWarehouse(
  updates: Array<{ id: string; default_sales_warehouse_id: string | null }>,
): Promise<number> {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  let count = 0;
  for (const entry of updates) {
    const ref = db.collection("outlets").doc(entry.id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const warehouseIds = entry.default_sales_warehouse_id ? [entry.default_sales_warehouse_id] : [];
    await ref.set({ warehouseIds, defaultSalesWarehouseId: entry.default_sales_warehouse_id, updatedAt: now }, { merge: true });
    count += 1;
  }
  return count;
}
export function filterFirestoreOutletsByScope(
  outlets: FirestoreOutletListItem[],
  scope: string | null,
): FirestoreOutletListItem[] {
  if (scope === "selling") {
    return outlets.filter((outlet) => isPosMiddlewareOutlet(outlet));
  }
  if (scope === "middleware" || scope === "catalog-sync") {
    return outlets.filter((outlet) => isMiddlewareCatalogSyncOutlet(outlet));
  }
  if (scope === "heartbeat") {
    return outlets.filter((outlet) => isHeartbeatMonitoredOutlet(outlet));
  }
  return outlets;
}

export type CreateOrdersOutletInput = {
  name: string;
  code?: string | null;
  ordersAppEmail: string;
  ordersAppPassword: string;
  warehouseId?: string | null;
};

export type CreateOrdersOutletResult = {
  outletId: string;
  outletName: string;
  authUserId: string;
  ordersAppEmail: string;
};

export async function createFirestoreOrdersOutlet(
  input: CreateOrdersOutletInput,
): Promise<CreateOrdersOutletResult> {
  const name = input.name.trim();
  const email = input.ordersAppEmail.trim().toLowerCase();
  const password = input.ordersAppPassword;

  if (!name) throw new Error("Outlet name is required");
  if (!email) throw new Error("Orders app email is required");
  if (!password || password.length < 6) throw new Error("Orders app password must be at least 6 characters");

  const db = getFirestoreDb();
  const outletId = randomUUID();
  const now = new Date().toISOString();
  const warehouseIds = input.warehouseId ? [input.warehouseId] : [];

  let authUser;
  try {
    authUser = await getAuth().getUserByEmail(email);
    await getAuth().updateUser(authUser.uid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
    authUser = await getAuth().createUser({ email, password, emailVerified: true });
  }

  const batch = db.batch();

  batch.set(db.collection("outlets").doc(outletId), {
    name,
    code: input.code?.trim() || null,
    hasPosMiddleware: false,
    usesOrdersApp: true,
    active: true,
    cloudBackend: "firebase",
    authUserId: authUser.uid,
    auth_user_id: authUser.uid,
    ordersAppEmail: email,
    orders_app_email: email,
    ordersAppPassword: password,
    orders_app_password: password,
    warehouseIds,
    defaultSalesWarehouseId: input.warehouseId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection("outlet_heartbeats").doc(outletId), {
    outletId,
    pendingSalesCount: 0,
    lastSyncError: null,
    lastSaleUploadedAt: null,
    middlewareVersion: null,
    updatedAt: now,
  });

  batch.set(db.collection("outlet_counters").doc(outletId), {
    outletId,
    posSyncOpeningLastValue: null,
    posSyncCutoffLastValue: null,
    updatedAt: now,
  });

  batch.set(db.collection("outlet_auth_assignments").doc(`${outletId}_${authUser.uid}`), {
    outlet_id: outletId,
    auth_user_id: authUser.uid,
    assignment_role: "orders",
    active: true,
    updated_at: now,
  });

  batch.set(db.collection("app_users").doc(authUser.uid), {
    email,
    outletId,
    outletName: name,
    roles: ["branch"],
    active: true,
    ordersAppPassword: password,
    createdAt: now,
    updatedAt: now,
    assignedVia: "create_outlet",
  });

  await batch.commit();

  return {
    outletId,
    outletName: name,
    authUserId: authUser.uid,
    ordersAppEmail: email,
  };
}

export type OrdersOutletLoginRow = {
  outlet_id: string;
  outlet_name: string;
  email: string | null;
  password: string | null;
  uses_orders_app: boolean;
};

export function isOrdersAppOutlet(data: FirebaseFirestore.DocumentData): boolean {
  if (data.usesOrdersApp === false || data.uses_orders_app === false) return false;
  if (data.hasPosMiddleware === true || data.has_pos_middleware === true) return false;
  return data.usesOrdersApp === true || data.uses_orders_app === true;
}

type ResolvedOutletAuthLink = {
  authUserId: string | null;
  appUser: FirebaseFirestore.DocumentData | undefined;
  outletData: FirebaseFirestore.DocumentData;
  outletName: string;
};

async function resolveOrdersOutletAuthLink(
  outletId: string,
  prefetched?: {
    outletData?: FirebaseFirestore.DocumentData;
    authByOutlet?: Map<string, string>;
    appUsersById?: Map<string, FirebaseFirestore.DocumentData>;
    appUsersByOutletId?: Map<string, { uid: string; data: FirebaseFirestore.DocumentData }>;
  },
): Promise<ResolvedOutletAuthLink | null> {
  const db = getFirestoreDb();
  let outletData = prefetched?.outletData;
  if (!outletData) {
    const outletSnap = await db.collection("outlets").doc(outletId).get();
    if (!outletSnap.exists) return null;
    outletData = outletSnap.data() ?? {};
  }

  let authByOutlet = prefetched?.authByOutlet;
  if (!authByOutlet) {
    authByOutlet = new Map<string, string>();
    const authSnap = await db
      .collection("outlet_auth_assignments")
      .where("outlet_id", "==", outletId)
      .where("active", "==", true)
      .get();
    for (const doc of authSnap.docs) {
      const linkedOutletId = typeof doc.get("outlet_id") === "string" ? doc.get("outlet_id") : "";
      const authUserId = typeof doc.get("auth_user_id") === "string" ? doc.get("auth_user_id") : "";
      if (linkedOutletId && authUserId) authByOutlet.set(linkedOutletId, authUserId);
    }
  }

  let appUsersById = prefetched?.appUsersById;
  let appUsersByOutletId = prefetched?.appUsersByOutletId;
  if (!appUsersById || !appUsersByOutletId) {
    appUsersById = new Map<string, FirebaseFirestore.DocumentData>();
    appUsersByOutletId = new Map<string, { uid: string; data: FirebaseFirestore.DocumentData }>();
    const appUserSnap = await db.collection("app_users").get();
    for (const doc of appUserSnap.docs) {
      const data = doc.data();
      appUsersById.set(doc.id, data);
      if (data.active === false) continue;
      const linkedOutletId =
        typeof data.outletId === "string"
          ? data.outletId
          : typeof data.outlet_id === "string"
            ? data.outlet_id
            : "";
      if (linkedOutletId && !appUsersByOutletId.has(linkedOutletId)) {
        appUsersByOutletId.set(linkedOutletId, { uid: doc.id, data });
      }
    }
  }

  let authUserId =
    authByOutlet.get(outletId) ??
    (typeof outletData.authUserId === "string" ? outletData.authUserId : null) ??
    (typeof outletData.auth_user_id === "string" ? outletData.auth_user_id : null);

  let appUser = authUserId ? appUsersById.get(authUserId) : undefined;
  if (!appUser) {
    const linked = appUsersByOutletId.get(outletId);
    if (linked) {
      authUserId = linked.uid;
      appUser = linked.data;
    }
  }

  return {
    authUserId,
    appUser,
    outletData,
    outletName: String(outletData.name ?? "Outlet").trim(),
  };
}

function readStoredOutletEmail(
  appUser: FirebaseFirestore.DocumentData | undefined,
  outletData: FirebaseFirestore.DocumentData,
): string | null {
  return (
    (typeof appUser?.email === "string" && appUser.email.trim() ? appUser.email.trim() : null) ??
    (typeof outletData.ordersAppEmail === "string" && outletData.ordersAppEmail.trim()
      ? outletData.ordersAppEmail.trim()
      : null) ??
    (typeof outletData.orders_app_email === "string" && outletData.orders_app_email.trim()
      ? outletData.orders_app_email.trim()
      : null)
  );
}

function readStoredOutletPassword(
  appUser: FirebaseFirestore.DocumentData | undefined,
  outletData: FirebaseFirestore.DocumentData,
): string | null {
  return (
    (typeof appUser?.ordersAppPassword === "string" && appUser.ordersAppPassword
      ? appUser.ordersAppPassword
      : null) ??
    (typeof outletData.ordersAppPassword === "string" && outletData.ordersAppPassword
      ? outletData.ordersAppPassword
      : null) ??
    (typeof outletData.orders_app_password === "string" && outletData.orders_app_password
      ? outletData.orders_app_password
      : null)
  );
}

export async function updateFirestoreOrdersOutletLogin(input: {
  outletId: string;
  email?: string;
  password?: string;
}): Promise<OrdersOutletLoginRow> {
  const link = await resolveOrdersOutletAuthLink(input.outletId);
  if (!link) throw new Error("Outlet not found");

  const { outletData, outletName } = link;
  let authUserId = link.authUserId;
  const currentEmail = readStoredOutletEmail(link.appUser, outletData);
  const currentPassword = readStoredOutletPassword(link.appUser, outletData);

  const nextEmail =
    input.email !== undefined ? input.email.trim().toLowerCase() : (currentEmail ?? "");
  const nextPassword = input.password !== undefined ? input.password : currentPassword;

  if (input.email !== undefined && !nextEmail) throw new Error("Orders app email is required");
  if (input.password !== undefined && (!nextPassword || nextPassword.length < 6)) {
    throw new Error("Orders app password must be at least 6 characters");
  }

  const db = getFirestoreDb();
  const now = new Date().toISOString();

  if (!authUserId) {
    if (!nextEmail) throw new Error("Email is required to create outlet login");
    if (!nextPassword || nextPassword.length < 6) {
      throw new Error("Password is required to create outlet login");
    }

    try {
      const existing = await getAuth().getUserByEmail(nextEmail);
      authUserId = existing.uid;
      await getAuth().updateUser(existing.uid, {
        password: nextPassword,
        emailVerified: true,
        disabled: false,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") throw error;
      const created = await getAuth().createUser({
        email: nextEmail,
        password: nextPassword,
        emailVerified: true,
      });
      authUserId = created.uid;
    }
  } else {
    const authUpdates: { email?: string; password?: string; emailVerified: boolean; disabled: boolean } = {
      emailVerified: true,
      disabled: false,
    };
    if (input.email !== undefined) authUpdates.email = nextEmail;
    if (input.password !== undefined && nextPassword) authUpdates.password = nextPassword;
    if (input.email !== undefined || input.password !== undefined) {
      await getAuth().updateUser(authUserId, authUpdates);
    }
  }

  const storedPassword = nextPassword ?? currentPassword ?? "";

  await db.collection("app_users").doc(authUserId).set(
    {
      email: nextEmail,
      outletId: input.outletId,
      outletName,
      roles: ["branch"],
      active: true,
      ordersAppPassword: storedPassword || null,
      updatedAt: now,
      assignedVia: "outlets_page",
    },
    { merge: true },
  );

  await db.collection("outlet_auth_assignments").doc(`${input.outletId}_${authUserId}`).set(
    {
      outlet_id: input.outletId,
      auth_user_id: authUserId,
      assignment_role: "orders",
      active: true,
      updated_at: now,
    },
    { merge: true },
  );

  await db.collection("outlets").doc(input.outletId).set(
    {
      authUserId,
      auth_user_id: authUserId,
      ordersAppEmail: nextEmail,
      orders_app_email: nextEmail,
      ordersAppPassword: storedPassword || null,
      orders_app_password: storedPassword || null,
      updatedAt: now,
    },
    { merge: true },
  );

  return {
    outlet_id: input.outletId,
    outlet_name: outletName,
    email: nextEmail || null,
    password: storedPassword || null,
    uses_orders_app: outletData.usesOrdersApp !== false,
  };
}

export async function listFirestoreOrdersOutletLogins(): Promise<OrdersOutletLoginRow[]> {
  const db = getFirestoreDb();
  const [outletSnap, authSnap, appUserSnap] = await Promise.all([
    db.collection("outlets").get(),
    db.collection("outlet_auth_assignments").where("active", "==", true).get(),
    db.collection("app_users").get(),
  ]);

  const authByOutlet = new Map<string, string>();
  for (const doc of authSnap.docs) {
    const outletId = typeof doc.get("outlet_id") === "string" ? doc.get("outlet_id") : "";
    const authUserId = typeof doc.get("auth_user_id") === "string" ? doc.get("auth_user_id") : "";
    const role = typeof doc.get("assignment_role") === "string" ? doc.get("assignment_role") : "orders";
    if (!outletId || !authUserId) continue;
    if (role === "supervisor") continue;
    if (!authByOutlet.has(outletId)) {
      authByOutlet.set(outletId, authUserId);
    }
  }

  const appUsersById = new Map<string, FirebaseFirestore.DocumentData>();
  const appUsersByOutletId = new Map<string, { uid: string; data: FirebaseFirestore.DocumentData }>();
  for (const doc of appUserSnap.docs) {
    const data = doc.data();
    appUsersById.set(doc.id, data);
    if (data.active === false) continue;
    const linkedOutletId =
      typeof data.outletId === "string"
        ? data.outletId
        : typeof data.outlet_id === "string"
          ? data.outlet_id
          : "";
    if (linkedOutletId && !appUsersByOutletId.has(linkedOutletId)) {
      appUsersByOutletId.set(linkedOutletId, { uid: doc.id, data });
    }
  }

  const rows: OrdersOutletLoginRow[] = [];

  for (const doc of outletSnap.docs) {
    const data = doc.data();
    if (!isOrdersAppOutlet(data)) continue;

    const outletId = doc.id;
    let authUserId =
      authByOutlet.get(outletId) ??
      (typeof data.authUserId === "string" ? data.authUserId : null) ??
      (typeof data.auth_user_id === "string" ? data.auth_user_id : null);

    let appUser = authUserId ? appUsersById.get(authUserId) : undefined;
    if (!appUser) {
      const linked = appUsersByOutletId.get(outletId);
      if (linked) {
        authUserId = linked.uid;
        appUser = linked.data;
      }
    }

    let email =
      (typeof appUser?.email === "string" && appUser.email.trim() ? appUser.email.trim() : null) ??
      (typeof data.ordersAppEmail === "string" && data.ordersAppEmail.trim() ? data.ordersAppEmail.trim() : null) ??
      (typeof data.orders_app_email === "string" && data.orders_app_email.trim() ? data.orders_app_email.trim() : null);
    const password =
      (typeof appUser?.ordersAppPassword === "string" && appUser.ordersAppPassword
        ? appUser.ordersAppPassword
        : null) ??
      (typeof data.ordersAppPassword === "string" && data.ordersAppPassword ? data.ordersAppPassword : null) ??
      (typeof data.orders_app_password === "string" && data.orders_app_password ? data.orders_app_password : null);

    if (authUserId && !email) {
      try {
        const authUser = await getAuth().getUser(authUserId);
        email = authUser.email ?? null;
      } catch {
        // no linked Firebase Auth user
      }
    }

    rows.push({
      outlet_id: outletId,
      outlet_name: String(data.name ?? "Outlet").trim(),
      email,
      password,
      uses_orders_app: data.usesOrdersApp !== false,
    });
  }

  return rows.sort((a, b) => a.outlet_name.localeCompare(b.outlet_name));
}
