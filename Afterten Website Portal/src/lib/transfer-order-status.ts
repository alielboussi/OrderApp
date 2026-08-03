export function formatTransferOrderStatus(status: string | null | undefined): string {
  const normalized = normalizeTransferOrderStatus(status);
  switch (normalized) {
    case "order_placed":
    case "placed":
      return "Order Placed";
    case "accepted":
      return "Order Accepted";
    case "loaded":
      return "Loaded & On Route";
    case "completed":
      return "Completed";
    case "offloaded":
      return "Offloaded";
    default:
      return status?.trim() || "-";
  }
}

export function normalizeTransferOrderStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

export function canDownloadTransferOrderPdf(_status?: string | null): boolean {
  return true;
}

export function getTransferOrderStatusTone(
  status: string | null | undefined,
): "placed" | "accepted" | "loaded" | "completed" | "offloaded" | "default" {
  const normalized = normalizeTransferOrderStatus(status);
  if (normalized === "order_placed" || normalized === "placed") return "placed";
  if (normalized === "accepted") return "accepted";
  if (normalized === "loaded") return "loaded";
  if (normalized === "completed") return "completed";
  if (normalized === "offloaded") return "offloaded";
  return "default";
}

export function isPortalTransferOrderEditable(status: string | null | undefined): boolean {
  const normalized = normalizeTransferOrderStatus(status);
  return normalized === "order_placed" || normalized === "placed" || normalized === "accepted";
}
