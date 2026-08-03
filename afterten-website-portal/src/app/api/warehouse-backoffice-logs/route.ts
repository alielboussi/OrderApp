import { NextRequest, NextResponse } from "next/server";
import { listFirestoreWarehouseLogs, insertFirestoreWarehouseLog } from "@/lib/firestore-warehouse-logs";

function toIsoDate(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const userQuery = url.searchParams.get("user_email")?.trim() || "";
    const actionQuery = url.searchParams.get("action")?.trim() || "";
    const pageQuery = url.searchParams.get("page")?.trim() || "";
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const actions = url.searchParams.getAll("action_in").filter(Boolean);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);

    const rows = await listFirestoreWarehouseLogs({
  search: search || null,
  userQuery: userQuery || null,
  actionQuery: actionQuery || null,
  actions: actions.length > 0 ? actions : undefined,
  pageQuery: pageQuery || null,
  startDate,
  endDate,
  limit,
});
return NextResponse.json({ rows, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[warehouse-backoffice-logs] GET failed", error);
    return NextResponse.json({ error: "Unable to load warehouse logs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    await insertFirestoreWarehouseLog({
  user_id: typeof body.user_id === "string" ? body.user_id : null,
  user_email: typeof body.user_email === "string" ? body.user_email : null,
  action: typeof body.action === "string" ? body.action : null,
  page: typeof body.page === "string" ? body.page : null,
  method: typeof body.method === "string" ? body.method : null,
  status: typeof body.status === "number" ? body.status : null,
  entity_type: typeof body.entity_type === "string" ? body.entity_type : null,
  entity_id: typeof body.entity_id === "string" ? body.entity_id : null,
  entity_name: typeof body.entity_name === "string" ? body.entity_name : null,
  details: body.details && typeof body.details === "object" ? body.details : null,
});
return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[warehouse-backoffice-logs] POST failed", error);
    return NextResponse.json({ error: "Unable to write warehouse log" }, { status: 500 });
  }
}
