import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { cleanText, enqueueCashierSyncEvent, isUuid, validateCashierPassword } from "@/lib/cashiers";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { createFirestoreCashier, getFirestoreOutlet, listFirestoreCashiers } from "@/lib/firestore-cashiers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim() ?? "";
    const includeDeleted = url.searchParams.get("include_deleted") === "true";

    if (useFirebaseBackend()) {
      if (outletId && !isUuid(outletId)) {
        return NextResponse.json({ error: "Invalid outlet_id" }, { status: 400 });
      }
      const cashiers = await listFirestoreCashiers(outletId || undefined, includeDeleted);
      return NextResponse.json({ cashiers, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from("outlet_cashiers")
      .select(
        "id,outlet_id,name,username,user_type,pos_user_id,sync_status,active,created_at,updated_at,last_synced_at",
      )
      .order("name", { ascending: true });

    if (outletId) {
      if (!isUuid(outletId)) {
        return NextResponse.json({ error: "Invalid outlet_id" }, { status: 400 });
      }
      query = query.eq("outlet_id", outletId);
    }

    if (!includeDeleted) {
      query = query.neq("sync_status", "deleted");
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error, "outlet_cashiers")) {
        return NextResponse.json({
          cashiers: [],
          warning: "outlet_cashiers table missing — apply supabase/migrations/20260729_outlet_cashiers.sql",
        });
      }
      throw error;
    }

    return NextResponse.json({ cashiers: data ?? [] });
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

    if (useFirebaseBackend()) {
      const outlet = await getFirestoreOutlet(outletId);
      if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
      if (!outlet.has_pos_middleware) {
        return NextResponse.json({ error: "Outlet does not have POS middleware enabled" }, { status: 400 });
      }
      const result = await createFirestoreCashier({ outletId, name, username, password });
      return NextResponse.json({ ...result, cloud_backend: "firebase" }, { status: 201 });
    }

    const supabase = getServiceClient();

    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,has_pos_middleware")
      .eq("id", outletId)
      .maybeSingle();
    if (outletError) throw outletError;
    if (!outlet) {
      return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
    }
    if (!outlet.has_pos_middleware) {
      return NextResponse.json({ error: "Outlet does not have POS middleware enabled" }, { status: 400 });
    }

    const { data: cashier, error: insertError } = await supabase
      .from("outlet_cashiers")
      .insert({
        outlet_id: outletId,
        name,
        username,
        user_type: "Cashier",
        sync_status: "pending_insert",
        active: true,
      })
      .select(
        "id,outlet_id,name,username,user_type,pos_user_id,sync_status,active,created_at,updated_at,last_synced_at",
      )
      .single();
    if (insertError) {
      if (insertError.message.includes("outlet_cashiers_outlet_username_unique")) {
        return NextResponse.json({ error: "A cashier with this username already exists for this outlet" }, { status: 409 });
      }
      throw insertError;
    }

    const syncEventId = await enqueueCashierSyncEvent(supabase, {
      outletId,
      cashierId: cashier.id,
      action: "insert",
      payload: {
        name,
        username,
        password,
        user_type: "Cashier",
      },
    });

    return NextResponse.json({ cashier, sync_event_id: syncEventId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create cashier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
