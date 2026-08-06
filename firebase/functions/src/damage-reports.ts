import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { formatApprovedDamageWhatsAppMessage } from "./damage-whatsapp";
import { getAppStorageBucket } from "./storage-bucket";
import { sendWasenderGroupMessage, sendWasenderGroupMessageWithImage, wasenderApiKey, wasenderGroupId } from "./wasender";
import { COLLECTIONS } from "./schema";

const DAMAGE_UOM = "Pc(s)";

type AppUserDoc = {
  outletId: string;
  outletName: string;
  roles: string[];
  active: boolean;
  allOutlets?: boolean;
  email?: string;
  displayName?: string;
};

type DamageLineInput = {
  productId?: string | null;
  variantKey?: string | null;
  name: string;
  qty: number;
};

async function requireAppUser(uid: string): Promise<AppUserDoc> {
  const snap = await getFirestore().collection(COLLECTIONS.appUsers).doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "No app profile found for this account.");
  }
  const data = snap.data() as AppUserDoc;
  if (!data.active) {
    throw new HttpsError("permission-denied", "Account is inactive or pending approval.");
  }
  return data;
}

function isSupervisor(profile: AppUserDoc): boolean {
  return profile.roles.includes("supervisor") || profile.roles.includes("warehouse_admin");
}

function isBranchUser(profile: AppUserDoc): boolean {
  return profile.roles.includes("branch");
}

function normalizePhotoBase64(input: string): string {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    throw new HttpsError("invalid-argument", "photoBase64 is required.");
  }
  const dataUrlMatch = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/i.exec(trimmed);
  return (dataUrlMatch?.[1] ?? trimmed).replace(/\s/g, "");
}

function parsePhotoBase64(input: string): Buffer {
  const cleaned = normalizePhotoBase64(input);
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "photoBase64 is invalid.");
  }
  return buffer;
}

function formatDamageReportNumber(outletName: string, sequence: number): string {
  const prefix = outletName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "OUTLET";
  return `DMG-${prefix}-${String(sequence).padStart(8, "0")}`;
}

async function persistDamagePhoto(
  outletId: string,
  reportId: string,
  photoBase64: string,
): Promise<{ path: string | null; data: string | null }> {
  const storagePath = `damages/${outletId}/${reportId}/photo.jpg`;
  const rawBase64 = normalizePhotoBase64(photoBase64);
  try {
    const bucket = getAppStorageBucket();
    await bucket.file(storagePath).save(parsePhotoBase64(photoBase64), {
      contentType: "image/jpeg",
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" },
    });
    return { path: storagePath, data: null };
  } catch (error) {
    console.warn("[damage-reports] photo upload failed, saving inline", error);
    return { path: null, data: rawBase64 };
  }
}

function resolveSupervisorDisplayName(profile: AppUserDoc): string {
  const displayName = String(profile.displayName ?? "").trim();
  if (displayName) return displayName;
  const email = String(profile.email ?? "").trim();
  if (email) return email;
  return profile.outletName?.trim() || "Supervisor";
}

function normalizeSignatureBase64(input: string): string {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    throw new HttpsError("invalid-argument", "signatureBase64 is required.");
  }
  const dataUrlMatch = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/i.exec(trimmed);
  return (dataUrlMatch?.[1] ?? trimmed).replace(/\s/g, "");
}

function parseSignatureBase64(input: string): Buffer {
  const cleaned = normalizeSignatureBase64(input);
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "signatureBase64 is invalid.");
  }
  return buffer;
}

type PersistedSignature = {
  path: string | null;
  data: string | null;
};

async function persistDamageSignature(
  outletId: string,
  reportId: string,
  role: "driver" | "offloader",
  signatureBase64: string,
): Promise<PersistedSignature> {
  const storagePath = `damages/${outletId}/${reportId}/signatures/${role}.png`;
  const rawBase64 = normalizeSignatureBase64(signatureBase64);
  try {
    const bucket = getAppStorageBucket();
    await bucket.file(storagePath).save(parseSignatureBase64(signatureBase64), {
      contentType: "image/png",
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" },
    });
    return { path: storagePath, data: null };
  } catch (error) {
    console.warn(`[damage-reports] ${role} signature upload failed, saving inline`, error);
    return { path: null, data: rawBase64 };
  }
}

