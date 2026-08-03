import "server-only";

import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb } from "@/lib/firebase-server";
import { canViewWarehouseAuditLogs } from "@/lib/warehouse-audit";

const COLLECTION = "warehouse_auth_accounts";

export type WarehouseAuthAccount = {
  user_id: string;
  email: string | null;
  active: boolean;
  created_at: string;
  activated_at: string | null;
  can_view_audit_logs?: boolean;
};

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function mapAccount(userId: string, data: FirebaseFirestore.DocumentData | undefined): WarehouseAuthAccount {
  return {
    user_id: userId,
    email: typeof data?.email === "string" ? data.email : null,
    active: data?.active === true,
    created_at: toIso(data?.createdAt ?? data?.created_at),
    activated_at:
      data?.activatedAt || data?.activated_at
        ? toIso(data.activatedAt ?? data.activated_at)
        : null,
    can_view_audit_logs: data?.canViewAuditLogs === true || data?.can_view_audit_logs === true,
  };
}

export async function getFirestoreWarehouseAuthAccount(userId: string): Promise<WarehouseAuthAccount | null> {
  const snap = await getFirestoreDb().collection(COLLECTION).doc(userId).get();
  if (!snap.exists) return null;
  return mapAccount(snap.id, snap.data());
}

export async function ensureFirestoreWarehouseAuthAccount(input: {
  userId: string;
  email: string | null;
}): Promise<WarehouseAuthAccount> {
  const db = getFirestoreDb();
  const ref = db.collection(COLLECTION).doc(input.userId);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const normalizedEmail = input.email?.trim().toLowerCase() || "";

  if (!snap.exists) {
    let inherited: WarehouseAuthAccount | null = null;
    if (normalizedEmail) {
      const byEmail = await db
        .collection(COLLECTION)
        .where("emailNormalized", "==", normalizedEmail)
        .limit(1)
        .get();
      if (!byEmail.empty) {
        inherited = mapAccount(byEmail.docs[0].id, byEmail.docs[0].data());
      }
    }

    const isAdmin = canViewWarehouseAuditLogs(input.userId, input.email);
    const account: WarehouseAuthAccount = {
      user_id: input.userId,
      email: input.email,
      active: inherited?.active === true || isAdmin,
      created_at: now,
      activated_at: inherited?.active === true || isAdmin ? inherited?.activated_at ?? now : null,
      can_view_audit_logs: inherited?.can_view_audit_logs === true || isAdmin,
    };
    await ref.set({
      userId: input.userId,
      email: input.email,
      emailNormalized: normalizedEmail || null,
      active: account.active,
      createdAt: now,
      activatedAt: account.activated_at,
      canViewAuditLogs: account.can_view_audit_logs === true,
      inheritedFromUserId: inherited?.user_id ?? null,
      updatedAt: now,
    });
    return account;
  }

  const existing = mapAccount(snap.id, snap.data());
  const email = input.email ?? existing.email;
  const isAdmin = canViewWarehouseAuditLogs(input.userId, email);
  const shouldActivate = !existing.active && isAdmin;
  const canView =
    existing.can_view_audit_logs === true || isAdmin;
  if (
    email !== existing.email ||
    canView !== existing.can_view_audit_logs ||
    shouldActivate
  ) {
    const activatedAt = shouldActivate ? now : existing.activated_at;
    await ref.set(
      {
        email,
        emailNormalized: email?.trim().toLowerCase() || null,
        active: existing.active || shouldActivate,
        activatedAt,
        canViewAuditLogs: canView,
        updatedAt: now,
      },
      { merge: true },
    );
    return {
      ...existing,
      email,
      active: existing.active || shouldActivate,
      activated_at: activatedAt,
      can_view_audit_logs: canView,
    };
  }
  return {
    ...existing,
    email,
    can_view_audit_logs: canView,
  };
}

export async function listPendingFirestoreWarehouseAuthAccounts(): Promise<WarehouseAuthAccount[]> {
  const snapshot = await getFirestoreDb()
    .collection(COLLECTION)
    .where("active", "==", false)
    .get();

  return snapshot.docs
    .map((doc) => mapAccount(doc.id, doc.data()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function approveFirestoreWarehouseAuthAccount(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await getFirestoreDb().collection(COLLECTION).doc(userId).set(
    {
      active: true,
      activatedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function declineFirestoreWarehouseAuthAccount(userId: string): Promise<void> {
  await getFirestoreDb().collection(COLLECTION).doc(userId).delete();
  await getAuth().deleteUser(userId);
}

export function warehouseAuthAccountCanViewLogs(account: WarehouseAuthAccount): boolean {
  return account.can_view_audit_logs === true || canViewWarehouseAuditLogs(account.user_id, account.email);
}
