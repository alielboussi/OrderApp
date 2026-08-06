import { formatTransferOrderStatus } from "./transfer-order-status";

export function formatDamageReportStatus(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  switch (normalized) {
    case "awaiting_supervisor_approval":
      return "Awaiting supervisor approval";
    case "accepted":
    case "approved":
      return "Order Accepted";
    case "loaded":
      return "Loaded & On Route";
    case "completed":
      return "Completed";
    case "declined":
      return "Declined";
    default:
      return formatTransferOrderStatus(status);
  }
}

export function getDamageReportStatusTone(
  status: string | null | undefined,
): "pending" | "accepted" | "loaded" | "completed" | "declined" | "default" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "awaiting_supervisor_approval") return "pending";
  if (normalized === "accepted" || normalized === "approved") return "accepted";
  if (normalized === "loaded") return "loaded";
  if (normalized === "completed") return "completed";
  if (normalized === "declined") return "declined";
  return "default";
}

export function damageReportHasPhoto(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "accepted" ||
    normalized === "approved" ||
    normalized === "loaded" ||
    normalized === "completed"
  );
}
