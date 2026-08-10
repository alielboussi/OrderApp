import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase-server";

export type UomOptionRecord = {
  code: string;
  label: string;
  active: boolean;
  sort_order: number;
  updated_at?: string;
  deleted_at?: string;
};

function mapFirestoreUomDoc(
  docId: string,
  data: FirebaseFirestore.DocumentData,
): UomOptionRecord {
  const code = typeof data.code === "string" ? data.code : docId;
  const label = typeof data.label === "string" ? data.label : code;
  const active = data.active !== false;
  const sortOrder = typeof data.sort_order === "number" ? data.sort_order : 0;
  const updatedAt = typeof data.updated_at === "string" ? data.updated_at : undefined;
  const deletedAt = typeof data.deleted_at === "string" ? data.deleted_at : undefined;
  return { code, label, active, sort_order: sortOrder, updated_at: updatedAt, deleted_at: deletedAt };
}

function sortUomRows(rows: UomOptionRecord[]): UomOptionRecord[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

/** All UOM rows from Firestore catalog (including inactive). */
export async function listAllFirestoreUomOptions(): Promise<UomOptionRecord[]> {
  const snapshot = await getFirestoreDb().collection("uom_options").get();
  const rows = snapshot.docs.map((doc) => mapFirestoreUomDoc(doc.id, doc.data()));
  return sortUomRows(rows).filter((row) => !row.deleted_at);
}

/** Active UOMs only — the sole source for OrdersApp / Supervisor dropdowns. */
export async function listFirestoreUomOptions(): Promise<Array<{ value: string; label: string }>> {
  const rows = (await listAllFirestoreUomOptions()).filter(
    (row) => row.active && row.code && row.label,
  );
  return rows.map(({ code, label }) => ({ value: code, label }));
}

export async function createFirestoreUomOption(input: {
  code: string;
  label: string;
  active?: boolean;
  sort_order?: number;
}): Promise<UomOptionRecord> {
  const code = input.code.trim();
  const label = input.label.trim();
  const now = new Date().toISOString();
  const record: UomOptionRecord = {
    code,
    label,
    active: input.active !== false,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
    updated_at: now,
  };

  const ref = getFirestoreDb().collection("uom_options").doc(code);
  const existing = await ref.get();
  if (existing.exists && !existing.data()?.deleted_at) {
    throw new Error("A UOM with this code already exists.");
  }

  const payload = {
    code,
    label,
    active: record.active,
    sort_order: record.sort_order,
    updated_at: now,
  };

  if (existing.exists) {
    await ref.set({ ...payload, deleted_at: FieldValue.delete() }, { merge: true });
  } else {
    await ref.set(payload);
  }

  return record;
}

export async function updateFirestoreUomOption(
  code: string,
  input: {
    label: string;
    active?: boolean;
    sort_order?: number;
  },
): Promise<UomOptionRecord> {
  const ref = getFirestoreDb().collection("uom_options").doc(code);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("UOM not found.");
  }

  const label = input.label.trim();
  const now = new Date().toISOString();
  const sortOrder = Number.isFinite(Number(input.sort_order))
    ? Number(input.sort_order)
    : Number(existing.data()?.sort_order ?? 0);

  const record: UomOptionRecord = {
    code,
    label,
    active: input.active !== false,
    sort_order: sortOrder,
    updated_at: now,
  };

  await ref.set(
    {
      code,
      label: record.label,
      active: record.active,
      sort_order: record.sort_order,
      updated_at: now,
      deleted_at: FieldValue.delete(),
    },
    { merge: true },
  );

  return record;
}

export async function deleteFirestoreUomOption(code: string): Promise<void> {
  const ref = getFirestoreDb().collection("uom_options").doc(code);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("UOM not found.");
  }

  const now = new Date().toISOString();
  const data = existing.data() ?? {};
  await ref.set({
    code,
    label: typeof data.label === "string" ? data.label : code,
    active: false,
    deleted_at: now,
    sort_order: typeof data.sort_order === "number" ? data.sort_order : 0,
    updated_at: now,
  });
}
