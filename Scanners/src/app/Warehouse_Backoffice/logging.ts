"use client";

import { getWarehouseBrowserClient } from "@/lib/supabase-browser";

type WarehouseLogPayload = {
  action: string;
  page?: string | null;
  method?: string | null;
  status?: number | null;
  details?: Record<string, unknown> | null;
};

let lastLoggedAt = 0;

export async function logWarehouseAction(payload: WarehouseLogPayload) {
  try {
    const now = Date.now();
    if (now - lastLoggedAt < 150) return;
    lastLoggedAt = now;

    const supabase = getWarehouseBrowserClient();
    const session = await supabase.auth.getSession();
    const user = session.data.session?.user ?? null;
    const userId = user?.id ?? null;
    const userEmail = user?.email ?? null;

    await supabase.from("warehouse_backoffice_logs").insert({
      user_id: userId,
      user_email: userEmail,
      action: payload.action,
      page: payload.page ?? null,
      method: payload.method ?? null,
      status: payload.status ?? null,
      details: payload.details ?? null,
    });
  } catch {
    // ignore logging failures
  }
}
