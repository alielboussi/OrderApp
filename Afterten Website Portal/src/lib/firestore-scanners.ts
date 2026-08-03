import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export async function listFirestoreScanners() {
  const snapshot = await getFirestoreDb().collection("scanners").get();
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      name: typeof doc.data().name === "string" ? doc.data().name : null,
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
