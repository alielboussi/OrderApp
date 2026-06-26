"use client";

import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import type { WarehouseAuditPayload } from "@/lib/warehouse-audit";

type WarehouseLogPayload = WarehouseAuditPayload;

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
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
      entity_name: payload.entity_name ?? null,
      details: payload.details ?? null,
    });
  } catch {
    // ignore logging failures
  }
}

export async function logMiddlewareDispatch(input: {
  page: string;
  entity_type: "product" | "variant";
  entity_id: string;
  entity_name: string;
  mode: "delete" | "update" | "schedule";
  outlets: Array<{ id: string; name: string }>;
  selected_keys?: string[];
}) {
  const outletDetails = input.outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }));

  await logWarehouseAction({
    action: "Send To Middleware",
    page: input.page,
    method: "POST",
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_name: input.entity_name,
    details: {
      mode: input.mode,
      selected_keys: input.selected_keys ?? [],
      outlets_sent_to: outletDetails,
    },
  });

  await logWarehouseAction({
    action: "Which Outlets Sent To",
    page: input.page,
    method: "POST",
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_name: input.entity_name,
    details: {
      mode: input.mode,
      outlets_sent_to: outletDetails,
    },
  });
}