export const submitDamageReport = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!isBranchUser(profile) && !isSupervisor(profile)) {
    throw new HttpsError("permission-denied", "Outlet access required.");
  }

  const outletId = String(request.data?.outletId ?? profile.outletId ?? "").trim();
  const reportedByName = String(request.data?.reportedByName ?? profile.displayName ?? "").trim();
  const photoBase64 = String(request.data?.photoBase64 ?? "").trim();
  const lines = (request.data?.lines ?? []) as DamageLineInput[];

  if (!outletId || outletId !== profile.outletId) {
    throw new HttpsError("permission-denied", "You can only report damages for your outlet.");
  }
  if (!reportedByName) {
    throw new HttpsError("invalid-argument", "reportedByName is required.");
  }
  if (!photoBase64) {
    throw new HttpsError("invalid-argument", "A damage photo is required.");
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new HttpsError("invalid-argument", "At least one damaged product line is required.");
  }

  const normalizedLines = lines.map((line, index) => {
    const qty = Math.floor(Number(line.qty ?? 0));
    const name = String(line.name ?? "").trim();
    if (!name || qty <= 0) {
      throw new HttpsError("invalid-argument", `Line ${index + 1} requires a product name and qty.`);
    }
    return {
      productId: line.productId ? String(line.productId).trim() : null,
      variantKey: line.variantKey ? String(line.variantKey).trim() : null,
      name,
      qty,
      uom: DAMAGE_UOM,
    };
  });

  const db = getFirestore();
  const reportRef = db.collection(COLLECTIONS.outletDamageReports).doc();
  const counterRef = db.collection(COLLECTIONS.outletDamageCounters).doc(outletId);
  const now = new Date().toISOString();
  const photo = await persistDamagePhoto(outletId, reportRef.id, photoBase64);

  await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists ? Number(counterSnap.data()?.value ?? 0) : 0;
    const next = current + 1;
    const reportNumber = formatDamageReportNumber(profile.outletName, next);

    tx.set(counterRef, { value: next, updatedAt: now }, { merge: true });
    tx.set(reportRef, {
      outletId,
      outletName: profile.outletName,
      reportNumber,
      status: "awaiting_supervisor_approval",
      reportedByUid: request.auth!.uid,
      reportedByName,
      reportedAt: now,
      photoPath: photo.path,
      photoData: photo.data,
      totalQty: normalizedLines.reduce((sum, line) => sum + line.qty, 0),
      lineCount: normalizedLines.length,
      whatsappNotifyStatus: null,
      whatsappNotifiedAt: null,
      whatsappNotifyError: null,
      createdAt: now,
      updatedAt: now,
    });

    normalizedLines.forEach((line, index) => {
      const lineRef = reportRef.collection("lines").doc();
      tx.set(lineRef, {
        ...line,
        sortOrder: index,
        createdAt: now,
      });
    });
  });

  return { reportId: reportRef.id };
});

