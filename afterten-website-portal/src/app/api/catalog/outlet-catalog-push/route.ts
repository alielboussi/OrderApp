import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { parseCatalogDeliveryTiming } from "@/lib/catalog-sync-schedule";
import {
  buildCatalogPushCandidates,
  buildCatalogRemoveCandidates,
  explainCatalogPushGap,
  loadCatalogPushPickerCatalog,
  pushCatalogCandidatesToOutlets,
  removeCatalogCandidatesFromOutlets,
  type CatalogPushScope,
} from "@/lib/catalog-outlet-push";
import {
  buildFirestoreCatalogPushCandidates,
  explainFirestoreCatalogPushGap,
  loadFirestoreCatalogPushPickerCatalog,
  loadFirestoreGroupCatalogData,
  middlewareFirestoreOutletIds,
} from "@/lib/firestore-catalog-outlet-push";
import { getServiceClient } from "@/lib/supabase-server";

function parseUuidList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

async function middlewareSupabaseOutletIds(requestedIds: string[]) {
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
      .filter((id): id is string => Boolean(id)),
  );

  return requestedIds.length > 0 ? requestedIds.filter((id) => allowed.has(id)) : Array.from(allowed);
}

function parseCatalogPushScope(body: Record<string, unknown>): CatalogPushScope | { error: string } {
  const raw = body.sync_scope;
  if (!raw || typeof raw !== "object") {
    return { sync_menu_groups: true, sync_products: true, sync_variants: true };
  }
  const scope = raw as Record<string, unknown>;
  const parsed: CatalogPushScope = {
    sync_menu_groups: scope.sync_menu_groups === true,
    sync_products: scope.sync_products === true,
    sync_variants: scope.sync_variants === true,
  };
  if (!parsed.sync_menu_groups && !parsed.sync_products && !parsed.sync_variants) {
    return { error: "Select at least one sync scope: menu groups, products, or variants." };
  }
  return parsed;
}

