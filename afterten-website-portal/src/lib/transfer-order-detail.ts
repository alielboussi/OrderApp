import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";
import {
  listFirestoreTransferOrderItems,
  type FirestoreTransferOrderItem,
} from "@/lib/firestore-transfer-orders";
import { formatTransferOrderStatus, normalizeTransferOrderStatus } from "@/lib/transfer-order-status";

type TimelineStep = {
  step: string;
  label: string;
  at: string | null;
  by: string | null;
  details?: string | null;
};

export type TransferOrderDetailResponse = {
  order: {
    id: string;
    order_number: string | null;
    status: string | null;
    status_label: string;
    outlet: {
      id: string | null;
      name: string | null;
    };
    totals: {
      qty: number;
      amount: number;
    };
    flags: {
      locked: boolean;
      modified_by_supervisor: boolean;
    };
    created_at: string | null;
    updated_at: string | null;
  };
  timeline: TimelineStep[];
  participants: {
    employee: { name: string | null; signed_at: string | null };
    supervisor: {
      name: string | null;
      signed_at: string | null;
      edited_name: string | null;
      edited_at: string | null;
    };
    driver: { name: string | null; signed_at: string | null };
    offloader: { name: string | null; signed_at: string | null };
  };
  items: Array<{
    id: string;
    product_id: string | null;
    variant_key: string | null;
    name: string | null;
    qty: number | null;
    receiving_uom: string | null;
    consumption_uom: string | null;
    cost: number | null;
    amount: number | null;
    package_contains: number | null;
  }>;
};

function toIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildTimeline(data: Record<string, unknown>, status: string | null): TimelineStep[] {
  const normalized = normalizeTransferOrderStatus(status);
  const employeeName =
    pickString(data, ["employee_signed_name", "employeeSignedName", "employeeName"]) ?? null;
  const supervisorName = pickString(data, ["supervisor_signed_name", "supervisorSignedName", "supervisorName"]);
  const supervisorEditedName = pickString(data, ["supervisorEditedName", "supervisor_edited_name"]);
  const driverName = pickString(data, ["driver_signed_name", "driverSignedName", "driverName"]);
  const offloaderName = pickString(data, ["offloader_signed_name", "offloaderSignedName"]);
  const modifiedBySupervisor = Boolean(data.modifiedBySupervisor ?? data.modified_by_supervisor);

  const steps: TimelineStep[] = [
    {
      step: "order_placed",
      label: "Order Placed",
      at: toIso(data.createdAt ?? data.created_at),
      by: employeeName,
    },
  ];

  if (supervisorName || (normalized !== "order_placed" && normalized !== "placed")) {
    steps.push({
      step: "accepted",
      label: modifiedBySupervisor ? "Edited & Accepted by Supervisor" : "Accepted by Supervisor",
      at: toIso(data.acceptedAt ?? data.accepted_at ?? data.supervisor_signed_at ?? data.supervisorSignedAt),
      by: supervisorName,
      details: supervisorEditedName ? `Edited by ${supervisorEditedName}` : null,
    });
  }

  if (driverName || normalized === "loaded" || normalized === "completed") {
    steps.push({
      step: "loaded",
      label: "Loaded & On Route",
      at: toIso(data.loadedAt ?? data.loaded_at ?? data.driver_signed_at ?? data.driverSignedAt),
      by: driverName,
    });
  }

  if (offloaderName || normalized === "completed") {
    steps.push({
      step: "completed",
      label: "Delivery Completed at Outlet",
      at: toIso(
        data.completedAt ??
          data.completed_at ??
          data.offloader_signed_at ??
          data.offloaderSignedAt,
      ),
      by: offloaderName,
    });
  }

  return steps.filter((step) => step.at || step.by);
}

function mapItems(items: FirestoreTransferOrderItem[]) {
  return items.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    variant_key: item.variant_key,
    name: item.name,
    qty: item.qty,
    receiving_uom: item.receiving_uom,
    consumption_uom: item.consumption_uom,
    cost: item.cost,
    amount: item.amount,
    package_contains: item.package_contains,
  }));
}

function sumItems(items: FirestoreTransferOrderItem[]) {
  return items.reduce(
    (acc, item) => {
      const qty = Number(item.qty ?? 0);
      const amount = Number(item.amount ?? (item.cost ?? 0) * qty);
      acc.qty += Number.isFinite(qty) ? qty : 0;
      acc.amount += Number.isFinite(amount) ? amount : 0;
      return acc;
    },
    { qty: 0, amount: 0 },
  );
}

export async function getFirestoreTransferOrderDetail(orderId: string): Promise<TransferOrderDetailResponse | null> {
  const db = getFirestoreDb();
  const snap = await db.collection("transfer_orders").doc(orderId).get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  const sourceEventId = data.source_event_id ?? data.sourceEventId;
  if (sourceEventId != null && sourceEventId !== "") return null;

  const items = await listFirestoreTransferOrderItems(orderId);
  const totals = sumItems(items);
  const outletId = pickString(data, ["outletId", "outlet_id"]);
  let outletName = pickString(data, ["outletName", "outlet_name"]);
  if (outletId && !outletName) {
    const outletSnap = await db.collection("outlets").doc(outletId).get();
    outletName = pickString((outletSnap.data() ?? {}) as Record<string, unknown>, ["name"]);
  }

  const status = pickString(data, ["status"]);
  return {
    order: {
      id: snap.id,
      order_number: pickString(data, ["orderNumber", "order_number"]),
      status,
      status_label: formatTransferOrderStatus(status),
      outlet: {
        id: outletId,
        name: outletName,
      },
      totals,
      flags: {
        locked: Boolean(data.locked),
        modified_by_supervisor: Boolean(data.modifiedBySupervisor ?? data.modified_by_supervisor),
      },
      created_at: toIso(data.createdAt ?? data.created_at),
      updated_at: toIso(data.updatedAt ?? data.updated_at),
    },
    timeline: buildTimeline(data, status),
    participants: {
      employee: {
        name: pickString(data, ["employee_signed_name", "employeeSignedName", "employeeName"]),
        signed_at: toIso(data.employee_signed_at ?? data.employeeSignedAt),
      },
      supervisor: {
        name: pickString(data, ["supervisor_signed_name", "supervisorSignedName", "supervisorName"]),
        signed_at: toIso(data.supervisor_signed_at ?? data.supervisorSignedAt ?? data.acceptedAt ?? data.accepted_at),
        edited_name: pickString(data, ["supervisorEditedName", "supervisor_edited_name"]),
        edited_at: toIso(data.supervisorEditedAt ?? data.supervisor_edited_at),
      },
      driver: {
        name: pickString(data, ["driver_signed_name", "driverSignedName", "driverName"]),
        signed_at: toIso(data.driver_signed_at ?? data.driverSignedAt ?? data.loadedAt ?? data.loaded_at),
      },
      offloader: {
        name: pickString(data, ["offloader_signed_name", "offloaderSignedName"]),
        signed_at: toIso(data.offloader_signed_at ?? data.offloaderSignedAt ?? data.completedAt ?? data.completed_at),
      },
    },
    items: mapItems(items),
  };
}

export async function getTransferOrderDetail(orderId: string): Promise<TransferOrderDetailResponse | null> {
  return getFirestoreTransferOrderDetail(orderId);
}
