import { NextResponse } from "next/server";
import {
  getFirestoreRecipeUomProfile,
  upsertFirestoreRecipeUomProfile,
} from "@/lib/firestore-recipes";

type ChainStepPayload = {
  step_order: number;
  from_uom: string;
  to_uom: string;
  multiplier: number;
};

const normalizeVariantKey = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

const cleanText = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = cleanUuid(url.searchParams.get("item_id"));
    if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

    const variantKey = normalizeVariantKey(url.searchParams.get("variant_key"));

    const result = await getFirestoreRecipeUomProfile(itemId, variantKey);
return NextResponse.json({ ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-uom] GET failed", error);
    return NextResponse.json({ error: "Unable to load recipe UOM profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const itemId = cleanUuid(payload.item_id);
    if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

    const variantKey = normalizeVariantKey(payload.variant_key);
    const sourceUom = cleanText(payload.source_uom);
    const targetUom = cleanText(payload.target_uom);
    if (!sourceUom || !targetUom) {
      return NextResponse.json({ error: "source_uom and target_uom are required" }, { status: 400 });
    }

    const rawSteps = Array.isArray(payload.steps)
      ? (payload.steps as Array<Partial<ChainStepPayload>>)
      : [];
    const steps: ChainStepPayload[] = rawSteps
      .map((step: Partial<ChainStepPayload>, index: number) => ({
        step_order: typeof step.step_order === "number" ? step.step_order : index + 1,
        from_uom: cleanText(step.from_uom) ?? "",
        to_uom: cleanText(step.to_uom) ?? "",
        multiplier: typeof step.multiplier === "number" ? step.multiplier : Number(step.multiplier),
      }))
      .filter(
        (step: ChainStepPayload) =>
          step.from_uom && step.to_uom && Number.isFinite(step.multiplier) && step.multiplier > 0
      );

    const result = await upsertFirestoreRecipeUomProfile({
  itemId,
  variantKey,
  sourceUom,
  targetUom,
  steps,
});
return NextResponse.json({ ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-uom] POST failed", error);
    return NextResponse.json({ error: "Unable to save recipe UOM profile" }, { status: 500 });
  }
}