export async function GET() {
  try {
    if (useFirebaseBackend()) {
      const catalog = await loadFirestoreCatalogPushPickerCatalog();
      return NextResponse.json({ ...catalog, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const catalog = await loadCatalogPushPickerCatalog(supabase);
    return NextResponse.json(catalog);
  } catch (error) {
    console.error("[catalog/outlet-catalog-push] GET failed", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : "Unable to load menu groups for outlet push";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const firebase = useFirebaseBackend();
    const actionRaw = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "push";
    const action = actionRaw === "remove" ? "remove" : "push";
    const menuGroupIds = parseUuidList(body?.menu_group_ids);
    const itemIds = parseUuidList(body?.item_ids);
    const variantIds = parseUuidList(body?.variant_ids);
    const scopeResult = parseCatalogPushScope(body as Record<string, unknown>);
    if ("error" in scopeResult) {
      return NextResponse.json({ error: scopeResult.error }, { status: 400 });
    }
    const scope = scopeResult;

    const menuGroupOnly = scope.sync_menu_groups && !scope.sync_products && !scope.sync_variants;

    if (menuGroupOnly && !menuGroupIds.length) {
      return NextResponse.json({ error: "Select at least one menu group." }, { status: 400 });
    }

    if (!menuGroupOnly && !menuGroupIds.length && !itemIds.length && !variantIds.length) {
      return NextResponse.json(
        { error: "Select at least one menu group, product, or variant." },
        { status: 400 },
      );
    }

    if (
      !menuGroupOnly &&
      scope.sync_products &&
      !scope.sync_menu_groups &&
      !itemIds.length &&
      !menuGroupIds.length
    ) {
      return NextResponse.json({ error: "Select products or a menu group to sync products." }, { status: 400 });
    }

    if (
      !menuGroupOnly &&
      scope.sync_variants &&
      !scope.sync_menu_groups &&
      !variantIds.length &&
      !itemIds.length &&
      !menuGroupIds.length
    ) {
      return NextResponse.json(
        { error: "Select variants, products, or a menu group to sync variants." },
        { status: 400 },
      );
    }

    const requestedOutletIds = parseUuidList(body?.outlet_ids);
    const outletIds = firebase
      ? await middlewareFirestoreOutletIds(requestedOutletIds)
      : await middlewareSupabaseOutletIds(requestedOutletIds);
    if (!outletIds.length) {
      return NextResponse.json({ error: "No valid middleware outlets selected." }, { status: 400 });
    }

    const includeEmptyGroups = body?.include_empty_groups === true;
    const deliveryTiming = parseCatalogDeliveryTiming(body);
    if ("error" in deliveryTiming) {
      return NextResponse.json({ error: deliveryTiming.error }, { status: 400 });
    }

    const syncMode = body?.update_existing === true ? "upsert" : "insert_only";
    const syncOptions = { scheduledAt: deliveryTiming.scheduledAt, syncMode } as const;

    if (action === "remove") {
      const candidates = firebase
        ? await buildCatalogRemoveCandidates(
            null,
            menuGroupIds,
            { includeEmptyGroups },
            await loadFirestoreGroupCatalogData(menuGroupIds),
          )
        : await buildCatalogRemoveCandidates(getServiceClient(), menuGroupIds, { includeEmptyGroups });

      if (!candidates.length) {
        return NextResponse.json(
          {
            error:
              "Nothing to remove for the selected groups. Enable empty groups or assign finished products first.",
          },
          { status: 400 },
        );
      }

      const eventIds = await removeCatalogCandidatesFromOutlets(
        firebase ? null : getServiceClient(),
        outletIds,
        candidates,
        syncOptions,
      );
      const groupCount = candidates.filter((row) => row.catalog_entity_type === "menu_group").length;
      const itemCount = candidates.filter((row) => row.catalog_entity_type === "item").length;
      const variantCount = candidates.filter((row) => row.catalog_entity_type === "variant").length;

      return NextResponse.json({
        ok: true,
        action: "remove",
        delivery: deliveryTiming.delivery,
        scheduled_at: deliveryTiming.scheduledAt,
        outlets: outletIds.length,
        outlet_ids: outletIds,
        menu_group_ids: menuGroupIds,
        sent: {
          menu_groups: groupCount,
          items: itemCount,
          variants: variantCount,
          total: candidates.length,
        },
        event_ids: eventIds,
        ...(firebase ? { cloud_backend: "firebase" as const } : {}),
      });
    }

    const candidates = firebase
      ? await buildFirestoreCatalogPushCandidates(menuGroupIds, {
          includeEmptyGroups,
          scope,
          item_ids: itemIds,
          variant_ids: variantIds,
        })
      : await buildCatalogPushCandidates(getServiceClient(), menuGroupIds, {
          includeEmptyGroups,
          scope,
          item_ids: itemIds,
          variant_ids: variantIds,
        });

    if (!candidates.length) {
      const detail = firebase
        ? await explainFirestoreCatalogPushGap(menuGroupIds)
        : await explainCatalogPushGap(getServiceClient(), menuGroupIds);
      return NextResponse.json({ error: detail }, { status: 400 });
    }

    const eventIds = await pushCatalogCandidatesToOutlets(
      firebase ? null : getServiceClient(),
      outletIds,
      candidates,
      syncOptions,
    );
    const groupCount = candidates.filter((row) => row.entity_type === "menu_group").length;
    const itemCount = candidates.filter((row) => row.entity_type === "item").length;
    const variantCount = candidates.filter((row) => row.entity_type === "variant").length;

    return NextResponse.json({
      ok: true,
      action: "push",
      delivery: deliveryTiming.delivery,
      scheduled_at: deliveryTiming.scheduledAt,
      sync_mode: syncMode,
      sync_scope: scope,
      outlets: outletIds.length,
      outlet_ids: outletIds,
      menu_group_ids: menuGroupIds,
      item_ids: itemIds,
      variant_ids: variantIds,
      sent: {
        menu_groups: groupCount,
        items: itemCount,
        variants: variantCount,
        total: candidates.length,
      },
      event_ids: eventIds,
      ...(firebase ? { cloud_backend: "firebase" as const } : {}),
    });
  } catch (error) {
    console.error("[catalog/outlet-catalog-push] POST failed", error);
    return NextResponse.json({ error: "Unable to push catalog to outlets" }, { status: 500 });
  }
}
