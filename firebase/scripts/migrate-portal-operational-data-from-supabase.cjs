/**
 * Import portal operational data from Supabase → Firestore.
 *
 * Collections: warehouse_auth_accounts, warehouse_backoffice_logs,
 *   transfer_orders, transfer_order_items, warehouse_live_items,
 *   flow_traces, flow_trace_steps
 *
 * Run from firebase folder:
 *   node scripts/migrate-portal-operational-data-from-supabase.cjs
 *
 * Options (env):
 *   DRY_RUN=1
 *   LOG_LIMIT=10000
 *   FLOW_TRACE_LIMIT=5000
 *   TRANSFER_ORDER_DAYS=365  (only orders created within N days)
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const {
  KEY_PATH,
  getSupabaseConfig,
  fetchAllRows,
  commitBatches,
} = require("./lib/migrate-supabase-utils.cjs");

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const LOG_LIMIT = Number(process.env.LOG_LIMIT || 10000);
const FLOW_TRACE_LIMIT = Number(process.env.FLOW_TRACE_LIMIT || 5000);
const TRANSFER_ORDER_DAYS = Number(process.env.TRANSFER_ORDER_DAYS || 365);

const AUDIT_VIEWER_EMAILS = new Set(
  [
    "alielboussi00@gmail.com",
    "husseinelboussizam@gmail.com",
    "mohammadalboussi@gmail.com",
  ].map((e) => e.toLowerCase()),
);

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function variantKey(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || "base";
}

function stockDocId(warehouseId, itemId, variantKeyValue) {
  return `${warehouseId}__${itemId}__${variantKey(variantKeyValue)}`;
}

async function main() {
  const supabase = getSupabaseConfig();
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const migratedAt = new Date().toISOString();

  console.log(DRY_RUN ? "DRY RUN" : "Migrating portal operational data → Firestore...");
  console.log(`Supabase: ${supabase.url}\n`);

  const [authAccounts, auditViewers] = await Promise.all([
    fetchAllRows(supabase, "warehouse_auth_accounts", { order: "created_at" }),
    fetchAllRows(supabase, "warehouse_audit_viewers", { optional: true, order: "user_id" }),
  ]);

  const viewerIds = new Set((auditViewers || []).map((row) => row.user_id).filter(Boolean));

  await commitBatches(
    db,
    "warehouse_auth_accounts",
    authAccounts.map((row) => {
      const email = normalizeEmail(row.email);
      return {
        id: row.user_id,
        data: {
          userId: row.user_id,
          email: row.email ?? null,
          emailNormalized: email || null,
          active: row.active === true,
          createdAt: row.created_at ?? migratedAt,
          activatedAt: row.activated_at ?? null,
          canViewAuditLogs: viewerIds.has(row.user_id) || AUDIT_VIEWER_EMAILS.has(email),
          legacySupabaseUserId: row.user_id,
          migratedAt,
        },
      };
    }),
    "warehouse_auth_accounts",
    DRY_RUN,
  );

  const logs = await fetchAllRows(supabase, "warehouse_backoffice_logs", {
    order: "created_at.desc",
    limit: LOG_LIMIT,
  });

  await commitBatches(
    db,
    "warehouse_backoffice_logs",
    logs.map((row) => ({
      id: row.id,
      data: {
        ...row,
        createdAt: row.created_at,
        userId: row.user_id,
        userEmail: row.user_email,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityName: row.entity_name,
        migratedAt,
      },
    })),
    "warehouse_backoffice_logs",
    DRY_RUN,
  );

  const since = new Date();
  since.setDate(since.getDate() - TRANSFER_ORDER_DAYS);
  const sinceIso = since.toISOString();
  const transferOrders = await fetchAllRows(supabase, "orders", {
    order: "created_at.desc",
    filter: `&source_event_id=is.null&created_at=gte.${encodeURIComponent(sinceIso)}`,
  });

  await commitBatches(
    db,
    "transfer_orders",
    transferOrders.map((row) => ({
      id: row.id,
      data: {
        ...row,
        outletId: row.outlet_id,
        orderNumber: row.order_number,
        createdAt: row.created_at,
        migratedAt,
      },
    })),
    "transfer_orders",
    DRY_RUN,
  );

  const orderIds = transferOrders.map((row) => row.id).filter(Boolean);
  let orderItems = [];
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    const filter = `&order_id=in.(${chunk.map((id) => `"${id}"`).join(",")})`;
    const batch = await fetchAllRows(supabase, "order_items", {
      order: "order_id",
      filter,
    });
    orderItems = orderItems.concat(batch);
  }

  await commitBatches(
    db,
    "transfer_order_items",
    orderItems.map((row, index) => ({
      id: row.id || `${row.order_id}_${index}`,
      data: {
        ...row,
        orderId: row.order_id,
        receivingUom: row.receiving_uom,
        migratedAt,
      },
    })),
    "transfer_order_items",
    DRY_RUN,
  );

  const stockRows = await fetchAllRows(supabase, "warehouse_live_items", {
    order: "warehouse_id",
    optional: true,
  });

  await commitBatches(
    db,
    "warehouse_live_items",
    stockRows.map((row) => ({
      id: stockDocId(row.warehouse_id, row.item_id, row.variant_key),
      data: {
        ...row,
        warehouseId: row.warehouse_id,
        itemId: row.item_id,
        itemName: row.item_name,
        variantKey: variantKey(row.variant_key),
        netUnits: row.net_units,
        itemKind: row.item_kind,
        migratedAt,
      },
    })),
    "warehouse_live_items",
    DRY_RUN,
  );

  const flowTraces = await fetchAllRows(supabase, "flow_traces", {
    order: "created_at.desc",
    limit: FLOW_TRACE_LIMIT,
    optional: true,
  });

  await commitBatches(
    db,
    "flow_traces",
    flowTraces.map((row) => ({
      id: row.id,
      data: {
        ...row,
        flowBatchId: row.flow_batch_id,
        outletId: row.outlet_id,
        itemId: row.item_id,
        variantKey: variantKey(row.variant_key),
        warehouseId: row.warehouse_id,
        createdAt: row.created_at,
        migratedAt,
      },
    })),
    "flow_traces",
    DRY_RUN,
  );

  const traceIds = flowTraces.map((row) => row.id).filter(Boolean);
  let flowSteps = [];
  for (let i = 0; i < traceIds.length; i += 100) {
    const chunk = traceIds.slice(i, i + 100);
    const filter = `&trace_id=in.(${chunk.map((id) => `"${id}"`).join(",")})`;
    const batch = await fetchAllRows(supabase, "flow_trace_steps", {
      order: "occurred_at",
      filter,
      optional: true,
    });
    flowSteps = flowSteps.concat(batch);
  }

  await commitBatches(
    db,
    "flow_trace_steps",
    flowSteps.map((row, index) => ({
      id: row.id || `${row.trace_id}_${index}`,
      data: {
        ...row,
        traceId: row.trace_id,
        occurredAt: row.occurred_at,
        deltaUnits: row.delta_units,
        availableUnits: row.available_units,
        migratedAt,
      },
    })),
    "flow_trace_steps",
    DRY_RUN,
  );

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
