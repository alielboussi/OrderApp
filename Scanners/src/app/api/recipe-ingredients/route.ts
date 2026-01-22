import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type RecipeRow = {
  ingredient_item_id: string | null;
  finished_item_id: string | null;
  finished_variant_key?: string | null;
  recipe_for_kind?: string | null;
  active?: boolean | null;
};

const normalizeVariantKey = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const finishedItemId = cleanUuid(url.searchParams.get("finished_item_id"));
    if (!finishedItemId) return NextResponse.json({ error: "finished_item_id is required" }, { status: 400 });

    const finishedVariantKey = normalizeVariantKey(url.searchParams.get("finished_variant_key"));
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("recipes")
      .select("ingredient_item_id, finished_item_id, finished_variant_key, recipe_for_kind, active")
      .eq("finished_item_id", finishedItemId)
      .eq("recipe_for_kind", "finished")
      .eq("active", true);

    if (error) throw error;

    const rows = Array.isArray(data) ? (data as RecipeRow[]) : [];
    const ingredientIds = Array.from(
      new Set(
        rows
          .filter((row) => normalizeVariantKey(row.finished_variant_key) === finishedVariantKey)
          .map((row) => row.ingredient_item_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    return NextResponse.json({ ingredient_item_ids: ingredientIds });
  } catch (error) {
    console.error("[recipe-ingredients] GET failed", error);
    return NextResponse.json({ error: "Unable to load recipe ingredients" }, { status: 500 });
  }
}
