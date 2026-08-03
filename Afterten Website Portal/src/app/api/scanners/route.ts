import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreScanners } from "@/lib/firestore-scanners";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    if (useFirebaseBackend()) {
      const scanners = await listFirestoreScanners();
      return NextResponse.json({ scanners, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("scanners")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ scanners: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load scanners";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
