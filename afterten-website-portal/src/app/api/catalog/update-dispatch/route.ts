import { NextResponse } from "next/server";
import {
  listFirestoreCatalogItems,
  listFirestoreCatalogVariants,
} from "@/lib/firestore-catalog-store";
import { insertFirestoreCatalogSyncRows } from "@/lib/firestore-catalog-sync";
import { middlewareFirestoreOutletIds } from "@/lib/firestore-catalog-outlet-push";

type CandidateRow = {
  key: string;
  entity_type: "item" | "variant";
  entity_id: string;
  title: string;
  sku: string | null;
  change_type: string;
  updated_at: null;
  payload: Record<string, unknown>;
};

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanedSkuList(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    if (!result.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      result.push(normalized);
    }
  }
  return result;
}

async function loadDeleteCandidates(): Promise<CandidateRow[]> {
  const [items, variants] = await Promise.all([
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: false }),
  ]);

  const finishedItems = items.filter((item) => String(item.item_kind ?? "").toLowerCase() === "finished");
  const finishedVariants = variants.filter((variant) => String(variant.item_kind ?? "").toLowerCase() === "finished");

  const variantsByItemId = new Map<string, string[]>();
  for (const row of finishedVariants) {
    const itemId = asText(row.item_id);
    if (!itemId) continue;
    const current = variantsByItemId.get(itemId) ?? [];
    variantsByItemId.set(itemId, cleanedSkuList([...current, typeof row.sku === "string" ? row.sku : null]));
  }

  const itemCandidates = finishedItems.map((item) => {
    const itemId = String(item.id ?? "");
    const itemName = typeof item.name === "string" ? item.name : itemId;
    const itemSku = typeof item.sku === "string" ? item.sku : null;
    const allVariantSkus = variantsByItemId.get(itemId) ?? [];
    const itemSkus = cleanedSkuList([itemSku]);
    return {
      key: `delete_item:${itemId}`,
      entity_type: "item" as const,
      entity_id: itemId,
      title: itemName,
      sku: itemSku,
      change_type: "delete_item",
      updated_at: null,
      payload: {
        delete_type: "item",
        item_sku: itemSku,
        item_skus: itemSkus,
        all_variant_skus: allVariantSkus,
        variant_skus: allVariantSkus,
        name: itemName,
      },
    };
  });

  const variantCandidates = finishedVariants.map((variant) => {
    const variantId = String(variant.id ?? "");
    const variantName = typeof variant.name === "string" ? variant.name : variantId;
    const variantSku = typeof variant.sku === "string" ? variant.sku : null;
    const variantSkus = cleanedSkuList([variantSku]);
    return {
      key: `delete_variant:${variantId}`,
      entity_type: "variant" as const,
      entity_id: variantId,
      title: variantName,
      sku: variantSku,
      change_type: "delete_variant",
      updated_at: null,
      payload: {
        delete_type: "variant",
        item_id: typeof variant.item_id === "string" ? variant.item_id : String(variant.item_id ?? ""),
        variant_sku: variantSku,
        variant_skus: variantSkus,
        variant_name: variantName,
      },
    };
  });

  return [...itemCandidates, ...variantCandidates];
}

export async function GET() {
  try {
    const candidates = await loadDeleteCandidates();
    return NextResponse.json({ candidates, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[catalog/update-dispatch] GET failed", error);
    return NextResponse.json({ error: "Unable to load delete candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const modeRaw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    if (modeRaw !== "delete") {
      return NextResponse.json(
        { error: "Only delete dispatch is supported. Use Send to Middleware for catalog pushes." },
        { status: 400 },
      );
    }

    const selectedKeys = Array.isArray(body?.selected_keys)
      ? body.selected_keys.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    if (!selectedKeys.length) {
      return NextResponse.json({ error: "Select at least one item to delete." }, { status: 400 });
    }

    const allMiddlewareOutletIds = await middlewareFirestoreOutletIds([]);
    if (!allMiddlewareOutletIds.length) {
      return NextResponse.json({ error: "No active middleware outlets found." }, { status: 400 });
    }

    const requestedOutletIds: string[] = Array.isArray(body?.outlet_ids)
      ? body.outlet_ids
          .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value: string) => value.trim())
      : [];

    const allowedMiddleware = new Set(allMiddlewareOutletIds);
    const outletIds =
      requestedOutletIds.length > 0
        ? requestedOutletIds.filter((outletId) => allowedMiddleware.has(outletId))
        : allMiddlewareOutletIds;

    if (!outletIds.length) {
      return NextResponse.json({ error: "No valid middleware outlets selected." }, { status: 400 });
    }

    const candidates = await loadDeleteCandidates();
    const chosen = candidates.filter((candidate) => selectedKeys.includes(candidate.key));
    if (!chosen.length) {
      return NextResponse.json({ error: "Selected items are no longer available." }, { status: 400 });
    }

    const rows: Array<{
      outlet_id: string;
      entity_type: string;
      entity_id: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const candidate of chosen) {
      for (const outletId of outletIds) {
        rows.push({
          outlet_id: outletId,
          entity_type: "delete",
          entity_id: candidate.entity_id,
          payload: { ...(candidate.payload ?? {}) },
        });
      }
    }

    await insertFirestoreCatalogSyncRows(rows);
    return NextResponse.json({
      ok: true,
      outlets: outletIds.length,
      events: rows.length,
      cloud_backend: "firebase",
    });
  } catch (error) {
    console.error("[catalog/update-dispatch] POST failed", error);
    return NextResponse.json({ error: "Unable to dispatch deletes" }, { status: 500 });
  }
}
