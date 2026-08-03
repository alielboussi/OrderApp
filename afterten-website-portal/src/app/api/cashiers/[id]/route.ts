import { NextResponse } from "next/server";
import { isUuid } from "@/lib/cashiers";
import { deleteFirestoreCashier } from "@/lib/firestore-cashiers";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cashierId = id?.trim() ?? "";
    if (!isUuid(cashierId)) {
      return NextResponse.json({ error: "Invalid cashier id" }, { status: 400 });
    }

    const result = await deleteFirestoreCashier(cashierId);
return NextResponse.json({ ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete cashier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
