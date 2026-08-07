import { getAuth } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { ensureFirebaseAdmin } from "@/lib/firebase-server";
import { getFirestoreWarehouseAuthAccount, warehouseAuthAccountCanViewLogs } from "@/lib/firestore-warehouse-auth";
import { canViewWarehouseAuditLogs } from "@/lib/warehouse-audit";

export type WarehouseAuthActor = {
  userId: string;
  email: string | null;
};

function isFirebaseAdminConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ENOENT") ||
    message.includes("FIREBASE_PROJECT_ID is required") ||
    message.includes("FIREBASE_CREDENTIALS_PATH") ||
    message.includes("FIREBASE_SERVICE_ACCOUNT_JSON") ||
    message.includes("Unable to detect a Project Id") ||
    message.includes("Could not load the default credentials")
  );
}

export async function requireWarehouseAuth(
  request: Request,
): Promise<{ ok: true; actor: WarehouseAuthActor } | { ok: false; response: NextResponse }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  try {
    ensureFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    return {
      ok: true,
      actor: {
        userId: decoded.uid,
        email: decoded.email ?? null,
      },
    };
  } catch (error) {
    if (isFirebaseAdminConfigError(error)) {
      console.error("[warehouse-auth] Firebase Admin is not configured", error);
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "Firebase Admin is not configured on the server. Set FIREBASE_CREDENTIALS_PATH or FIREBASE_SERVICE_ACCOUNT_JSON, then restart the dev server.",
          },
          { status: 500 },
        ),
      };
    }
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

export async function requireWarehouseAdmin(
  request: Request,
): Promise<{ ok: true; actor: WarehouseAuthActor } | { ok: false; response: NextResponse }> {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth;

  const account = await getFirestoreWarehouseAuthAccount(auth.actor.userId);
  const canManage =
    (account ? warehouseAuthAccountCanViewLogs(account) : false) ||
    canViewWarehouseAuditLogs(auth.actor.userId, auth.actor.email);
  if (!canManage) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}