async function resolveDamagePhotoUrlForWhatsApp(
  outletId: string,
  reportId: string,
  report: Record<string, unknown>,
): Promise<string | null> {
  const photoPath = String(report.photoPath ?? "").trim();
  if (photoPath) {
    const bucket = getAppStorageBucket();
    const [signedUrl] = await bucket.file(photoPath).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return signedUrl;
  }

  const inline = String(report.photoData ?? "").trim();
  if (!inline) return null;

  const storagePath = `damages/${outletId}/${reportId}/photo.jpg`;
  const bucket = getAppStorageBucket();
  await bucket.file(storagePath).save(parsePhotoBase64(inline), {
    contentType: "image/jpeg",
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  await getFirestore()
    .collection(COLLECTIONS.outletDamageReports)
    .doc(reportId)
    .set({ photoPath: storagePath, photoData: null, updatedAt: new Date().toISOString() }, { merge: true });

  const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return signedUrl;
}

async function sendApprovedDamageWhatsAppNotification(
  reportId: string,
  report: Record<string, unknown>,
  lines: Array<{ name: string; qty: number }>,
  supervisorName: string,
  reviewedAt: string,
): Promise<void> {
  const message = formatApprovedDamageWhatsAppMessage({
    outletName: String(report.outletName ?? "Outlet"),
    reportedAt: String(report.reportedAt ?? reviewedAt),
    reportNumber: String(report.reportNumber ?? reportId),
    reportedByName: String(report.reportedByName ?? "Outlet staff"),
    supervisorName,
    lines,
  });
  const photoUrl = await resolveDamagePhotoUrlForWhatsApp(
    String(report.outletId ?? ""),
    reportId,
    report,
  );
  if (photoUrl) {
    await sendWasenderGroupMessageWithImage(message, photoUrl);
  } else {
    await sendWasenderGroupMessage(message);
  }
}

export const reviewDamageReport = onCall(
  { region: "africa-south1", secrets: [wasenderApiKey, wasenderGroupId] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const profile = await requireAppUser(request.auth.uid);
    if (!isSupervisor(profile)) {
      throw new HttpsError("permission-denied", "Supervisor access required.");
    }

    const reportId = String(request.data?.reportId ?? "").trim();
    const decision = String(request.data?.decision ?? "").trim().toLowerCase();
    const declineReason = String(request.data?.declineReason ?? "").trim();

    if (!reportId) {
      throw new HttpsError("invalid-argument", "reportId is required.");
    }
    if (decision !== "accept" && decision !== "decline") {
      throw new HttpsError("invalid-argument", "decision must be accept or decline.");
    }

    const db = getFirestore();
    const reportRef = db.collection(COLLECTIONS.outletDamageReports).doc(reportId);
    const linesSnap = await reportRef.collection("lines").orderBy("sortOrder").get();
    const lines = linesSnap.docs.map((doc) => doc.data() as { name: string; qty: number });
    const now = new Date().toISOString();
    const supervisorName = resolveSupervisorDisplayName(profile);
    const nextStatus = decision === "accept" ? "accepted" : "declined";

    const reviewResult = await db.runTransaction(async (tx) => {
      const reportSnap = await tx.get(reportRef);
      if (!reportSnap.exists) {
        throw new HttpsError("not-found", "Damage report not found.");
      }
      const current = reportSnap.data() as Record<string, unknown>;
      const currentStatus = String(current.status ?? "");
      if (currentStatus !== "awaiting_supervisor_approval") {
        throw new HttpsError("failed-precondition", "This damage report has already been reviewed.");
      }
      if (decision === "accept" && String(current.whatsappNotifyStatus ?? "") === "sent") {
        throw new HttpsError("failed-precondition", "This damage report has already been approved and notified.");
      }

      tx.set(
        reportRef,
        {
          status: nextStatus,
          supervisorName: decision === "accept" ? supervisorName : null,
          supervisorReviewedByUid: request.auth!.uid,
          supervisorReviewedName: supervisorName,
          supervisorReviewedAt: now,
          acceptedAt: decision === "accept" ? now : null,
          declineReason: decision === "decline" ? declineReason || "Declined by supervisor" : null,
          whatsappNotifyStatus: decision === "accept" ? "pending" : "skipped",
          whatsappNotifyError: null,
          updatedAt: now,
        },
        { merge: true },
      );

      return current;
    });

    if (decision === "accept") {
      try {
        await sendApprovedDamageWhatsAppNotification(reportId, reviewResult, lines, supervisorName, now);
        await reportRef.set(
          {
            whatsappNotifyStatus: "sent",
            whatsappNotifiedAt: now,
            whatsappNotifyError: null,
          },
          { merge: true },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "WhatsApp send failed";
        await reportRef.set(
          {
            whatsappNotifyStatus: "failed",
            whatsappNotifyError: message,
          },
          { merge: true },
        );
      }
    }

    return { reportId, status: nextStatus };
  },
);

export const getDamageReportPhotoUrl = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "reportId is required.");
  }

  const db = getFirestore();
  const reportSnap = await db.collection(COLLECTIONS.outletDamageReports).doc(reportId).get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = reportSnap.data() as Record<string, unknown>;
  const outletId = String(report.outletId ?? "");
  if (outletId !== profile.outletId && !isSupervisor(profile)) {
    throw new HttpsError("permission-denied", "Not allowed to view this damage report.");
  }

  const inline = String(report.photoData ?? "").trim();
  if (inline) {
    return {
      dataUrl: inline.startsWith("data:") ? inline : `data:image/jpeg;base64,${inline}`,
    };
  }

  const photoPath = String(report.photoPath ?? "").trim();
  if (!photoPath) {
    throw new HttpsError("not-found", "Damage photo not available.");
  }

  const bucket = getAppStorageBucket();
  const [signedUrl] = await bucket.file(photoPath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return { signedUrl };
});

