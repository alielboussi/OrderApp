import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import {
  nextPosItemSku,
  nextPosMenuGroupId,
  nextPosVariantSku,
  nextPosVariantSkuForItem,
} from "@/lib/pos-catalog-ids";

export async function GET(request: Request) {
  try {
    const itemId = new URL(request.url).searchParams.get("item_id")?.trim() || null;
    const supabase = getServiceClient();
    const [nextItemSku, nextVariantSku, nextMenuGroupId] = await Promise.all([
      nextPosItemSku(supabase),
      itemId ? nextPosVariantSkuForItem(supabase, itemId) : nextPosVariantSku(supabase),
      nextPosMenuGroupId(supabase),
    ]);

    return NextResponse.json({
      next_item_sku: nextItemSku,
      next_variant_sku: nextVariantSku,
      next_menu_group_id: nextMenuGroupId,
    });
  } catch (error) {
    console.error("[catalog/next-pos-ids] GET failed", error);
    return NextResponse.json({ error: "Unable to compute next POS IDs" }, { status: 500 });
  }
}
