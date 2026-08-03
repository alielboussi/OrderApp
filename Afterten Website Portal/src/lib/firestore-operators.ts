import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export async function listFirestoreOperators() {
  const snapshot = await getFirestoreDb().collection("operators").get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const displayName =
        (typeof data.displayName === "string" && data.displayName.trim()) ||
        (typeof data.display_name === "string" && data.display_name.trim()) ||
        (typeof data.email === "string" && data.email) ||
        "Operator";
      const email = typeof data.email === "string" ? data.email : "operator@afterten.local";
      return {
        id: doc.id,
        display_name: displayName,
        name: email,
        email,
        auth_user_id: typeof data.authUserId === "string" ? data.authUserId : doc.id,
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }));
}
