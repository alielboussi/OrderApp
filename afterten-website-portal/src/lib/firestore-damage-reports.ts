import { getFirestoreDb } from "@/lib/firebase-server";
import { DAMAGE_UOM } from "@/lib/damage-uom";
import { isTransferOrderOnDate } from "@/lib/transfer-order-dates";

export type DamageReportRow = {
  id: string;
  report_number: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  status: string | null;
  reported_by_name: string | null;
  reported_at: string | null;
  supervisor_reviewed_name: string | null;
  supervisor_reviewed_at: string | null;
  photo_path: string | null;
  photo_data: string | null;
  total_qty: number | null;
  line_count: number | null;
};

export type DamageReportLineRow = {
  id: string;
  name: string | null;
  qty: number | null;
  uom: string | null;
  product_id: string | null;
  variant_key: string | null;
};

export type DamageReportDetailRow = DamageReportRow & {
  supervisor_name: string | null;
  accepted_at: string | null;
  driver_signed_name: string | null;
  driver_signature_path: string | null;
  driver_signature_data: string | null;
  driver_signed_at: string | null;
  offloader_signed_name: string | null;
  offloader_signature_path: string | null;
  offloader_signature_data: string | null;
  offloader_signed_at: string | null;
  completed_at: string | null;
};

function mapDamageReportDetail(id: string, data: Record<string, unknown>): DamageReportDetailRow {
  return {
    ...mapDamageReport(id, data),
    supervisor_name:
      (data.supervisorName as string | null | undefined) ??
      (data.supervisorReviewedName as string | null | undefined) ??
      null,
    accepted_at: (data.acceptedAt as string | null | undefined) ?? null,
    driver_signed_name:
      (data.driver_signed_name as string | null | undefined) ??
      (data.driverSignedName as string | null | undefined) ??
      null,
    driver_signature_path:
      (data.driver_signature_path as string | null | undefined) ??
      (data.driverSignaturePath as string | null | undefined) ??
      null,
    driver_signature_data:
      (data.driver_signature_data as string | null | undefined) ??
      (data.driverSignatureData as string | null | undefined) ??
      null,
    driver_signed_at:
      (data.driver_signed_at as string | null | undefined) ??
      (data.driverSignedAt as string | null | undefined) ??
      null,
    offloader_signed_name:
      (data.offloader_signed_name as string | null | undefined) ??
      (data.offloaderSignedName as string | null | undefined) ??
      null,
    offloader_signature_path:
      (data.offloader_signature_path as string | null | undefined) ??
      (data.offloaderSignaturePath as string | null | undefined) ??
      null,
    offloader_signature_data:
      (data.offloader_signature_data as string | null | undefined) ??
      (data.offloaderSignatureData as string | null | undefined) ??
      null,
    offloader_signed_at:
      (data.offloader_signed_at as string | null | undefined) ??
      (data.offloaderSignedAt as string | null | undefined) ??
      null,
    completed_at:
      (data.completedAt as string | null | undefined) ??
      (data.completed_at as string | null | undefined) ??
      null,
  };
}

export async function getFirestoreDamageReportById(reportId: string): Promise<DamageReportDetailRow | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("outlet_damage_reports").doc(reportId).get();
  if (!snap.exists) return null;
  return mapDamageReportDetail(snap.id, snap.data() as Record<string, unknown>);
}

function mapDamageReport(id: string, data: Record<string, unknown>): DamageReportRow {
  return {
    id,
    report_number: (data.reportNumber as string | null | undefined) ?? null,
    outlet_id: (data.outletId as string | null | undefined) ?? null,
    outlet_name: (data.outletName as string | null | undefined) ?? null,
    status: (data.status as string | null | undefined) ?? null,
    reported_by_name: (data.reportedByName as string | null | undefined) ?? null,
    reported_at: (data.reportedAt as string | null | undefined) ?? null,
    supervisor_reviewed_name: (data.supervisorReviewedName as string | null | undefined) ?? null,
    supervisor_reviewed_at: (data.supervisorReviewedAt as string | null | undefined) ?? null,
    photo_path: (data.photoPath as string | null | undefined) ?? null,
    photo_data: (data.photoData as string | null | undefined) ?? null,
    total_qty: data.totalQty == null ? null : Number(data.totalQty),
    line_count: data.lineCount == null ? null : Number(data.lineCount),
  };
}

export async function listFirestoreDamageReports(options: {
  date: string;
  outletId?: string | null;
}): Promise<{ reports: DamageReportRow[] }> {
  const db = getFirestoreDb();
  let query = db.collection("outlet_damage_reports").orderBy("reportedAt", "desc");
  if (options.outletId) {
    query = query.where("outletId", "==", options.outletId);
  }
  const snapshot = await query.get();
  const reports = snapshot.docs
    .map((doc) => mapDamageReport(doc.id, doc.data() as Record<string, unknown>))
    .filter((row) => isTransferOrderOnDate(row.reported_at, options.date));

  return { reports };
}

export async function listFirestoreDamageReportLines(reportId: string): Promise<DamageReportLineRow[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("outlet_damage_reports")
    .doc(reportId)
    .collection("lines")
    .orderBy("sortOrder")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: (data.name as string | null | undefined) ?? null,
      qty: data.qty == null ? null : Number(data.qty),
      uom: DAMAGE_UOM,
      product_id: (data.productId as string | null | undefined) ?? null,
      variant_key: (data.variantKey as string | null | undefined) ?? null,
    };
  });
}
