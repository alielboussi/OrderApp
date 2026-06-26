import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { parseCatalogDeliveryTiming } from "@/lib/catalog-sync-schedule";
import {  buildCatalogPushCandidates,
  buildCatalogRemoveCandidates,
  loadMenuGroupPushSummaries,
  pushCatalogCandidatesToOutlets,
  removeCatalogCandidatesFromOutlets,
} from "@/lib/catalog-outlet-push";

function parseUuidList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

async function middlewareOutletIds(requestedIds: string[]) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id")
    .eq("active", true)
    .eq("has_pos_middleware", true);
  if (error) throw error;

  const allowed = new Set(
    (data ?? [])
      .map((row) => (row as { id?: string }).id)
      .filter((id): id is string => Boolean(id))
  );

  const outletIds =
    requestedIds.length > 0 ? requestedIds.filter((id) => allowed.has(id)) : Array.from(allowed);

  return outletIds;
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const groups = await loadMenuGroupPushSummaries(supabase);
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("[catalog/outlet-catalog-push] GET failed", error);
    return NextResponse.json({ error: "Unable to load menu groups for outlet push" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const actionRaw = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "push";
    const action = actionRaw === "remove" ? "remove" : "push";
    const menuGroupIds = parseUuidList(body?.menu_group_ids);
    if (!menuGroupIds.length) {
      return NextResponse.json({ error: "Select at least one menu group." }, { status: 400 });
    }

    const requestedOutletIds = parseUuidList(body?.outlet_ids);
    const outletIds = await middlewareOutletIds(requestedOutletIds);
    if (!outletIds.length) {
      return NextResponse.json({ error: "No valid middleware outlets selected." }, { status: 400 });
    }

    const includeEmptyGroups = body?.include_empty_groups === true;
    const deliveryTiming = parseCatalogDeliveryTiming(body);
    if ("error" in deliveryTiming) {
      return NextResponse.json({ error: deliveryTiming.error }, { status: 400 });
    }

    const supabase = getServiceClient();
    const syncMode = body?.update_existing === true ? "upsert" : "insert_only";
    const syncOptions = { scheduledAt: deliveryTiming.scheduledAt, syncMode } as const;

    if (action === "remove") {      const candidates = await buildCatalogRemoveCandidates(supabase, menuGroupIds, {
        includeEmptyGroups,
      });

      if (!candidates.length) {
        return NextResponse.json(
          {
            error:
              "Nothing to remove for the selected groups. Enable empty groups or assign finished products first.",
          },
          { status: 400 }
        );
      }

      await removeCatalogCandidatesFromOutlets(supabase, outletIds, candidates, syncOptions);

      const groupCount = candidates.filter((row) => row.catalog_entity_type === "menu_group").length;
      const itemCount = candidates.filter((row) => row.catalog_entity_type === "item").length;
      const variantCount = candidates.filter((row) => row.catalog_entity_type === "variant").length;

      return NextResponse.json({
        ok: true,
        action: "remove",
        delivery: deliveryTiming.delivery,
        scheduled_at: deliveryTiming.scheduledAt,        outlets: outletIds.length,
        outlet_ids: outletIds,
        menu_group_ids: menuGroupIds,
        sent: {
          menu_groups: groupCount,
          items: itemCount,
          variants: variantCount,
          total: candidates.length,
        },
      });
    }

    const candidates = await buildCatalogPushCandidates(supabase, menuGroupIds, {
      includeEmptyGroups,
    });

    if (!candidates.length) {
      return NextResponse.json(
        {
          error:
            "No catalog rows to send for the selected groups. Assign finished products to those groups first.",
        },
        { status: 400 }
      );
    }

    await pushCatalogCandidatesToOutlets(supabase, outletIds, candidates, syncOptions);

    const groupCount = candidates.filter((row) => row.entity_type === "menu_group").length;
    const itemCount = candidates.filter((row) => row.entity_type === "item").length;
    const variantCount = candidates.filter((row) => row.entity_type === "variant").length;

      return NextResponse.json({
        ok: true,
        action: "push",
        delivery: deliveryTiming.delivery,
        scheduled_at: deliveryTiming.scheduledAt,
        sync_mode: syncMode,      outlets: outletIds.length,
      outlet_ids: outletIds,
      menu_group_ids: menuGroupIds,
      sent: {
        menu_groups: groupCount,
        items: itemCount,
        variants: variantCount,
        total: candidates.length,
      },
    });
  } catch (error) {
    console.error("[catalog/outlet-catalog-push] POST failed", error);
    return NextResponse.json({ error: "Unable to push catalog to outlets" }, { status: 500 });
  }
}
