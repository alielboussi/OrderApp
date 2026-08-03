import { NextResponse } from "next/server";
import { listFirestoreScanners } from "@/lib/firestore-scanners";

export async function GET() {
  try {
    const scanners = await listFirestoreScanners();
return NextResponse.json({ scanners, cloud_backend: "firebase" });
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load scanners";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
