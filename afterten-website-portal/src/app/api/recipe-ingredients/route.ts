import { NextResponse } from "next/server";
import { listFirestoreRecipeIngredientIds } from "@/lib/firestore-recipes";

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

    const ingredientIds = await listFirestoreRecipeIngredientIds(finishedItemId, finishedVariantKey);
return NextResponse.json({ ingredient_item_ids: ingredientIds, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-ingredients] GET failed", error);
    return NextResponse.json({ error: "Unable to load recipe ingredients" }, { status: 500 });
  }
}
