import { NextRequest, NextResponse } from "next/server";
import { handleOutletMiddlewareSalesRequest } from "@/lib/outlet-middleware-sales";
import { parseMiddlewareSalesApiProfile } from "@/lib/outletScope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

/** Legacy path — requires profile or outletId. Use /tills or /quick-corner for split exports. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const profileParam = url.searchParams.get("profile");
  const outletParam = url.searchParams.get("outletId")?.trim() ?? "";

  if (!parseMiddlewareSalesApiProfile(profileParam) && !isUuid(outletParam)) {
    return NextResponse.json(
      {
        error:
          "This URL does not return all outlets. Use the split middleware sales routes instead.",
        routes: {
          till_1_and_till_2: "/api/outlet-middleware-sales/tills",
          quick_corner: "/api/outlet-middleware-sales/quick-corner",
          any_pos_outlet: "/api/outlet-middleware-sales?outletId=<outlet-uuid>",
        },
        note: "Each POS outlet runs its own SCPGT install with Outlet:Id set to that outlet UUID.",
      },
      { status: 400 },
    );
  }

  return handleOutletMiddlewareSalesRequest(request);
}
