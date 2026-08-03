import { NextResponse } from "next/server";
import {
  nextFirestorePosItemSku,
  nextFirestorePosMenuGroupId,
  nextFirestorePosVariantSku,
  nextFirestorePosVariantSkuForItem,
} from "@/lib/firestore-pos-catalog-ids";

export async function GET(request: Request) {
  try {
    const itemId = new URL(request.url).searchParams.get("item_id")?.trim() || null;

    const [nextItemSku, nextVariantSku, nextMenuGroupId] = await Promise.all([
      nextFirestorePosItemSku(),
      itemId ? nextFirestorePosVariantSkuForItem(itemId) : nextFirestorePosVariantSku(),
      nextFirestorePosMenuGroupId(),
    ]);

    return NextResponse.json({
      next_item_sku: nextItemSku,
      next_variant_sku: nextVariantSku,
      next_menu_group_id: nextMenuGroupId,
      cloud_backend: "firebase",
    });
  } catch (error) {
    console.error("[catalog/next-pos-ids] GET failed", error);
    return NextResponse.json({ error: "Unable to compute next POS IDs" }, { status: 500 });
  }
}
