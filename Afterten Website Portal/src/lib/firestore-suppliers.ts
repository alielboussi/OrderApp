import { getFirestoreDb } from "@/lib/firebase-server";

export type FirestoreSupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  notes: string | null;
  active: boolean;
};

export async function listFirestoreSuppliers(): Promise<FirestoreSupplierRow[]> {
  const snapshot = await getFirestoreDb().collection("suppliers").get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name ?? "").trim() || "Supplier",
        contact_name: typeof data.contact_name === "string" ? data.contact_name : null,
        contact_phone: typeof data.contact_phone === "string" ? data.contact_phone : null,
        contact_email: typeof data.contact_email === "string" ? data.contact_email : null,
        whatsapp_number: typeof data.whatsapp_number === "string" ? data.whatsapp_number : null,
        notes: typeof data.notes === "string" ? data.notes : null,
        active: data.active !== false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
