import { getFirestoreDb } from "@/lib/firebase-server";
import { DEFAULT_UOM_OPTIONS } from "@/lib/default-uom-options";

export type UomOptionRecord = {
  code: string;
  label: string;
  active: boolean;
  sort_order: number;
  updated_at?: string;
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
  return { code, label, active, sort_order: sortOrder, updated_at: updatedAt };
}

function sortUomRows(rows: UomOptionRecord[]): UomOptionRecord[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

function mergeWithDefaultUomOptions(rows: UomOptionRecord[]): UomOptionRecord[] {
  const storedByCode = new Map(rows.map((row) => [row.code, row]));
  const merged: UomOptionRecord[] = [];

  DEFAULT_UOM_OPTIONS.forEach((option, index) => {
    const stored = storedByCode.get(option.value);
    if (stored) {
      merged.push(stored);
      storedByCode.delete(option.value);
      return;
    }
    merged.push({
      code: option.value,
      label: option.label,
      active: true,
      sort_order: index,
    });
  });

  for (const extra of storedByCode.values()) {
    merged.push(extra);
  }

  return sortUomRows(merged);
}

export async function listAllFirestoreUomOptions(): Promise<UomOptionRecord[]> {
  const snapshot = await getFirestoreDb().collection("uom_options").get();
  const rows = snapshot.docs.map((doc) => mapFirestoreUomDoc(doc.id, doc.data()));
  return mergeWithDefaultUomOptions(rows);
}

export async function listFirestoreUomOptions(): Promise<Array<{ value: string; label: string }>> {
  const rows = (await listAllFirestoreUomOptions()).filter((row) => row.active && row.code && row.label);
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
  if (existing.exists) {
    throw new Error("A UOM with this code already exists.");
  }

  await ref.set({
    code,
    label,
    active: record.active,
    sort_order: record.sort_order,
    updated_at: now,
  });

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

  const label = input.label.trim();
  const now = new Date().toISOString();
  const defaultIndex = DEFAULT_UOM_OPTIONS.findIndex((option) => option.value === code);

  if (!existing.exists && defaultIndex < 0) {
    throw new Error("UOM not found.");
  }

  const sortOrder = Number.isFinite(Number(input.sort_order))
    ? Number(input.sort_order)
    : existing.exists
      ? Number(existing.data()?.sort_order ?? 0)
      : defaultIndex;

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
    },
    { merge: true },
  );

  return record;
}

export async function deleteFirestoreUomOption(code: string): Promise<void> {
  const ref = getFirestoreDb().collection("uom_options").doc(code);
  const existing = await ref.get();
  if (existing.exists) {
    await ref.delete();
    return;
  }

  const defaultOption = DEFAULT_UOM_OPTIONS.find((option) => option.value === code);
  if (!defaultOption) {
    throw new Error("UOM not found.");
  }

  const now = new Date().toISOString();
  await ref.set({
    code,
    label: defaultOption.label,
    active: false,
    sort_order: DEFAULT_UOM_OPTIONS.findIndex((option) => option.value === code),
    updated_at: now,
  });
}
