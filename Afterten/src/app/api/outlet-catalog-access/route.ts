import { NextResponse } from "next/server";
import { fetchOutletCatalogAccess, saveOutletCatalogAccess } from "@/lib/outlet-catalog-access";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim();
    const supabase = getServiceClient();

    if (!outletId) {
      const { data, error } = await supabase
        .from("outlets")
        .select("id,name,auth_user_id")
        .order("name");
      if (error) throw error;
      return NextResponse.json({ outlets: data ?? [] });
    }

    const payload = await fetchOutletCatalogAccess(outletId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[outlet-catalog-access] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load outlet catalog access" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outletId = typeof body.outlet_id === "string" ? body.outlet_id.trim() : "";
    if (!outletId) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }

    const entries = Array.isArray(body.entries) ? body.entries : [];
    const payload = await saveOutletCatalogAccess({
      outlet_id: outletId,
      auth_user_id: typeof body.auth_user_id === "string" ? body.auth_user_id.trim() : null,
      assignment_role: body.assignment_role === "orders" || body.assignment_role === "stocktake" ? body.assignment_role : "orders",
      entries: entries.map((entry: Record<string, unknown>) => ({
        item_id: String(entry.item_id ?? ""),
        variant_id: entry.variant_id ? String(entry.variant_id) : null,
        allow_orders: entry.allow_orders === true,
      })),
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[outlet-catalog-access] PUT failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save outlet catalog access" },
      { status: 500 }
    );
  }
}
