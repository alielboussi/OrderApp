import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type ChainStepPayload = {
  step_order: number;
  from_uom: string;
  to_uom: string;
  multiplier: number;
};

type RecipeUomProfile = {
  id: string;
  item_id: string;
  variant_key: string;
  source_uom: string;
  target_uom: string;
};

type RecipeUomStep = {
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
    const supabase = getServiceClient();

    const { data: profile, error: profileError } = await supabase
      .from("recipe_uom_profiles")
      .select("id,item_id,variant_key,source_uom,target_uom")
      .eq("item_id", itemId)
      .eq("variant_key", variantKey)
      .eq("active", true)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ profile: null, steps: [] });
    }

    const { data: steps, error: stepsError } = await supabase
      .from("recipe_uom_chain_steps")
      .select("step_order,from_uom,to_uom,multiplier")
      .eq("profile_id", profile.id)
      .order("step_order", { ascending: true });

    if (stepsError) throw stepsError;

    return NextResponse.json({ profile, steps: steps ?? [] });
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

    const supabase = getServiceClient();

    const { data: profileId, error: upsertError } = await supabase.rpc("upsert_recipe_uom_profile", {
      p_item_id: itemId,
      p_variant_key: variantKey,
      p_source_uom: sourceUom,
      p_target_uom: targetUom,
    });

    if (upsertError) throw upsertError;

    if (!profileId) {
      return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
    }

    const { error: replaceError } = await supabase.rpc("replace_recipe_uom_chain", {
      p_profile_id: profileId,
      p_steps: steps.map((step) => ({
        step_order: step.step_order,
        from_uom: step.from_uom,
        to_uom: step.to_uom,
        multiplier: step.multiplier,
      })),
    });

    if (replaceError) throw replaceError;

    const { data: profile, error: profileError } = await supabase
      .from("recipe_uom_profiles")
      .select("id,item_id,variant_key,source_uom,target_uom")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) throw profileError;

    return NextResponse.json({ profile, steps });
  } catch (error) {
    console.error("[recipe-uom] POST failed", error);
    return NextResponse.json({ error: "Unable to save recipe UOM profile" }, { status: 500 });
  }
}
