import { NextRequest, NextResponse } from "next/server";

import { getFirestoreDb } from "@/lib/firebase-server";

import { isTransferOrderOnDate, resolveTransferOrderCreatedAt } from "@/lib/transfer-order-dates";

import { readCatalogOrderFieldsFromRow } from "@/lib/catalog-order-fields";

import { computeOrderTotalOrdered } from "@/lib/order-total-ordered";

import { resolveOrdersAppUom, resolveSupervisorUom } from "@/lib/orders-app-uom";

import { toSupervisorDisplayQty } from "@/lib/supervisor-uom-qty";



export const dynamic = "force-dynamic";



const ACCEPTED_STATUSES = new Set(["accepted", "loaded", "completed"]);



type CatalogLookup = Map<

  string,

  ReturnType<typeof readCatalogOrderFieldsFromRow>

>;



function catalogKey(productId: string, variantKey: string | null | undefined) {

  return `${productId}::${variantKey ?? ""}`;

}



async function loadCatalogLookup(outletId: string): Promise<CatalogLookup> {

  const db = getFirestoreDb();

  const snapshot = await db

    .collection("outlet_order_catalog")

    .where("outletId", "==", outletId)

    .where("active", "==", true)

    .get();



  const lookup: CatalogLookup = new Map();

  for (const doc of snapshot.docs) {

    const data = doc.data();

    const productId = String(data.productId ?? "").trim();

    if (!productId) continue;

    const row = readCatalogOrderFieldsFromRow(data);

    const variantKey = String(data.variantKey ?? "").trim();

    const variantId = String(data.variantId ?? "").trim();

    lookup.set(catalogKey(productId, variantKey), row);

    if (variantId) lookup.set(catalogKey(productId, variantId), row);

    if (!variantKey && !variantId) lookup.set(catalogKey(productId, ""), row);

  }

  return lookup;

}



function resolveCatalogRow(

  lookup: CatalogLookup,

  productId: string | null | undefined,

  variantKey: string | null | undefined,

) {

  const id = String(productId ?? "").trim();

  if (!id) return null;

  const key = String(variantKey ?? "").trim();

  return lookup.get(catalogKey(id, key)) ?? lookup.get(catalogKey(id, "")) ?? null;

}



export async function GET(request: NextRequest) {

  try {

    const url = new URL(request.url);

    const date = url.searchParams.get("date")?.trim();

    const outletId = url.searchParams.get("outlet_id")?.trim() || null;



    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {

      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });

    }



    const db = getFirestoreDb();

    const ordersSnap = await db.collection("transfer_orders").get();

    const orders = ordersSnap.docs

      .map((doc) => ({ id: doc.id, data: doc.data() }))

      .filter(({ data }) => {

        const sourceEventId = data.source_event_id ?? data.sourceEventId;

        if (sourceEventId != null && sourceEventId !== "") return false;

        const status = String(data.status ?? "").trim().toLowerCase();

        if (!ACCEPTED_STATUSES.has(status)) return false;

        const createdAt = resolveTransferOrderCreatedAt(data);

        if (!isTransferOrderOnDate(createdAt, date)) return false;

        const rowOutletId = String(data.outletId ?? data.outlet_id ?? "").trim();

        if (outletId && outletId !== "all" && rowOutletId !== outletId) return false;

        return true;

      });



    const catalogByOutlet = new Map<string, CatalogLookup>();

    const payload = [];



    for (const { id, data } of orders) {

      const rowOutletId = String(data.outletId ?? data.outlet_id ?? "").trim();

      if (!catalogByOutlet.has(rowOutletId)) {

        catalogByOutlet.set(rowOutletId, await loadCatalogLookup(rowOutletId));

      }

      const catalog = catalogByOutlet.get(rowOutletId) ?? new Map();



      const itemsSnap = await db.collection("transfer_orders").doc(id).collection("items").get();

      const items = itemsSnap.docs.map((itemDoc) => {

        const item = itemDoc.data();

        const productId = (item.productId as string | null | undefined) ?? null;

        const variantKey = (item.variantKey as string | null | undefined) ?? null;

        const outletQty = Number(item.qty ?? 0);

        const catalogRow = resolveCatalogRow(catalog, productId, variantKey);

        const perUnit = catalogRow?.supervisor_uom_qty_per_unit ?? 1;

        const ordersAppUom = catalogRow?.orders_app_uom ?? resolveOrdersAppUom(item);

        const supervisorUom = catalogRow?.supervisor_uom ?? resolveSupervisorUom(item, ordersAppUom);

        const supervisorQty = toSupervisorDisplayQty(outletQty, perUnit);

        const total = computeOrderTotalOrdered({

          outlet_qty: outletQty,

          supervisor_uom_qty_per_unit: perUnit,

          uom_weight_enabled: catalogRow?.uom_weight_enabled ?? false,

          uom_weight_grams: catalogRow?.uom_weight_grams ?? null,

          orders_app_uom: ordersAppUom,

          supervisor_uom: supervisorUom,

        });



        return {

          id: itemDoc.id,

          product_id: productId,

          variant_key: variantKey,

          name: String(item.name ?? ""),

          orders_app_uom: ordersAppUom,

          supervisor_uom: supervisorUom,

          supervisor_uom_qty_per_unit: perUnit,

          outlet_qty: outletQty,

          supervisor_qty: supervisorQty,

          uom_weight_enabled: total.uom_weight_enabled,

          ...(total.uom_weight_enabled ? { uom_weight_grams: total.uom_weight_grams } : {}),

          total_ordered: total.total_ordered,

          total_ordered_unit: total.total_ordered_unit,

          cost: Number(item.cost ?? 0),

          amount: Number(item.amount ?? Number(item.cost ?? 0) * outletQty),

        };

      });



      payload.push({

        id,

        order_number: data.orderNumber ?? data.order_number ?? null,

        outlet_id: rowOutletId,

        outlet_name: data.outletName ?? data.outlet_name ?? null,

        status: data.status ?? null,

        created_at: resolveTransferOrderCreatedAt(data),

        accepted_at: data.acceptedAt ?? data.accepted_at ?? data.supervisorEditedAt ?? null,

        supervisor_name: data.supervisorName ?? data.supervisor_name ?? null,

        items,

        totals: items.reduce(

          (acc, line) => {

            acc.amount += line.amount;

            return acc;

          },

          { amount: 0 },

        ),

      });

    }



    payload.sort((left, right) => {

      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;

      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

      return rightTime - leftTime;

    });



    return NextResponse.json({ orders: payload, cloud_backend: "firebase" });

  } catch (error) {

    console.error("[outlet-orders/accepted] GET failed", error);

    return NextResponse.json({ error: "Unable to load accepted outlet orders" }, { status: 500 });

  }

}


