import "server-only";

import { isSupabaseBackend } from "@/lib/cloud-backend";
import {
  fetchFirestorePosSales,
  loadFirestorePosSalesStats,
  loadFirestoreTransferOrderStats,
  type FirestorePosSalesQuery,
} from "@/lib/firestore-pos-sales";
import { fetchSupabasePosSales, loadSupabasePosSalesStats } from "@/lib/supabase-pos-sales";
import type { PosSalesStats, PosSalesStatsQuery } from "@/lib/posSalesStats";

export type { FirestorePosSalesQuery as PosSalesQuery };

export async function fetchPosSales(query: FirestorePosSalesQuery) {
  if (isSupabaseBackend()) return fetchSupabasePosSales(query);
  return fetchFirestorePosSales(query);
}

export async function loadPosSalesStats(query: PosSalesStatsQuery): Promise<PosSalesStats> {
  if (isSupabaseBackend()) return loadSupabasePosSalesStats(query);
  return loadFirestorePosSalesStats(query);
}

export async function loadTransferOrderStats(
  outletIds: string[],
  fromIso: string,
  toIso: string,
) {
  if (isSupabaseBackend()) {
    return {
      order_count: 0,
      most_ordered: null as { name: string; qty: number } | null,
      least_ordered: null as { name: string; qty: number } | null,
    };
  }
  return loadFirestoreTransferOrderStats(outletIds, fromIso, toIso);
}
