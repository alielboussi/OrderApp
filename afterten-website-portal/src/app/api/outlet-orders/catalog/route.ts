import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreOutletOrderCatalog } from "@/lib/firestore-transfer-orders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const outletId = new URL(request.url).searchParams.get("outlet_id")?.trim();
    if (!outletId) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }

    if (!useFirebaseBackend()) {
      return NextResponse.json(
        { error: "Outlet order catalog is only available on the Firebase backend" },
        { status: 501 },
      );
    }

    const catalog = await listFirestoreOutletOrderCatalog(outletId);
    return NextResponse.json({ catalog, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlet-orders/catalog] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load outlet catalog" },
      { status: 500 },
    );
  }
}
