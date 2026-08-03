import type { SupabaseClient } from "@supabase/supabase-js";

export type OutletCashierRow = {
  id: string;
  outlet_id: string;
  name: string;
  username: string;
  user_type: string;
  pos_user_id: number | null;
  sync_status: "pending_insert" | "synced" | "pending_delete" | "deleted";
  active: boolean;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

export type CashierSyncAction = "insert" | "delete" | "pull";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export function cleanText(value: unknown, maxLen = 200): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export function validateCashierPassword(password: string): string | null {
  const trimmed = password.trim();
  if (!trimmed) return "Password is required before sending the cashier to MintPOS.";
  if (trimmed.length < 3) return "Password must be at least 3 characters.";
  if (trimmed.length > 32) return "Password must be 32 characters or fewer.";
  return null;
}

export async function enqueueCashierSyncEvent(
  supabase: SupabaseClient,
  params: {
    outletId: string;
    cashierId?: string | null;
    action: CashierSyncAction;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("outlet_cashier_sync_events")
    .insert({
      outlet_id: params.outletId,
      cashier_id: params.cashierId ?? null,
      action: params.action,
      payload: params.payload,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to enqueue cashier sync event");
  }
  if (!data?.id) {
    throw new Error("Failed to enqueue cashier sync event");
  }
  return String(data.id);
}
