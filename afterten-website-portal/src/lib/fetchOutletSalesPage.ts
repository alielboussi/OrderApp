import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

type OutletSalesQuery = {
  outletIds: string[];
  fromIso: string;
  toIso: string;
  select: string;
};

export async function fetchOutletSalesPage<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  query: OutletSalesQuery
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let request = supabase
      .from("outlet_sales")
      .select(query.select)
      .gte("sold_at", query.fromIso)
      .lte("sold_at", query.toIso)
      .order("sold_at", { ascending: true })
      .range(from, to);

    if (query.outletIds.length > 0) {
      request = request.in("outlet_id", query.outletIds);
    }

    const { data, error } = await request;
    if (error) throw error;

    const batch = (data as unknown as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}
