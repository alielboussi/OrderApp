import { NextResponse } from "next/server";
import { cleanText, isUuid, validateCashierPassword } from "@/lib/cashiers";
import { createFirestoreCashier, getFirestoreOutlet, listFirestoreCashiers } from "@/lib/firestore-cashiers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim() ?? "";
    const includeDeleted = url.searchParams.get("include_deleted") === "true";

    if (outletId && !isUuid(outletId)) {
  return NextResponse.json({ error: "Invalid outlet_id" }, { status: 400 });
}
const cashiers = await listFirestoreCashiers(outletId || undefined, includeDeleted);
return NextResponse.json({ cashiers, cloud_backend: "firebase" });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cashiers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const outletId = cleanText(body.outlet_id, 64);
    const name = cleanText(body.name, 120);
    const username = cleanText(body.username, 80);
    const password = typeof body.password === "string" ? body.password : "";

    if (!isUuid(outletId)) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }

    const passwordError = validateCashierPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const outlet = await getFirestoreOutlet(outletId);
if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
if (!outlet.has_pos_middleware) {
  return NextResponse.json({ error: "Outlet does not have POS middleware enabled" }, { status: 400 });
}
const result = await createFirestoreCashier({ outletId, name, username, password });
return NextResponse.json({ ...result, cloud_backend: "firebase" }, { status: 201 });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create cashier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