export const getDamageReportSignatureUrl = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const reportId = String(request.data?.reportId ?? "").trim();
  const role = String(request.data?.role ?? "").trim().toLowerCase();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "reportId is required.");
  }
  if (role !== "driver" && role !== "offloader") {
    throw new HttpsError("invalid-argument", "role must be driver or offloader.");
  }

  const db = getFirestore();
  const reportSnap = await db.collection(COLLECTIONS.outletDamageReports).doc(reportId).get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = reportSnap.data() as Record<string, unknown>;
  const outletId = String(report.outletId ?? "");
  if (outletId !== profile.outletId && !isSupervisor(profile)) {
    throw new HttpsError("permission-denied", "Not allowed to view this damage report.");
  }

  const inline =
    role === "driver"
      ? String(report.driver_signature_data ?? report.driverSignatureData ?? "").trim()
      : String(report.offloader_signature_data ?? report.offloaderSignatureData ?? "").trim();
  if (inline) {
    return {
      dataUrl: inline.startsWith("data:") ? inline : `data:image/png;base64,${inline}`,
    };
  }

  const signaturePath =
    role === "driver"
      ? String(report.driver_signature_path ?? report.driverSignaturePath ?? "").trim()
      : String(report.offloader_signature_path ?? report.offloaderSignaturePath ?? "").trim();
  if (!signaturePath) {
    throw new HttpsError("not-found", "Signature not available.");
  }

  const bucket = getAppStorageBucket();
  const [signedUrl] = await bucket.file(signaturePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return { signedUrl };
});

export const dispatchDamageReport = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!isSupervisor(profile)) {
    throw new HttpsError("permission-denied", "Supervisor access required.");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  const driverName = String(request.data?.driverName ?? "").trim();
  const driverSignatureBase64 = String(request.data?.driverSignatureBase64 ?? "").trim();
  if (!reportId || !driverName || !driverSignatureBase64) {
    throw new HttpsError("invalid-argument", "reportId, driverName, and driverSignatureBase64 are required.");
  }

  const db = getFirestore();
  const reportRef = db.collection(COLLECTIONS.outletDamageReports).doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = reportSnap.data() as { status?: string; outletId?: string };
  if (report.status !== "accepted") {
    throw new HttpsError("failed-precondition", "Only accepted damage reports can be dispatched.");
  }
  const outletId = String(report.outletId ?? "").trim();
  if (!outletId) {
    throw new HttpsError("failed-precondition", "Damage report outlet is missing.");
  }

  const now = new Date().toISOString();
  const signature = await persistDamageSignature(outletId, reportId, "driver", driverSignatureBase64);
  await reportRef.set(
    {
      status: "loaded",
      driverName,
      driver_signed_name: driverName,
      driver_signature_path: signature.path,
      driver_signature_data: signature.data,
      driver_signed_at: now,
      loadedAt: FieldValue.serverTimestamp(),
      updatedAt: now,
    },
    { merge: true },
  );
  return { ok: true };
});

export const completeDamageReport = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!isBranchUser(profile) && !isSupervisor(profile)) {
    throw new HttpsError("permission-denied", "Outlet access required.");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  const offloaderName = String(request.data?.offloaderName ?? "").trim();
  const offloaderSignatureBase64 = String(request.data?.offloaderSignatureBase64 ?? "").trim();
  if (!reportId || !offloaderName || !offloaderSignatureBase64) {
    throw new HttpsError(
      "invalid-argument",
      "reportId, offloaderName, and offloaderSignatureBase64 are required.",
    );
  }

  const db = getFirestore();
  const reportRef = db.collection(COLLECTIONS.outletDamageReports).doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = reportSnap.data() as { outletId?: string; status?: string };
  if (report.outletId !== profile.outletId) {
    throw new HttpsError("permission-denied", "You can only complete damage reports for your outlet.");
  }
  if (report.status !== "loaded") {
    throw new HttpsError("failed-precondition", "Damage report must be loaded before completion.");
  }

  const outletId = String(report.outletId ?? "").trim();
  const now = new Date().toISOString();
  const signature = await persistDamageSignature(outletId, reportId, "offloader", offloaderSignatureBase64);
  await reportRef.set(
    {
      status: "completed",
      offloader_signed_name: offloaderName,
      offloader_signature_path: signature.path,
      offloader_signature_data: signature.data,
      offloader_signed_at: now,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: now,
    },
    { merge: true },
  );
  return { ok: true };
});
