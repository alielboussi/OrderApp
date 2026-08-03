import { NextResponse } from "next/server";
import { listFirestoreOrdersOutletLogins, updateFirestoreOrdersOutletLogin } from "@/lib/firestore-outlets";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export async function GET(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const outlets = await listFirestoreOrdersOutletLogins();
    return NextResponse.json({ outlets, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-logins] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet logins" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const body = await request.json().catch(() => ({}));
    const outletId = typeof body.outlet_id === "string" ? body.outlet_id.trim() : "";
    const email = body.email !== undefined && body.email !== null ? String(body.email) : undefined;
    const password =
      body.password !== undefined && body.password !== null ? String(body.password) : undefined;
    if (!outletId) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }
    if (email === undefined && password === undefined) {
      return NextResponse.json({ error: "email or password is required" }, { status: 400 });
    }

    const outlet = await updateFirestoreOrdersOutletLogin({ outletId, email, password });
    if (!outlet) {
      return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, outlet, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-logins] PATCH failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update outlet login" },
      { status: 500 },
    );
  }
}
