[
  {
    "schema_export": {
      "views": [
        {
          "view_name": "outlet_stock_summary",
          "definition": " SELECT osb.outlet_id,\n    osb.item_id,\n    ci.name AS item_name,\n    osb.variant_key,\n    osb.sent_units,\n    osb.consumed_units,\n    osb.on_hand_units\n   FROM (outlet_stock_balances osb\n     LEFT JOIN catalog_items ci ON ((ci.id = osb.item_id)));",
          "view_schema": "public"
        },
        {
          "view_name": "v_hub_warehouses",
          "definition": " SELECT id,\n    name,\n    code,\n    parent_warehouse_id,\n    created_at,\n    updated_at,\n    active,\n    outlet_id,\n    auto_open_stock_period,\n    warehouse_scope\n   FROM warehouses w\n  WHERE ((warehouse_scope = 'hub'::text) AND COALESCE(active, true));",
          "view_schema": "public"
        },
        {
          "view_name": "v_outlet_live_balances",
          "definition": " SELECT osb.outlet_id,\n    o.name AS outlet_name,\n    osb.item_id,\n    ci.name AS item_name,\n    ci.sku AS item_sku,\n    osb.variant_key,\n    osb.sent_units,\n    osb.consumed_units,\n    osb.on_hand_units,\n    osb.updated_at\n   FROM ((outlet_stock_balances osb\n     JOIN outlets o ON ((o.id = osb.outlet_id)))\n     JOIN catalog_items ci ON ((ci.id = osb.item_id)))\n  WHERE COALESCE(o.active, true);",
          "view_schema": "public"
        },
        {
          "view_name": "v_outlet_warehouse_ledger_balances",
          "definition": " SELECT ow.outlet_id,\n    o.name AS outlet_name,\n    sl.warehouse_id,\n    w.name AS warehouse_name,\n    sl.item_id,\n    ci.name AS item_name,\n    ci.sku AS item_sku,\n    sl.variant_key,\n    sum(sl.delta_units) AS net_units\n   FROM ((((stock_ledger sl\n     JOIN outlet_warehouses ow ON ((ow.warehouse_id = sl.warehouse_id)))\n     JOIN outlets o ON ((o.id = ow.outlet_id)))\n     JOIN warehouses w ON ((w.id = sl.warehouse_id)))\n     JOIN catalog_items ci ON ((ci.id = sl.item_id)))\n  WHERE COALESCE(o.active, true)\n  GROUP BY ow.outlet_id, o.name, sl.warehouse_id, w.name, sl.item_id, ci.name, ci.sku, sl.variant_key\n HAVING (abs(sum(sl.delta_units)) > 0.0001);",
          "view_schema": "public"
        },
        {
          "view_name": "v_outlet_warehouses",
          "definition": " SELECT o.id AS outlet_id,\n    o.name AS outlet_name,\n    o.code AS outlet_code,\n    w.id AS warehouse_id,\n    w.name AS warehouse_name,\n    w.warehouse_scope,\n    ow.show_in_stocktake\n   FROM ((outlets o\n     JOIN outlet_warehouses ow ON ((ow.outlet_id = o.id)))\n     JOIN warehouses w ON ((w.id = ow.warehouse_id)))\n  WHERE (COALESCE(o.active, true) AND COALESCE(w.active, true));",
          "view_schema": "public"
        },
        {
          "view_name": "warehouse_stock_variances",
          "definition": " WITH opening AS (\n         SELECT warehouse_stock_counts.period_id,\n            warehouse_stock_counts.item_id,\n            normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,\n            max(warehouse_stock_counts.counted_qty) AS opening_qty\n           FROM warehouse_stock_counts\n          WHERE (warehouse_stock_counts.kind = 'opening'::text)\n          GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, (normalize_variant_key(warehouse_stock_counts.variant_key))\n        ), closing AS (\n         SELECT warehouse_stock_counts.period_id,\n            warehouse_stock_counts.item_id,\n            normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,\n            max(warehouse_stock_counts.counted_qty) AS closing_qty\n           FROM warehouse_stock_counts\n          WHERE (warehouse_stock_counts.kind = 'closing'::text)\n          GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, (normalize_variant_key(warehouse_stock_counts.variant_key))\n        ), movement AS (\n         SELECT wsp_1.id AS period_id,\n            sl.item_id,\n            normalize_variant_key(sl.variant_key) AS variant_key,\n            sum(sl.delta_units) FILTER (WHERE (sl.reason = 'warehouse_transfer'::stock_reason)) AS transfer_qty,\n            sum(sl.delta_units) FILTER (WHERE (sl.reason = 'damage'::stock_reason)) AS damage_qty,\n            sum(sl.delta_units) FILTER (WHERE (sl.reason = 'outlet_sale'::stock_reason)) AS sales_qty,\n            sum(sl.delta_units) AS movement_qty\n           FROM (warehouse_stock_periods wsp_1\n             JOIN stock_ledger sl ON (((sl.warehouse_id = wsp_1.warehouse_id) AND (sl.location_type = 'warehouse'::text) AND (sl.occurred_at >= wsp_1.opened_at) AND (sl.occurred_at <= COALESCE(wsp_1.closed_at, now())))))\n          WHERE (sl.reason = ANY (ARRAY['warehouse_transfer'::stock_reason, 'outlet_sale'::stock_reason, 'damage'::stock_reason, 'recipe_consumption'::stock_reason, 'production_entry'::stock_reason]))\n          GROUP BY wsp_1.id, sl.item_id, (normalize_variant_key(sl.variant_key))\n        )\n SELECT wsp.id AS period_id,\n    wsp.warehouse_id,\n    wsp.outlet_id,\n    o.item_id,\n    ci.name AS item_name,\n    o.variant_key,\n    o.opening_qty,\n    COALESCE(m.transfer_qty, (0)::numeric) AS transfer_qty,\n    COALESCE(m.damage_qty, (0)::numeric) AS damage_qty,\n    COALESCE(m.sales_qty, (0)::numeric) AS sales_qty,\n    COALESCE(m.movement_qty, (0)::numeric) AS movement_qty,\n    c.closing_qty,\n    (o.opening_qty + COALESCE(m.movement_qty, (0)::numeric)) AS expected_qty,\n    ((o.opening_qty + COALESCE(m.movement_qty, (0)::numeric)) - COALESCE(c.closing_qty, (0)::numeric)) AS variance_qty,\n    (COALESCE(ci.cost, (0)::numeric) * ((o.opening_qty + COALESCE(m.movement_qty, (0)::numeric)) - COALESCE(c.closing_qty, (0)::numeric))) AS variance_cost\n   FROM ((((warehouse_stock_periods wsp\n     JOIN opening o ON ((o.period_id = wsp.id)))\n     LEFT JOIN closing c ON (((c.period_id = wsp.id) AND (c.item_id = o.item_id) AND (c.variant_key = o.variant_key))))\n     LEFT JOIN movement m ON (((m.period_id = wsp.id) AND (m.item_id = o.item_id) AND (m.variant_key = o.variant_key))))\n     LEFT JOIN catalog_items ci ON ((ci.id = o.item_id)));",
          "view_schema": "public"
        }
      ],
      "tables": [
        {
          "table_name": "android_app_versions",
          "table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "table_schema": "public"
        },
        {
          "table_name": "counter_values",
          "table_schema": "public"
        },
        {
          "table_name": "flow_trace_steps",
          "table_schema": "public"
        },
        {
          "table_name": "flow_traces",
          "table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "table_schema": "public"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "table_schema": "public"
        },
        {
          "table_name": "middleware_catalog_schedule",
          "table_schema": "public"
        },
        {
          "table_name": "order_items",
          "table_schema": "public"
        },
        {
          "table_name": "orders",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_order_routes",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_stocktakes",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "table_schema": "public"
        },
        {
          "table_name": "outlets",
          "table_schema": "public"
        },
        {
          "table_name": "platform_admins",
          "table_schema": "public"
        },
        {
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "table_name": "pos_item_map",
          "table_schema": "public"
        },
        {
          "table_name": "pos_sync_failures",
          "table_schema": "public"
        },
        {
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "table_name": "roles",
          "table_schema": "public"
        },
        {
          "table_name": "scanners",
          "table_schema": "public"
        },
        {
          "table_name": "stock_flow_batches",
          "table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "table_schema": "public"
        },
        {
          "table_name": "stocktake_app_users",
          "table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "table_schema": "public"
        },
        {
          "table_name": "suppliers",
          "table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "table_schema": "public"
        },
        {
          "table_name": "uom_options",
          "table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_backoffice_logs",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_damages",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_imports",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_items",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_transfer_items",
          "table_schema": "public"
        },
        {
          "table_name": "warehouse_transfers",
          "table_schema": "public"
        },
        {
          "table_name": "warehouses",
          "table_schema": "public"
        }
      ],
      "columns": [
        {
          "data_type": "text",
          "table_name": "android_app_versions",
          "column_name": "app_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "integer",
          "table_name": "android_app_versions",
          "column_name": "min_version_code",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "android_app_versions",
          "column_name": "min_version_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "boolean",
          "table_name": "android_app_versions",
          "column_name": "force_update",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "android_app_versions",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_items",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "USER-DEFINED",
          "table_name": "catalog_items",
          "column_name": "item_kind",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "units_per_purchase_pack",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "1",
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_items",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_items",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_items",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "consumption_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 10
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "cost",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 11
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_items",
          "column_name": "has_variations",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "image_url",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_items",
          "column_name": "default_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "purchase_pack_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 15
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "purchase_unit_mass",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 16
        },
        {
          "data_type": "USER-DEFINED",
          "table_name": "catalog_items",
          "column_name": "purchase_unit_mass_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 17
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "transfer_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 18
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "transfer_quantity",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "1",
          "ordinal_position": 19
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_items",
          "column_name": "outlet_order_visible",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 20
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_items",
          "column_name": "locked_from_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 21
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_items",
          "column_name": "has_recipe",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 23
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "consumption_unit_mass",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 24
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "consumption_unit_mass_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 25
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "consumption_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 26
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "consumption_qty_per_base",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 27
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "storage_unit",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 28
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "storage_weight",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 29
        },
        {
          "data_type": "integer",
          "table_name": "catalog_items",
          "column_name": "qty_decimal_places",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 30
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "stocktake_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 31
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "supplier_sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 32
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "selling_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 33
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_items",
          "column_name": "inner_pack_unit_mass",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 34
        },
        {
          "data_type": "text",
          "table_name": "catalog_items",
          "column_name": "inner_pack_unit_mass_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 35
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_variants",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "supplier_sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "USER-DEFINED",
          "table_name": "catalog_variants",
          "column_name": "item_kind",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'finished'::item_kind",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "consumption_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "stocktake_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "purchase_pack_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 9
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "units_per_purchase_pack",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "1",
          "ordinal_position": 10
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "purchase_unit_mass",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "purchase_unit_mass_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "transfer_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 13
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "transfer_quantity",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "1",
          "ordinal_position": 14
        },
        {
          "data_type": "integer",
          "table_name": "catalog_variants",
          "column_name": "qty_decimal_places",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "cost",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 16
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "selling_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 17
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_variants",
          "column_name": "locked_from_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 18
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_variants",
          "column_name": "outlet_order_visible",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 19
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "image_url",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 20
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_variants",
          "column_name": "default_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 21
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_variants",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 22
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_variants",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 23
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_variants",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 24
        },
        {
          "data_type": "numeric",
          "table_name": "catalog_variants",
          "column_name": "inner_pack_unit_mass",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 25
        },
        {
          "data_type": "text",
          "table_name": "catalog_variants",
          "column_name": "inner_pack_unit_mass_uom",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 26
        },
        {
          "data_type": "text",
          "table_name": "counter_values",
          "column_name": "counter_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "counter_values",
          "column_name": "scope_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'00000000-0000-0000-0000-000000000000'::uuid",
          "ordinal_position": 2
        },
        {
          "data_type": "bigint",
          "table_name": "counter_values",
          "column_name": "last_value",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 3
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "counter_values",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "flow_trace_steps",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "flow_trace_steps",
          "column_name": "trace_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "flow_trace_steps",
          "column_name": "occurred_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "flow_trace_steps",
          "column_name": "delta_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "numeric",
          "table_name": "flow_trace_steps",
          "column_name": "available_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "flow_trace_steps",
          "column_name": "reason",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "flow_trace_steps",
          "column_name": "negative",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 7
        },
        {
          "data_type": "jsonb",
          "table_name": "flow_trace_steps",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 8
        },
        {
          "data_type": "uuid",
          "table_name": "flow_trace_steps",
          "column_name": "flow_batch_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "flow_trace_steps",
          "column_name": "ledger_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "sale_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "order_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "flow_traces",
          "column_name": "level",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "flow_traces",
          "column_name": "variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "flow_traces",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "jsonb",
          "table_name": "flow_traces",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "flow_traces",
          "column_name": "flow_batch_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "item_storage_homes",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "item_storage_homes",
          "column_name": "variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "item_storage_homes",
          "column_name": "normalized_variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "item_storage_homes",
          "column_name": "storage_warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_storage_homes",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_storage_homes",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "uuid",
          "table_name": "item_transfer_profiles",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "item_transfer_profiles",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "item_transfer_profiles",
          "column_name": "from_warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "item_transfer_profiles",
          "column_name": "to_warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "item_transfer_profiles",
          "column_name": "transfer_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "item_transfer_profiles",
          "column_name": "transfer_quantity",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_transfer_profiles",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_transfer_profiles",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "item_transfer_profiles",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "deduction_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 5
        },
        {
          "data_type": "boolean",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "recipe_source",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "damage_unit",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "item_warehouse_handling_policies",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "middleware_catalog_schedule",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "middleware_catalog_schedule",
          "column_name": "scheduled_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "middleware_catalog_schedule",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "order_items",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "order_items",
          "column_name": "order_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "order_items",
          "column_name": "product_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "order_items",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "order_items",
          "column_name": "qty",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "order_items",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "order_items",
          "column_name": "name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "order_items",
          "column_name": "consumption_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 9
        },
        {
          "data_type": "numeric",
          "table_name": "order_items",
          "column_name": "cost",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 10
        },
        {
          "data_type": "numeric",
          "table_name": "order_items",
          "column_name": "receiving_contains",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "numeric",
          "table_name": "order_items",
          "column_name": "qty_cases",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "numeric",
          "table_name": "order_items",
          "column_name": "amount",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "text",
          "table_name": "order_items",
          "column_name": "receiving_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'each'::text",
          "ordinal_position": 14
        },
        {
          "data_type": "text",
          "table_name": "order_items",
          "column_name": "variation_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 15
        },
        {
          "data_type": "uuid",
          "table_name": "orders",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "orders",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "status",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'draft'::text",
          "ordinal_position": 3
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "approved_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "orders",
          "column_name": "approved_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "orders",
          "column_name": "created_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "order_number",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "boolean",
          "table_name": "orders",
          "column_name": "locked",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "tz",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'UTC'::text",
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "pdf_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "approved_pdf_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "loaded_pdf_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "offloaded_pdf_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "employee_signed_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 16
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "employee_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 17
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "employee_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 18
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "supervisor_signed_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 19
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "supervisor_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 20
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "supervisor_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 21
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "driver_signed_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 22
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "driver_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 23
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "driver_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 24
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "offloader_signed_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 25
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "offloader_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 26
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "offloader_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 27
        },
        {
          "data_type": "boolean",
          "table_name": "orders",
          "column_name": "modified_by_supervisor",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 28
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "modified_by_supervisor_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 29
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "source_event_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 30
        },
        {
          "data_type": "integer",
          "table_name": "orders",
          "column_name": "branch_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 31
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "order_type",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 32
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "bill_type",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 33
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "total_discount",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 34
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "total_discount_amount",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 35
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "total_gst",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 36
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "service_charges",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 37
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "delivery_charges",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 38
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "tip",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 39
        },
        {
          "data_type": "numeric",
          "table_name": "orders",
          "column_name": "pos_fee",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 40
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "price_type",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 41
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "customer_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 42
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "customer_phone",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 43
        },
        {
          "data_type": "jsonb",
          "table_name": "orders",
          "column_name": "raw_payload",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 44
        },
        {
          "data_type": "jsonb",
          "table_name": "orders",
          "column_name": "payments",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 45
        },
        {
          "data_type": "integer",
          "table_name": "orders",
          "column_name": "pos_branch_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 46
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "pos_sale_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 47
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "customer_email",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 48
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "handoff_driver_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 49
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "handoff_driver_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 50
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "handoff_driver_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 51
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "delivery_driver_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 52
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "delivery_driver_signature_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 53
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "delivery_driver_signed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 54
        },
        {
          "data_type": "text",
          "table_name": "orders",
          "column_name": "completed_pdf_path",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 55
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "accepted_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 56
        },
        {
          "data_type": "uuid",
          "table_name": "orders",
          "column_name": "accepted_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 57
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "orders",
          "column_name": "completed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 58
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "entity_type",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "entity_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "jsonb",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "payload",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "status",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'pending'::text",
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "delivered_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "outlet_catalog_sync_events",
          "column_name": "error_message",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_item_routes",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_item_routes",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_item_routes",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_item_routes",
          "column_name": "target_outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_item_routes",
          "column_name": "deduct_enabled",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_item_routes",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_item_routes",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "outlet_item_routes",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "outlet_item_routes",
          "column_name": "normalized_variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_item_routes",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 12
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_order_routes",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_order_routes",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_order_routes",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_order_routes",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "outlet_order_routes",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "outlet_order_routes",
          "column_name": "normalized_variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_order_routes",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_order_routes",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_qty_per_sale",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "notes",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 11
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 12
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_pos_heartbeats",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_pos_heartbeats",
          "column_name": "last_seen_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "outlet_pos_heartbeats",
          "column_name": "middleware_version",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "outlet_pos_heartbeats",
          "column_name": "host_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_pos_heartbeats",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_products",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_products",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "outlet_products",
          "column_name": "variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 3
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_products",
          "column_name": "enabled",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "outlet_products",
          "column_name": "display_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "qty_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_sales",
          "column_name": "is_production",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 6
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_sales",
          "column_name": "sold_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "created_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "jsonb",
          "table_name": "outlet_sales",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 10
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_sales",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 12
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "sale_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "vat_exc_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "flavour_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "flavour_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 16
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "modifier_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 17
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stock_balances",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stock_balances",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stock_balances",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_balances",
          "column_name": "sent_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_balances",
          "column_name": "consumed_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_balances",
          "column_name": "on_hand_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_stock_balances",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "outlet_stock_balances",
          "column_name": "variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stock_summary",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stock_summary",
          "column_name": "item_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "outlet_stock_summary",
          "column_name": "item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "outlet_stock_summary",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_summary",
          "column_name": "sent_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_summary",
          "column_name": "consumed_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stock_summary",
          "column_name": "on_hand_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stocktakes",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stocktakes",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stocktakes",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stocktakes",
          "column_name": "on_hand_at_snapshot",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stocktakes",
          "column_name": "counted_qty",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_stocktakes",
          "column_name": "variance",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_stocktakes",
          "column_name": "counted_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_stocktakes",
          "column_name": "counted_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "jsonb",
          "table_name": "outlet_stocktakes",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 10
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_stocktakes",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "outlet_stocktakes",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 12
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_warehouses",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_warehouses",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_warehouses",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 3
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_warehouses",
          "column_name": "show_in_stocktake",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "outlets",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "outlets",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "outlets",
          "column_name": "code",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "outlets",
          "column_name": "channel",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'selling'::text",
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "outlets",
          "column_name": "auth_user_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "outlets",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlets",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlets",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "boolean",
          "table_name": "outlets",
          "column_name": "deduct_on_pos_sale",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "outlets",
          "column_name": "default_sales_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "outlets",
          "column_name": "default_receiving_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "boolean",
          "table_name": "outlets",
          "column_name": "has_pos_middleware",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 13
        },
        {
          "data_type": "boolean",
          "table_name": "outlets",
          "column_name": "uses_orders_app",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 14
        },
        {
          "data_type": "uuid",
          "table_name": "platform_admins",
          "column_name": "user_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "platform_admins",
          "column_name": "granted_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 2
        },
        {
          "data_type": "bigint",
          "table_name": "pos_inventory_consumed",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "nextval('pos_inventory_consumed_id_seq'::regclass)",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "pos_inventory_consumed",
          "column_name": "source_event_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "pos_inventory_consumed",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "pos_inventory_consumed",
          "column_name": "order_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "pos_inventory_consumed",
          "column_name": "raw_item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "pos_inventory_consumed",
          "column_name": "quantity_consumed",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "pos_inventory_consumed",
          "column_name": "remaining_quantity",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "pos_inventory_consumed",
          "column_name": "occurred_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "date",
          "table_name": "pos_inventory_consumed",
          "column_name": "pos_date",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "pos_inventory_consumed",
          "column_name": "kdsid",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "pos_inventory_consumed",
          "column_name": "typec",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "jsonb",
          "table_name": "pos_inventory_consumed",
          "column_name": "context",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 12
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "pos_inventory_consumed",
          "column_name": "created_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 13
        },
        {
          "data_type": "text",
          "table_name": "pos_inventory_consumed",
          "column_name": "unassigned_branch_note",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "pos_item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "pos_item_map",
          "column_name": "catalog_item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "pos_item_map",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "pos_item_map",
          "column_name": "outlet_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "catalog_variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "normalized_variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "pos_flavour_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "pos_item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "pos_flavour_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "catalog_item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "pos_item_map",
          "column_name": "catalog_variant_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "uuid",
          "table_name": "pos_item_map",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 14
        },
        {
          "data_type": "uuid",
          "table_name": "pos_sync_failures",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "pos_sync_failures",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "pos_sync_failures",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "pos_sync_failures",
          "column_name": "source_event_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "pos_sync_failures",
          "column_name": "pos_order_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "pos_sync_failures",
          "column_name": "sale_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "pos_sync_failures",
          "column_name": "stage",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "pos_sync_failures",
          "column_name": "error_message",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "jsonb",
          "table_name": "pos_sync_failures",
          "column_name": "details",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "product_supplier_links",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "product_supplier_links",
          "column_name": "supplier_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "product_supplier_links",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "product_supplier_links",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "boolean",
          "table_name": "product_supplier_links",
          "column_name": "preferred",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "product_supplier_links",
          "column_name": "notes",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "boolean",
          "table_name": "product_supplier_links",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "product_supplier_links",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "product_supplier_links",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "product_supplier_links",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "roles",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "roles",
          "column_name": "slug",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "roles",
          "column_name": "normalized_slug",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "roles",
          "column_name": "display_name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "roles",
          "column_name": "description",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "boolean",
          "table_name": "roles",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "roles",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "scanners",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "scanners",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "scanners",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "stock_flow_batches",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "stock_flow_batches",
          "column_name": "source_type",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "stock_flow_batches",
          "column_name": "source_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "stock_flow_batches",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "stock_flow_batches",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stock_flow_batches",
          "column_name": "occurred_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "stock_flow_batches",
          "column_name": "status",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'open'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "jsonb",
          "table_name": "stock_flow_batches",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stock_flow_batches",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "stock_ledger",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "stock_ledger",
          "column_name": "location_type",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "stock_ledger",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "stock_ledger",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "stock_ledger",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "numeric",
          "table_name": "stock_ledger",
          "column_name": "delta_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "USER-DEFINED",
          "table_name": "stock_ledger",
          "column_name": "reason",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "jsonb",
          "table_name": "stock_ledger",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stock_ledger",
          "column_name": "occurred_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "stock_ledger",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "stock_ledger",
          "column_name": "flow_batch_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "uuid",
          "table_name": "stocktake_app_users",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "stocktake_app_users",
          "column_name": "email",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "stocktake_app_users",
          "column_name": "pin_hash",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "stocktake_app_users",
          "column_name": "display_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "boolean",
          "table_name": "stocktake_app_users",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stocktake_app_users",
          "column_name": "last_login_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stocktake_app_users",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "stocktake_app_users",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "uuid",
          "table_name": "supplier_scanners",
          "column_name": "supplier_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "supplier_scanners",
          "column_name": "scanner_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "supplier_scanners",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "suppliers",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "contact_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "contact_phone",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "contact_email",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "whatsapp_number",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "suppliers",
          "column_name": "notes",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "boolean",
          "table_name": "suppliers",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "suppliers",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "suppliers",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "uom_conversions",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "uom_conversions",
          "column_name": "from_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "uom_conversions",
          "column_name": "to_uom",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "uom_conversions",
          "column_name": "multiplier",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "boolean",
          "table_name": "uom_conversions",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "uom_conversions",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "uom_conversions",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "uom_options",
          "column_name": "code",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "uom_options",
          "column_name": "label",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "integer",
          "table_name": "uom_options",
          "column_name": "sort_order",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 3
        },
        {
          "data_type": "boolean",
          "table_name": "uom_options",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "uom_options",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "uom_options",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "uuid",
          "table_name": "uom_options",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "user_roles",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "user_roles",
          "column_name": "user_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "user_roles",
          "column_name": "role_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "user_roles",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "user_roles",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "user_roles",
          "column_name": "display_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "uuid",
          "table_name": "v_hub_warehouses",
          "column_name": "id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "v_hub_warehouses",
          "column_name": "name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "v_hub_warehouses",
          "column_name": "code",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "v_hub_warehouses",
          "column_name": "parent_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "v_hub_warehouses",
          "column_name": "created_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "v_hub_warehouses",
          "column_name": "updated_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "v_hub_warehouses",
          "column_name": "active",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "v_hub_warehouses",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "boolean",
          "table_name": "v_hub_warehouses",
          "column_name": "auto_open_stock_period",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "v_hub_warehouses",
          "column_name": "warehouse_scope",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_live_balances",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_live_balances",
          "column_name": "outlet_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_live_balances",
          "column_name": "item_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_live_balances",
          "column_name": "item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_live_balances",
          "column_name": "item_sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_live_balances",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "v_outlet_live_balances",
          "column_name": "sent_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "numeric",
          "table_name": "v_outlet_live_balances",
          "column_name": "consumed_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "numeric",
          "table_name": "v_outlet_live_balances",
          "column_name": "on_hand_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "v_outlet_live_balances",
          "column_name": "updated_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "outlet_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "warehouse_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "item_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "item_sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "numeric",
          "table_name": "v_outlet_warehouse_ledger_balances",
          "column_name": "net_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_warehouses",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouses",
          "column_name": "outlet_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouses",
          "column_name": "outlet_code",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "v_outlet_warehouses",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouses",
          "column_name": "warehouse_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "v_outlet_warehouses",
          "column_name": "warehouse_scope",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "v_outlet_warehouses",
          "column_name": "show_in_stocktake",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "user_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "user_email",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "action",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "page",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "method",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "integer",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "status",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_backoffice_logs",
          "column_name": "details",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_damages",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_damages",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "warehouse_damages",
          "column_name": "note",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_damages",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_damages",
          "column_name": "created_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_damages",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "warehouse_damages",
          "column_name": "operator_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_imports",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "source",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "source_movement_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "source_invoice_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_imports",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_imports",
          "column_name": "item_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_purchase_imports",
          "column_name": "qty_units",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_purchase_imports",
          "column_name": "unit_cost",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_imports",
          "column_name": "movement_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_imports",
          "column_name": "receipt_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "status",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'imported'::text",
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_imports",
          "column_name": "error_message",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_imports",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 14
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_imports",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 15
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_items",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_items",
          "column_name": "receipt_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_items",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_purchase_items",
          "column_name": "qty_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_items",
          "column_name": "qty_input_mode",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'units'::text",
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_purchase_items",
          "column_name": "unit_cost",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_items",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_items",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "supplier_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "reference_code",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "note",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "boolean",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "auto_whatsapp",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 6
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "recorded_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "recorded_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "received_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "warehouse_purchase_receipts",
          "column_name": "operator_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_counts",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_counts",
          "column_name": "period_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_counts",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_counts",
          "column_name": "variant_key",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 4
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_counts",
          "column_name": "counted_qty",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_counts",
          "column_name": "kind",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_stock_counts",
          "column_name": "counted_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_counts",
          "column_name": "counted_by",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_stock_counts",
          "column_name": "context",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_periods",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_periods",
          "column_name": "warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_periods",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_periods",
          "column_name": "status",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'open'::text",
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_stock_periods",
          "column_name": "opened_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_periods",
          "column_name": "opened_by",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_stock_periods",
          "column_name": "closed_at",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_periods",
          "column_name": "closed_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_periods",
          "column_name": "note",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_stock_periods",
          "column_name": "opening_snapshot",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_stock_periods",
          "column_name": "closing_snapshot",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_periods",
          "column_name": "stocktake_number",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "next_stocktake_number()",
          "ordinal_position": 12
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_variances",
          "column_name": "period_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_variances",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_variances",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_stock_variances",
          "column_name": "item_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_variances",
          "column_name": "item_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "text",
          "table_name": "warehouse_stock_variances",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "opening_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "transfer_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "damage_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "sales_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 10
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "movement_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "closing_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "expected_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "variance_qty",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_stock_variances",
          "column_name": "variance_cost",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfer_items",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfer_items",
          "column_name": "transfer_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfer_items",
          "column_name": "item_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "numeric",
          "table_name": "warehouse_transfer_items",
          "column_name": "qty_units",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_transfer_items",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "text",
          "table_name": "warehouse_transfer_items",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfers",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "warehouse_transfers",
          "column_name": "reference_code",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfers",
          "column_name": "source_warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfers",
          "column_name": "destination_warehouse_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
        },
        {
          "data_type": "text",
          "table_name": "warehouse_transfers",
          "column_name": "note",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "jsonb",
          "table_name": "warehouse_transfers",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 6
        },
        {
          "data_type": "uuid",
          "table_name": "warehouse_transfers",
          "column_name": "created_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouse_transfers",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "text",
          "table_name": "warehouse_transfers",
          "column_name": "operator_name",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "warehouses",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "warehouses",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "warehouses",
          "column_name": "code",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "uuid",
          "table_name": "warehouses",
          "column_name": "parent_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouses",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouses",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 8
        },
        {
          "data_type": "boolean",
          "table_name": "warehouses",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 9
        },
        {
          "data_type": "uuid",
          "table_name": "warehouses",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 11
        },
        {
          "data_type": "boolean",
          "table_name": "warehouses",
          "column_name": "auto_open_stock_period",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 12
        },
        {
          "data_type": "text",
          "table_name": "warehouses",
          "column_name": "warehouse_scope",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'hub'::text",
          "ordinal_position": 13
        }
      ],
      "indexes": [
        {
          "indexdef": "CREATE UNIQUE INDEX android_app_versions_pkey ON public.android_app_versions USING btree (app_key)",
          "indexname": "android_app_versions_pkey",
          "table_name": "android_app_versions",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX catalog_items_pkey ON public.catalog_items USING btree (id)",
          "indexname": "catalog_items_pkey",
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_catalog_items_locked_from ON public.catalog_items USING btree (locked_from_warehouse_id)",
          "indexname": "idx_catalog_items_locked_from",
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_catalog_items_name_unique ON public.catalog_items USING btree (lower(name))",
          "indexname": "idx_catalog_items_name_unique",
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_catalog_items_sku_unique ON public.catalog_items USING btree (lower(sku)) WHERE (sku IS NOT NULL)",
          "indexname": "idx_catalog_items_sku_unique",
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX catalog_variants_item_key ON public.catalog_variants USING btree (item_id, id)",
          "indexname": "catalog_variants_item_key",
          "table_name": "catalog_variants",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_catalog_variants_item_id ON public.catalog_variants USING btree (item_id)",
          "indexname": "idx_catalog_variants_item_id",
          "table_name": "catalog_variants",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX counter_values_pkey ON public.counter_values USING btree (counter_key, scope_id)",
          "indexname": "counter_values_pkey",
          "table_name": "counter_values",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX flow_trace_steps_pkey ON public.flow_trace_steps USING btree (id)",
          "indexname": "flow_trace_steps_pkey",
          "table_name": "flow_trace_steps",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_flow_trace_steps_trace ON public.flow_trace_steps USING btree (trace_id, occurred_at DESC)",
          "indexname": "idx_flow_trace_steps_trace",
          "table_name": "flow_trace_steps",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_flow_trace_steps_ledger ON public.flow_trace_steps USING btree (ledger_id) WHERE (ledger_id IS NOT NULL)",
          "indexname": "ux_flow_trace_steps_ledger",
          "table_name": "flow_trace_steps",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX flow_traces_pkey ON public.flow_traces USING btree (id)",
          "indexname": "flow_traces_pkey",
          "table_name": "flow_traces",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_flow_traces_outlet ON public.flow_traces USING btree (outlet_id, created_at DESC)",
          "indexname": "idx_flow_traces_outlet",
          "table_name": "flow_traces",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_flow_traces_batch_level_item_wh ON public.flow_traces USING btree (flow_batch_id, level, item_id, warehouse_id, variant_key) WHERE (flow_batch_id IS NOT NULL)",
          "indexname": "ux_flow_traces_batch_level_item_wh",
          "table_name": "flow_traces",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_flow_traces_sale_level_item_wh ON public.flow_traces USING btree (sale_id, level, item_id, warehouse_id, variant_key) WHERE (sale_id IS NOT NULL)",
          "indexname": "ux_flow_traces_sale_level_item_wh",
          "table_name": "flow_traces",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_item_storage_homes_item_variant ON public.item_storage_homes USING btree (item_id, normalized_variant_key)",
          "indexname": "idx_item_storage_homes_item_variant",
          "table_name": "item_storage_homes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX item_storage_homes_pkey ON public.item_storage_homes USING btree (item_id, normalized_variant_key, storage_warehouse_id)",
          "indexname": "item_storage_homes_pkey",
          "table_name": "item_storage_homes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_item_transfer_profile_from ON public.item_transfer_profiles USING btree (from_warehouse_id)",
          "indexname": "idx_item_transfer_profile_from",
          "table_name": "item_transfer_profiles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_item_transfer_profile_to ON public.item_transfer_profiles USING btree (to_warehouse_id)",
          "indexname": "idx_item_transfer_profile_to",
          "table_name": "item_transfer_profiles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX item_transfer_profiles_pkey ON public.item_transfer_profiles USING btree (id)",
          "indexname": "item_transfer_profiles_pkey",
          "table_name": "item_transfer_profiles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_item_warehouse_policy_deduction_unit ON public.item_warehouse_handling_policies USING btree (deduction_uom)",
          "indexname": "idx_item_warehouse_policy_deduction_unit",
          "table_name": "item_warehouse_handling_policies",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX item_warehouse_handling_policies_pkey ON public.item_warehouse_handling_policies USING btree (id)",
          "indexname": "item_warehouse_handling_policies_pkey",
          "table_name": "item_warehouse_handling_policies",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX middleware_catalog_schedule_pkey ON public.middleware_catalog_schedule USING btree (id)",
          "indexname": "middleware_catalog_schedule_pkey",
          "table_name": "middleware_catalog_schedule",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id)",
          "indexname": "idx_order_items_order",
          "table_name": "order_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)",
          "indexname": "order_items_pkey",
          "table_name": "order_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_orders_outlet ON public.orders USING btree (outlet_id, status)",
          "indexname": "idx_orders_outlet",
          "table_name": "orders",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)",
          "indexname": "orders_pkey",
          "table_name": "orders",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_orders_order_number ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL)",
          "indexname": "ux_orders_order_number",
          "table_name": "orders",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_orders_source_event ON public.orders USING btree (source_event_id) WHERE (source_event_id IS NOT NULL)",
          "indexname": "ux_orders_source_event",
          "table_name": "orders",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_catalog_sync_pending ON public.outlet_catalog_sync_events USING btree (outlet_id, status, created_at) WHERE (status = 'pending'::text)",
          "indexname": "idx_outlet_catalog_sync_pending",
          "table_name": "outlet_catalog_sync_events",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_catalog_sync_events_pkey ON public.outlet_catalog_sync_events USING btree (id)",
          "indexname": "outlet_catalog_sync_events_pkey",
          "table_name": "outlet_catalog_sync_events",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_outlet_item_routes_global_unique ON public.outlet_item_routes USING btree (item_id, normalized_variant_key) WHERE (outlet_id IS NULL)",
          "indexname": "idx_outlet_item_routes_global_unique",
          "table_name": "outlet_item_routes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_outlet_item_routes_local_unique ON public.outlet_item_routes USING btree (outlet_id, item_id, normalized_variant_key) WHERE (outlet_id IS NOT NULL)",
          "indexname": "idx_outlet_item_routes_local_unique",
          "table_name": "outlet_item_routes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_item_routes_pkey ON public.outlet_item_routes USING btree (outlet_id, item_id, normalized_variant_key)",
          "indexname": "outlet_item_routes_pkey",
          "table_name": "outlet_item_routes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_order_routes_pkey ON public.outlet_order_routes USING btree (id)",
          "indexname": "outlet_order_routes_pkey",
          "table_name": "outlet_order_routes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_order_routes_unique ON public.outlet_order_routes USING btree (outlet_id, item_id, normalized_variant_key)",
          "indexname": "outlet_order_routes_unique",
          "table_name": "outlet_order_routes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_pos_deduction_rules_sold ON public.outlet_pos_deduction_rules USING btree (outlet_id, sold_item_id, sold_variant_key) WHERE active",
          "indexname": "idx_outlet_pos_deduction_rules_sold",
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key ON public.outlet_pos_deduction_rules USING btree (outlet_id, sold_item_id, sold_variant_key, deduct_item_id, deduct_variant_key, warehouse_id)",
          "indexname": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_pos_deduction_rules_pkey ON public.outlet_pos_deduction_rules USING btree (id)",
          "indexname": "outlet_pos_deduction_rules_pkey",
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_pos_heartbeats_pkey ON public.outlet_pos_heartbeats USING btree (outlet_id)",
          "indexname": "outlet_pos_heartbeats_pkey",
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_products_pkey ON public.outlet_products USING btree (outlet_id, item_id, variant_key)",
          "indexname": "outlet_products_pkey",
          "table_name": "outlet_products",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_sales_outlet ON public.outlet_sales USING btree (outlet_id, sold_at DESC)",
          "indexname": "idx_outlet_sales_outlet",
          "table_name": "outlet_sales",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_sales_pkey ON public.outlet_sales USING btree (id)",
          "indexname": "outlet_sales_pkey",
          "table_name": "outlet_sales",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_outlet_stock_balances_key ON public.outlet_stock_balances USING btree (outlet_id, item_id, variant_key)",
          "indexname": "idx_outlet_stock_balances_key",
          "table_name": "outlet_stock_balances",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_stock_balances_outlet ON public.outlet_stock_balances USING btree (outlet_id)",
          "indexname": "idx_outlet_stock_balances_outlet",
          "table_name": "outlet_stock_balances",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_stock_balances_pkey ON public.outlet_stock_balances USING btree (outlet_id, item_id, variant_key)",
          "indexname": "outlet_stock_balances_pkey",
          "table_name": "outlet_stock_balances",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_stocktakes_outlet ON public.outlet_stocktakes USING btree (outlet_id, counted_at DESC)",
          "indexname": "idx_outlet_stocktakes_outlet",
          "table_name": "outlet_stocktakes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_stocktakes_pkey ON public.outlet_stocktakes USING btree (id)",
          "indexname": "outlet_stocktakes_pkey",
          "table_name": "outlet_stocktakes",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_warehouses_pkey ON public.outlet_warehouses USING btree (outlet_id, warehouse_id)",
          "indexname": "outlet_warehouses_pkey",
          "table_name": "outlet_warehouses",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlets_default_sales_wh ON public.outlets USING btree (default_sales_warehouse_id)",
          "indexname": "idx_outlets_default_sales_wh",
          "table_name": "outlets",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlets_auth_user_id_key ON public.outlets USING btree (auth_user_id)",
          "indexname": "outlets_auth_user_id_key",
          "table_name": "outlets",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlets_pkey ON public.outlets USING btree (id)",
          "indexname": "outlets_pkey",
          "table_name": "outlets",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_outlets_code ON public.outlets USING btree (lower(code)) WHERE (code IS NOT NULL)",
          "indexname": "ux_outlets_code",
          "table_name": "outlets",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX platform_admins_pkey ON public.platform_admins USING btree (user_id)",
          "indexname": "platform_admins_pkey",
          "table_name": "platform_admins",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_pos_inventory_consumed_outlet ON public.pos_inventory_consumed USING btree (outlet_id)",
          "indexname": "idx_pos_inventory_consumed_outlet",
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_pos_inventory_consumed_source ON public.pos_inventory_consumed USING btree (source_event_id)",
          "indexname": "idx_pos_inventory_consumed_source",
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX pos_inventory_consumed_pkey ON public.pos_inventory_consumed USING btree (id)",
          "indexname": "pos_inventory_consumed_pkey",
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX pos_inventory_consumed_source_event_id_key ON public.pos_inventory_consumed USING btree (source_event_id)",
          "indexname": "pos_inventory_consumed_source_event_id_key",
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX pos_item_map_pkey ON public.pos_item_map USING btree (id)",
          "indexname": "pos_item_map_pkey",
          "table_name": "pos_item_map",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_pos_sync_failures_created_at ON public.pos_sync_failures USING btree (created_at DESC)",
          "indexname": "idx_pos_sync_failures_created_at",
          "table_name": "pos_sync_failures",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_pos_sync_failures_source_event ON public.pos_sync_failures USING btree (source_event_id)",
          "indexname": "idx_pos_sync_failures_source_event",
          "table_name": "pos_sync_failures",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX pos_sync_failures_pkey ON public.pos_sync_failures USING btree (id)",
          "indexname": "pos_sync_failures_pkey",
          "table_name": "pos_sync_failures",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_product_supplier_links_item ON public.product_supplier_links USING btree (item_id)",
          "indexname": "idx_product_supplier_links_item",
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_product_supplier_links_supplier ON public.product_supplier_links USING btree (supplier_id)",
          "indexname": "idx_product_supplier_links_supplier",
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_product_supplier_links_warehouse ON public.product_supplier_links USING btree (warehouse_id)",
          "indexname": "idx_product_supplier_links_warehouse",
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX product_supplier_links_pkey ON public.product_supplier_links USING btree (id)",
          "indexname": "product_supplier_links_pkey",
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_supplier_item_vkey_wh ON public.product_supplier_links USING btree (supplier_id, item_id, variant_key, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))",
          "indexname": "ux_supplier_item_vkey_wh",
          "table_name": "product_supplier_links",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_roles_normalized_slug ON public.roles USING btree (normalized_slug)",
          "indexname": "idx_roles_normalized_slug",
          "table_name": "roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)",
          "indexname": "roles_pkey",
          "table_name": "roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX scanners_name_key ON public.scanners USING btree (name)",
          "indexname": "scanners_name_key",
          "table_name": "scanners",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX scanners_pkey ON public.scanners USING btree (id)",
          "indexname": "scanners_pkey",
          "table_name": "scanners",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_stock_flow_batches_outlet ON public.stock_flow_batches USING btree (outlet_id, occurred_at DESC)",
          "indexname": "idx_stock_flow_batches_outlet",
          "table_name": "stock_flow_batches",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_stock_flow_batches_source ON public.stock_flow_batches USING btree (source_type, source_id)",
          "indexname": "idx_stock_flow_batches_source",
          "table_name": "stock_flow_batches",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_stock_flow_batches_warehouse ON public.stock_flow_batches USING btree (warehouse_id, occurred_at DESC)",
          "indexname": "idx_stock_flow_batches_warehouse",
          "table_name": "stock_flow_batches",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX stock_flow_batches_pkey ON public.stock_flow_batches USING btree (id)",
          "indexname": "stock_flow_batches_pkey",
          "table_name": "stock_flow_batches",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX stock_ledger_pkey ON public.stock_ledger USING btree (id)",
          "indexname": "stock_ledger_pkey",
          "table_name": "stock_ledger",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX stocktake_app_users_pkey ON public.stocktake_app_users USING btree (id)",
          "indexname": "stocktake_app_users_pkey",
          "table_name": "stocktake_app_users",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_stocktake_app_users_email ON public.stocktake_app_users USING btree (lower(email))",
          "indexname": "ux_stocktake_app_users_email",
          "table_name": "stocktake_app_users",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX supplier_scanners_pkey ON public.supplier_scanners USING btree (supplier_id, scanner_id)",
          "indexname": "supplier_scanners_pkey",
          "table_name": "supplier_scanners",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX supplier_scanners_scanner_idx ON public.supplier_scanners USING btree (scanner_id)",
          "indexname": "supplier_scanners_scanner_idx",
          "table_name": "supplier_scanners",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_suppliers_name_unique ON public.suppliers USING btree (lower(name))",
          "indexname": "idx_suppliers_name_unique",
          "table_name": "suppliers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)",
          "indexname": "suppliers_pkey",
          "table_name": "suppliers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX uom_conversions_from_uom_to_uom_key ON public.uom_conversions USING btree (from_uom, to_uom)",
          "indexname": "uom_conversions_from_uom_to_uom_key",
          "table_name": "uom_conversions",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX uom_conversions_pkey ON public.uom_conversions USING btree (id)",
          "indexname": "uom_conversions_pkey",
          "table_name": "uom_conversions",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX uom_options_id_key ON public.uom_options USING btree (id)",
          "indexname": "uom_options_id_key",
          "table_name": "uom_options",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX uom_options_pkey ON public.uom_options USING btree (code)",
          "indexname": "uom_options_pkey",
          "table_name": "uom_options",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_user_roles_outlet ON public.user_roles USING btree (outlet_id)",
          "indexname": "idx_user_roles_outlet",
          "table_name": "user_roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id)",
          "indexname": "idx_user_roles_user",
          "table_name": "user_roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)",
          "indexname": "user_roles_pkey",
          "table_name": "user_roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX user_roles_user_id_role_id_outlet_id_key ON public.user_roles USING btree (user_id, role_id, outlet_id)",
          "indexname": "user_roles_user_id_role_id_outlet_id_key",
          "table_name": "user_roles",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_wb_logs_action ON public.warehouse_backoffice_logs USING btree (action)",
          "indexname": "idx_wb_logs_action",
          "table_name": "warehouse_backoffice_logs",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_wb_logs_created_at ON public.warehouse_backoffice_logs USING btree (created_at DESC)",
          "indexname": "idx_wb_logs_created_at",
          "table_name": "warehouse_backoffice_logs",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_wb_logs_user_id ON public.warehouse_backoffice_logs USING btree (user_id)",
          "indexname": "idx_wb_logs_user_id",
          "table_name": "warehouse_backoffice_logs",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_backoffice_logs_pkey ON public.warehouse_backoffice_logs USING btree (id)",
          "indexname": "warehouse_backoffice_logs_pkey",
          "table_name": "warehouse_backoffice_logs",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_warehouse_damages_warehouse ON public.warehouse_damages USING btree (warehouse_id)",
          "indexname": "idx_warehouse_damages_warehouse",
          "table_name": "warehouse_damages",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_damages_pkey ON public.warehouse_damages USING btree (id)",
          "indexname": "warehouse_damages_pkey",
          "table_name": "warehouse_damages",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_purchase_imports_receipt ON public.warehouse_purchase_imports USING btree (receipt_id)",
          "indexname": "idx_purchase_imports_receipt",
          "table_name": "warehouse_purchase_imports",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_purchase_imports_warehouse ON public.warehouse_purchase_imports USING btree (warehouse_id)",
          "indexname": "idx_purchase_imports_warehouse",
          "table_name": "warehouse_purchase_imports",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_purchase_import_source_movement ON public.warehouse_purchase_imports USING btree (source, source_movement_id)",
          "indexname": "ux_purchase_import_source_movement",
          "table_name": "warehouse_purchase_imports",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_purchase_imports_pkey ON public.warehouse_purchase_imports USING btree (id)",
          "indexname": "warehouse_purchase_imports_pkey",
          "table_name": "warehouse_purchase_imports",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_purchase_items_receipt ON public.warehouse_purchase_items USING btree (receipt_id)",
          "indexname": "idx_purchase_items_receipt",
          "table_name": "warehouse_purchase_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_purchase_items_pkey ON public.warehouse_purchase_items USING btree (id)",
          "indexname": "warehouse_purchase_items_pkey",
          "table_name": "warehouse_purchase_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_purchase_receipts_supplier ON public.warehouse_purchase_receipts USING btree (supplier_id)",
          "indexname": "idx_purchase_receipts_supplier",
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_purchase_receipts_reference_per_warehouse ON public.warehouse_purchase_receipts USING btree (warehouse_id, reference_code)",
          "indexname": "ux_purchase_receipts_reference_per_warehouse",
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_purchase_receipts_pkey ON public.warehouse_purchase_receipts USING btree (id)",
          "indexname": "warehouse_purchase_receipts_pkey",
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_wsc_unique_kind ON public.warehouse_stock_counts USING btree (period_id, item_id, variant_key, kind)",
          "indexname": "idx_wsc_unique_kind",
          "table_name": "warehouse_stock_counts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_stock_counts_pkey ON public.warehouse_stock_counts USING btree (id)",
          "indexname": "warehouse_stock_counts_pkey",
          "table_name": "warehouse_stock_counts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX idx_wsp_open_unique ON public.warehouse_stock_periods USING btree (warehouse_id) WHERE (status = 'open'::text)",
          "indexname": "idx_wsp_open_unique",
          "table_name": "warehouse_stock_periods",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_stock_periods_pkey ON public.warehouse_stock_periods USING btree (id)",
          "indexname": "warehouse_stock_periods_pkey",
          "table_name": "warehouse_stock_periods",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_stock_periods_stocktake_number_key ON public.warehouse_stock_periods USING btree (stocktake_number)",
          "indexname": "warehouse_stock_periods_stocktake_number_key",
          "table_name": "warehouse_stock_periods",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_transfer_items_transfer ON public.warehouse_transfer_items USING btree (transfer_id)",
          "indexname": "idx_transfer_items_transfer",
          "table_name": "warehouse_transfer_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_transfer_items_pkey ON public.warehouse_transfer_items USING btree (id)",
          "indexname": "warehouse_transfer_items_pkey",
          "table_name": "warehouse_transfer_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_warehouse_transfers_destination ON public.warehouse_transfers USING btree (destination_warehouse_id)",
          "indexname": "idx_warehouse_transfers_destination",
          "table_name": "warehouse_transfers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_warehouse_transfers_source ON public.warehouse_transfers USING btree (source_warehouse_id)",
          "indexname": "idx_warehouse_transfers_source",
          "table_name": "warehouse_transfers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_warehouse_transfers_reference ON public.warehouse_transfers USING btree (reference_code)",
          "indexname": "ux_warehouse_transfers_reference",
          "table_name": "warehouse_transfers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouse_transfers_pkey ON public.warehouse_transfers USING btree (id)",
          "indexname": "warehouse_transfers_pkey",
          "table_name": "warehouse_transfers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX ix_warehouses_outlet ON public.warehouses USING btree (outlet_id) WHERE (outlet_id IS NOT NULL)",
          "indexname": "ix_warehouses_outlet",
          "table_name": "warehouses",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_warehouses_code ON public.warehouses USING btree (lower(code)) WHERE (code IS NOT NULL)",
          "indexname": "ux_warehouses_code",
          "table_name": "warehouses",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX warehouses_pkey ON public.warehouses USING btree (id)",
          "indexname": "warehouses_pkey",
          "table_name": "warehouses",
          "table_schema": "public"
        }
      ],
      "schemas": [
        {
          "schema_name": "public"
        }
      ],
      "policies": [
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_image_update_stocktake",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))",
          "with_check_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))"
        },
        {
          "roles": [
            "anon"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_read_kiosk_anon",
          "table_schema": "public",
          "using_expression": "(active = true)",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_select_active",
          "table_schema": "public",
          "using_expression": "((auth.uid() IS NOT NULL) AND active)",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_items",
          "policy_name": "catalog_items_select_any_auth",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "anon"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_read_kiosk_anon",
          "table_schema": "public",
          "using_expression": "(active = true)",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_select_active",
          "table_schema": "public",
          "using_expression": "((auth.uid() IS NOT NULL) AND active)",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "catalog_variants",
          "policy_name": "catalog_variants_select_any_auth",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "counter_values",
          "policy_name": "counter_values_service_all",
          "table_schema": "public",
          "using_expression": "(auth.role() = 'service_role'::text)",
          "with_check_expression": "(auth.role() = 'service_role'::text)"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "DELETE",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_policy_delete",
          "table_schema": "public",
          "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_policy_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_policy_select",
          "table_schema": "public",
          "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_policy_update",
          "table_schema": "public",
          "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
          "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_supervisor_select",
          "table_schema": "public",
          "using_expression": "(is_supervisor(auth.uid()) AND is_warehouse_app_order(order_id))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "order_items",
          "policy_name": "order_items_supervisor_update",
          "table_schema": "public",
          "using_expression": "(is_supervisor(auth.uid()) AND is_warehouse_app_order(order_id) AND (EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_items.order_id) AND (lower(o.status) = 'placed'::text)))))",
          "with_check_expression": "(is_supervisor(auth.uid()) AND is_warehouse_app_order(order_id) AND (EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_items.order_id) AND (lower(o.status) = 'placed'::text)))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "DELETE",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_policy_delete",
          "table_schema": "public",
          "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_policy_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_policy_select",
          "table_schema": "public",
          "using_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_policy_update",
          "table_schema": "public",
          "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
          "with_check_expression": "is_admin(( SELECT auth.uid() AS uid))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "orders",
          "policy_name": "orders_supervisor_select",
          "table_schema": "public",
          "using_expression": "(is_supervisor(auth.uid()) AND (source_event_id IS NULL))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_catalog_sync_events",
          "policy_name": "outlet_catalog_sync_backoffice",
          "table_schema": "public",
          "using_expression": "((EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))) OR is_admin(auth.uid()))",
          "with_check_expression": "((EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))) OR is_admin(auth.uid()))"
        },
        {
          "roles": [
            "service_role"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_catalog_sync_events",
          "policy_name": "outlet_catalog_sync_service",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_select",
          "table_schema": "public",
          "using_expression": "((auth.role() = 'service_role'::text) OR (outlet_id = ANY (COALESCE(member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_select_stocktake",
          "table_schema": "public",
          "using_expression": "(is_stocktake_user(auth.uid()) OR is_admin(auth.uid()))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_item_routes",
          "policy_name": "outlet_item_routes_write",
          "table_schema": "public",
          "using_expression": "(auth.role() = 'service_role'::text)",
          "with_check_expression": "(auth.role() = 'service_role'::text)"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_order_routes",
          "policy_name": "outlet_order_routes_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_order_routes",
          "policy_name": "outlet_order_routes_backoffice_select",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_order_routes",
          "policy_name": "outlet_order_routes_backoffice_update",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
          "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_pos_deduction_rules",
          "policy_name": "outlet_pos_deduction_rules_backoffice",
          "table_schema": "public",
          "using_expression": "((EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))) OR is_admin(auth.uid()))",
          "with_check_expression": "((EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))) OR is_admin(auth.uid()))"
        },
        {
          "roles": [
            "service_role"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_pos_deduction_rules",
          "policy_name": "outlet_pos_deduction_rules_service",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_pos_heartbeats",
          "policy_name": "outlet_pos_heartbeats_backoffice_select",
          "table_schema": "public",
          "using_expression": "((EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))) OR is_admin(auth.uid()))",
          "with_check_expression": null
        },
        {
          "roles": [
            "service_role"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_pos_heartbeats",
          "policy_name": "outlet_pos_heartbeats_service",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_products",
          "policy_name": "outlet_products_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_products",
          "policy_name": "outlet_products_read_stocktake",
          "table_schema": "public",
          "using_expression": "(auth.uid() IS NOT NULL)",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_products",
          "policy_name": "outlet_products_write_admin",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_sales",
          "policy_name": "outlet_sales_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_sales",
          "policy_name": "outlet_sales_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_sales",
          "policy_name": "outlet_sales_insert_ops",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(auth.uid() IS NOT NULL)"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_sales",
          "policy_name": "outlet_sales_scoped",
          "table_schema": "public",
          "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
          "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stock_balances",
          "policy_name": "outlet_balances_scoped",
          "table_schema": "public",
          "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
          "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stock_balances",
          "policy_name": "outlet_stock_balances_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stock_balances",
          "policy_name": "outlet_stock_balances_ro",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stocktakes",
          "policy_name": "outlet_stocktakes_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stocktakes",
          "policy_name": "outlet_stocktakes_ro",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_stocktakes",
          "policy_name": "outlet_stocktakes_scoped",
          "table_schema": "public",
          "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
          "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_warehouses",
          "policy_name": "outlet_warehouses_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_warehouses",
          "policy_name": "outlet_warehouses_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_warehouses",
          "policy_name": "outlet_warehouses_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_warehouses",
          "policy_name": "outlet_warehouses_select_backoffice",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_warehouses",
          "policy_name": "outlet_warehouses_select_stocktake",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (outlet_id = ANY (COALESCE(stocktake_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "outlets",
          "policy_name": "outlets_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "outlets",
          "policy_name": "outlets_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlets",
          "policy_name": "outlets_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "outlets",
          "policy_name": "outlets_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlets",
          "policy_name": "outlets_select_stocktake",
          "table_schema": "public",
          "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "platform_admins",
          "policy_name": "platform_admins_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "platform_admins",
          "policy_name": "platform_admins_self_select",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "pos_item_map",
          "policy_name": "pos_item_map_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "pos_item_map",
          "policy_name": "pos_item_map_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "pos_item_map",
          "policy_name": "pos_item_map_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "pos_item_map",
          "policy_name": "pos_item_map_select_any_auth",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "service_role"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "pos_sync_failures",
          "policy_name": "pos_sync_failures_service_only",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "roles",
          "policy_name": "roles_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "roles",
          "policy_name": "roles_select_all",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "stock_ledger",
          "policy_name": "stock_ledger_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "stock_ledger",
          "policy_name": "stock_ledger_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "stock_ledger",
          "policy_name": "stock_ledger_stocktake_read",
          "table_schema": "public",
          "using_expression": "(is_stocktake_user(auth.uid()) AND (location_type = 'warehouse'::text))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "stocktake_app_users",
          "policy_name": "stocktake_app_users_admin_read",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "stocktake_app_users",
          "policy_name": "stocktake_app_users_admin_write",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
          "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "suppliers",
          "policy_name": "suppliers_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "suppliers",
          "policy_name": "suppliers_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "suppliers",
          "policy_name": "suppliers_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "uom_conversions",
          "policy_name": "uom_conversions_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "user_roles",
          "policy_name": "user_roles_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "user_roles",
          "policy_name": "user_roles_self_select",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_backoffice_logs",
          "policy_name": "warehouse_backoffice_logs_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_backoffice_logs",
          "policy_name": "warehouse_backoffice_logs_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_backoffice_logs",
          "policy_name": "wb_logs_insert_auth",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(auth.uid() IS NOT NULL)"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_backoffice_logs",
          "policy_name": "wb_logs_select_admin_backoffice",
          "table_schema": "public",
          "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_damages",
          "policy_name": "warehouse_damages_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_damages",
          "policy_name": "warehouse_damages_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_damages",
          "policy_name": "warehouse_damages_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_damages",
          "policy_name": "warehouse_damages_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_items",
          "policy_name": "warehouse_purchase_items_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_items",
          "policy_name": "warehouse_purchase_items_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_items",
          "policy_name": "warehouse_purchase_items_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_items",
          "policy_name": "warehouse_purchase_items_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_receipts",
          "policy_name": "warehouse_purchase_receipts_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_receipts",
          "policy_name": "warehouse_purchase_receipts_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_receipts",
          "policy_name": "warehouse_purchase_receipts_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_purchase_receipts",
          "policy_name": "warehouse_purchase_receipts_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_counts",
          "policy_name": "stocktake_counts_admin",
          "table_schema": "public",
          "using_expression": "(auth.role() = 'service_role'::text)",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_counts",
          "policy_name": "stocktake_counts_stocktakers",
          "table_schema": "public",
          "using_expression": "is_stocktake_user(auth.uid())",
          "with_check_expression": "is_stocktake_user(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_counts",
          "policy_name": "warehouse_stock_counts_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_periods",
          "policy_name": "stocktake_periods_admin",
          "table_schema": "public",
          "using_expression": "(auth.role() = 'service_role'::text)",
          "with_check_expression": "true"
        },
        {
          "roles": [
            "public"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_periods",
          "policy_name": "stocktake_periods_stocktakers",
          "table_schema": "public",
          "using_expression": "is_stocktake_user(auth.uid())",
          "with_check_expression": "is_stocktake_user(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_periods",
          "policy_name": "warehouse_stock_periods_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_stock_periods",
          "policy_name": "warehouse_stock_periods_select_backoffice",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfer_items",
          "policy_name": "warehouse_transfer_items_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfer_items",
          "policy_name": "warehouse_transfer_items_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfer_items",
          "policy_name": "warehouse_transfer_items_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfer_items",
          "policy_name": "warehouse_transfer_items_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfers",
          "policy_name": "warehouse_transfers_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfers",
          "policy_name": "warehouse_transfers_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfers",
          "policy_name": "warehouse_transfers_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouse_transfers",
          "policy_name": "warehouse_transfers_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "anon",
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouse_select_app",
          "table_schema": "public",
          "using_expression": "(id = ANY (ARRAY['c4aa315f-2e09-4060-8258-9dab077271ce'::uuid, 'c77376f7-1ede-4518-8180-b3efeecda128'::uuid]))",
          "with_check_expression": null
        },
        {
          "roles": [
            "anon",
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouse_select_read",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "ALL",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_admin_rw",
          "table_schema": "public",
          "using_expression": "is_admin(auth.uid())",
          "with_check_expression": "is_admin(auth.uid())"
        },
        {
          "roles": [
            "public"
          ],
          "command": "INSERT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_backoffice_insert",
          "table_schema": "public",
          "using_expression": null,
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "public"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_backoffice_select",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "public"
          ],
          "command": "UPDATE",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_backoffice_update",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_select_backoffice",
          "table_schema": "public",
          "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
          "with_check_expression": null
        },
        {
          "roles": [
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "warehouses",
          "policy_name": "warehouses_select_stocktake",
          "table_schema": "public",
          "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
          "with_check_expression": null
        }
      ],
      "triggers": [
        {
          "table_name": "android_app_versions",
          "trigger_def": "CREATE TRIGGER trg_android_app_versions_updated_at BEFORE UPDATE ON android_app_versions FOR EACH ROW EXECUTE FUNCTION set_android_app_versions_updated_at()",
          "table_schema": "public",
          "trigger_name": "trg_android_app_versions_updated_at"
        },
        {
          "table_name": "catalog_items",
          "trigger_def": "CREATE TRIGGER trg_seed_outlet_routes_on_item AFTER INSERT ON catalog_items FOR EACH ROW EXECUTE FUNCTION seed_outlet_routes_on_item()",
          "table_schema": "public",
          "trigger_name": "trg_seed_outlet_routes_on_item"
        },
        {
          "table_name": "catalog_items",
          "trigger_def": "CREATE TRIGGER trg_sync_item_storage_homes_from_item AFTER INSERT OR DELETE OR UPDATE ON catalog_items FOR EACH ROW EXECUTE FUNCTION sync_item_storage_homes_from_item()",
          "table_schema": "public",
          "trigger_name": "trg_sync_item_storage_homes_from_item"
        },
        {
          "table_name": "catalog_variants",
          "trigger_def": "CREATE TRIGGER trg_refresh_catalog_has_variations AFTER INSERT OR DELETE OR UPDATE ON catalog_variants FOR EACH ROW EXECUTE FUNCTION refresh_catalog_has_variations_trigger()",
          "table_schema": "public",
          "trigger_name": "trg_refresh_catalog_has_variations"
        },
        {
          "table_name": "catalog_variants",
          "trigger_def": "CREATE TRIGGER trg_sync_item_storage_homes_from_variant AFTER INSERT OR DELETE OR UPDATE ON catalog_variants FOR EACH ROW EXECUTE FUNCTION sync_item_storage_homes_from_variant()",
          "table_schema": "public",
          "trigger_name": "trg_sync_item_storage_homes_from_variant"
        },
        {
          "table_name": "catalog_variants",
          "trigger_def": "CREATE TRIGGER trg_sync_variant_routes_from_base AFTER INSERT OR UPDATE ON catalog_variants FOR EACH ROW EXECUTE FUNCTION sync_variant_routes_from_base()",
          "table_schema": "public",
          "trigger_name": "trg_sync_variant_routes_from_base"
        },
        {
          "table_name": "order_items",
          "trigger_def": "CREATE TRIGGER trg_order_items_lock BEFORE INSERT OR DELETE OR UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION assert_order_item_editable()",
          "table_schema": "public",
          "trigger_name": "trg_order_items_lock"
        },
        {
          "table_name": "orders",
          "trigger_def": "CREATE TRIGGER trg_orders_lock_allocate AFTER UPDATE OF status ON orders FOR EACH ROW WHEN ((new.status = ANY (ARRAY['accepted'::text, 'ordered'::text, 'offloaded'::text, 'delivered'::text, 'completed'::text])) AND NOT COALESCE(new.locked, false)) EXECUTE FUNCTION ensure_order_locked_and_allocated()",
          "table_schema": "public",
          "trigger_name": "trg_orders_lock_allocate"
        },
        {
          "table_name": "outlet_item_routes",
          "trigger_def": "CREATE TRIGGER trg_sync_variant_routes_from_base_route AFTER INSERT OR UPDATE OF warehouse_id, deduct_enabled, target_outlet_id ON outlet_item_routes FOR EACH ROW WHEN (new.normalized_variant_key = 'base'::text) EXECUTE FUNCTION sync_variant_routes_from_base_route()",
          "table_schema": "public",
          "trigger_name": "trg_sync_variant_routes_from_base_route"
        },
        {
          "table_name": "outlet_order_routes",
          "trigger_def": "CREATE TRIGGER trg_sync_variant_order_routes_from_base_route AFTER INSERT OR UPDATE OF warehouse_id ON outlet_order_routes FOR EACH ROW WHEN (new.normalized_variant_key = 'base'::text) EXECUTE FUNCTION sync_variant_order_routes_from_base_route()",
          "table_schema": "public",
          "trigger_name": "trg_sync_variant_order_routes_from_base_route"
        },
        {
          "table_name": "outlets",
          "trigger_def": "CREATE TRIGGER trg_enforce_outlet_single_warehouse BEFORE INSERT OR UPDATE OF default_sales_warehouse_id ON outlets FOR EACH ROW EXECUTE FUNCTION enforce_outlet_single_warehouse()",
          "table_schema": "public",
          "trigger_name": "trg_enforce_outlet_single_warehouse"
        },
        {
          "table_name": "outlets",
          "trigger_def": "CREATE TRIGGER trg_seed_outlet_routes_on_outlet AFTER INSERT OR UPDATE OF default_sales_warehouse_id ON outlets FOR EACH ROW EXECUTE FUNCTION seed_outlet_routes_on_outlet()",
          "table_schema": "public",
          "trigger_name": "trg_seed_outlet_routes_on_outlet"
        },
        {
          "table_name": "stock_ledger",
          "trigger_def": "CREATE TRIGGER trg_rollup_on_raw_add AFTER INSERT ON stock_ledger FOR EACH ROW WHEN (new.location_type = 'warehouse'::text AND new.delta_units > 0::numeric) EXECUTE FUNCTION rollup_on_raw_insert()",
          "table_schema": "public",
          "trigger_name": "trg_rollup_on_raw_add"
        },
        {
          "table_name": "stock_ledger",
          "trigger_def": "CREATE TRIGGER trg_stock_ledger_flow_trace AFTER INSERT ON stock_ledger FOR EACH ROW EXECUTE FUNCTION stock_ledger_flow_trace()",
          "table_schema": "public",
          "trigger_name": "trg_stock_ledger_flow_trace"
        },
        {
          "table_name": "stock_ledger",
          "trigger_def": "CREATE TRIGGER trg_stock_ledger_set_occurred_at BEFORE INSERT ON stock_ledger FOR EACH ROW EXECUTE FUNCTION stock_ledger_set_occurred_at()",
          "table_schema": "public",
          "trigger_name": "trg_stock_ledger_set_occurred_at"
        },
        {
          "table_name": "stocktake_app_users",
          "trigger_def": "CREATE TRIGGER trg_stocktake_app_user_updated_at BEFORE UPDATE ON stocktake_app_users FOR EACH ROW EXECUTE FUNCTION set_stocktake_app_user_updated_at()",
          "table_schema": "public",
          "trigger_name": "trg_stocktake_app_user_updated_at"
        },
        {
          "table_name": "uom_conversions",
          "trigger_def": "CREATE TRIGGER trg_uom_conversions_updated_at BEFORE UPDATE ON uom_conversions FOR EACH ROW EXECUTE FUNCTION set_uom_conversion_updated_at()",
          "table_schema": "public",
          "trigger_name": "trg_uom_conversions_updated_at"
        },
        {
          "table_name": "uom_options",
          "trigger_def": "CREATE TRIGGER set_uom_options_updated_at BEFORE UPDATE ON uom_options FOR EACH ROW EXECUTE FUNCTION set_uom_options_updated_at()",
          "table_schema": "public",
          "trigger_name": "set_uom_options_updated_at"
        },
        {
          "table_name": "warehouse_stock_counts",
          "trigger_def": "CREATE TRIGGER trg_opening_stock_to_ledger AFTER INSERT OR UPDATE ON warehouse_stock_counts FOR EACH ROW EXECUTE FUNCTION sync_opening_stock_to_ledger()",
          "table_schema": "public",
          "trigger_name": "trg_opening_stock_to_ledger"
        },
        {
          "table_name": "warehouse_stock_periods",
          "trigger_def": "CREATE TRIGGER set_stock_period_outlet_id BEFORE INSERT ON warehouse_stock_periods FOR EACH ROW EXECUTE FUNCTION trg_set_stock_period_outlet_id()",
          "table_schema": "public",
          "trigger_name": "set_stock_period_outlet_id"
        },
        {
          "table_name": "warehouse_transfers",
          "trigger_def": "CREATE TRIGGER trg_set_transfer_operator_name BEFORE INSERT ON warehouse_transfers FOR EACH ROW EXECUTE FUNCTION set_transfer_operator_name()",
          "table_schema": "public",
          "trigger_name": "trg_set_transfer_operator_name"
        }
      ],
      "functions": [
        {
          "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%rowtype;\r\nBEGIN\r\n  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN\r\n    RAISE EXCEPTION 'not authorized to accept orders';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.source_event_id IS NOT NULL THEN\r\n    RAISE EXCEPTION 'not a warehouse app order';\r\n  END IF;\r\n\r\n  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN\r\n    RAISE EXCEPTION 'order must be placed before accept (current: %)', v_order.status;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'accepted',\r\n      accepted_at = now(),\r\n      accepted_by = v_uid,\r\n      approved_at = now(),\r\n      approved_by = v_uid,\r\n      modified_by_supervisor = true,\r\n      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),\r\n      supervisor_signed_name = COALESCE(NULLIF(p_supervisor_name, ''), supervisor_signed_name),\r\n      supervisor_signature_path = COALESCE(NULLIF(p_signature_path, ''), supervisor_signature_path),\r\n      supervisor_signed_at = CASE WHEN NULLIF(p_signature_path, '') IS NOT NULL THEN now() ELSE supervisor_signed_at END,\r\n      approved_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), approved_pdf_path),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\n\r\n  -- ensure_order_locked_and_allocated trigger runs record_order_fulfillment when locked=false\r\nEND;\r\n$function$\n",
          "function_name": "accept_order",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_sold_item_id uuid, p_sold_variant_key text, p_sale_qty numeric, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.apply_pos_sale_deduction_rules(p_outlet_id uuid, p_sold_item_id uuid, p_sold_variant_key text, p_sale_qty numeric, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_rule record;\r\n  v_deduct_qty numeric;\r\n  v_variant_sold text := public.normalize_variant_key(COALESCE(p_sold_variant_key, 'base'));\r\n  v_uses_app boolean := false;\r\nBEGIN\r\n  IF p_outlet_id IS NULL OR p_sold_item_id IS NULL OR p_sale_qty IS NULL OR p_sale_qty <= 0 THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  SELECT COALESCE(o.uses_orders_app, false)\r\n  INTO v_uses_app\r\n  FROM public.outlets o\r\n  WHERE o.id = p_outlet_id;\r\n\r\n  IF NOT v_uses_app THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  IF NOT public.outlet_pos_sale_in_sync_window(p_outlet_id, p_sold_at) THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  FOR v_rule IN\r\n    SELECT *\r\n    FROM public.outlet_pos_deduction_rules r\r\n    WHERE r.outlet_id = p_outlet_id\r\n      AND r.sold_item_id = p_sold_item_id\r\n      AND public.normalize_variant_key(r.sold_variant_key) = v_variant_sold\r\n      AND r.active\r\n      AND EXISTS (\r\n        SELECT 1 FROM public.outlet_warehouses ow\r\n        WHERE ow.outlet_id = p_outlet_id AND ow.warehouse_id = r.warehouse_id\r\n      )\r\n  LOOP\r\n    v_deduct_qty := v_rule.deduct_qty_per_sale * p_sale_qty;\r\n\r\n    INSERT INTO public.stock_ledger(\r\n      warehouse_id, item_id, variant_key, delta_units, reason,\r\n      location_type, occurred_at, context\r\n    )\r\n    VALUES (\r\n      v_rule.warehouse_id,\r\n      v_rule.deduct_item_id,\r\n      public.normalize_variant_key(v_rule.deduct_variant_key),\r\n      -v_deduct_qty,\r\n      'outlet_sale',\r\n      'warehouse',\r\n      COALESCE(p_sold_at, now()),\r\n      p_context || jsonb_build_object(\r\n        'deduction_rule_id', v_rule.id,\r\n        'sold_item_id', p_sold_item_id,\r\n        'sold_variant_key', v_variant_sold\r\n      )\r\n    );\r\n\r\n    UPDATE public.outlet_stock_balances osb\r\n    SET\r\n      consumed_units = osb.consumed_units + v_deduct_qty,\r\n      on_hand_units = GREATEST(osb.sent_units - (osb.consumed_units + v_deduct_qty), 0),\r\n      updated_at = now()\r\n    WHERE osb.outlet_id = p_outlet_id\r\n      AND osb.item_id = v_rule.deduct_item_id\r\n      AND osb.variant_key = public.normalize_variant_key(v_rule.deduct_variant_key);\r\n\r\n    IF NOT FOUND THEN\r\n      INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units, on_hand_units)\r\n      VALUES (\r\n        p_outlet_id,\r\n        v_rule.deduct_item_id,\r\n        public.normalize_variant_key(v_rule.deduct_variant_key),\r\n        0,\r\n        v_deduct_qty,\r\n        0\r\n      )\r\n      ON CONFLICT (outlet_id, item_id, variant_key) DO UPDATE SET\r\n        consumed_units = public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units,\r\n        on_hand_units = GREATEST(public.outlet_stock_balances.sent_units - (public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units), 0),\r\n        updated_at = now();\r\n    END IF;\r\n  END LOOP;\r\nEND;\r\n$function$\n",
          "function_name": "apply_pos_sale_deduction_rules",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_strict boolean DEFAULT true",
          "definition": "CREATE OR REPLACE FUNCTION public.approve_lock_and_allocate_order(p_order_id uuid, p_strict boolean DEFAULT true)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_uid uuid := (select auth.uid());\r\n  v_order public.orders%rowtype;\r\n  v_needs_allocation boolean := false;\r\nbegin\r\n  select * into v_order from public.orders where id = p_order_id for update;\r\n  if not found then\r\n    raise exception 'order % not found', p_order_id;\r\n  end if;\r\n\r\n  if not (\r\n    public.is_admin(v_uid)\r\n    or v_order.outlet_id = any(coalesce(public.member_outlet_ids(v_uid), array[]::uuid[]))\r\n  ) then\r\n    raise exception 'not authorized to allocate order %', p_order_id;\r\n  end if;\r\n\r\n  v_needs_allocation := not coalesce(v_order.locked, false);\r\n\r\n  if v_needs_allocation then\r\n    update public.orders\r\n    set status = coalesce(nullif(v_order.status, ''), 'ordered'),\r\n        locked = true,\r\n        approved_at = coalesce(v_order.approved_at, now()),\r\n        approved_by = coalesce(v_order.approved_by, v_uid),\r\n        updated_at = now()\r\n    where id = p_order_id;\r\n\r\n    perform public.record_order_fulfillment(p_order_id);\r\n  elsif not p_strict then\r\n    perform public.record_order_fulfillment(p_order_id);\r\n  end if;\r\nend;\r\n$function$\n",
          "function_name": "approve_lock_and_allocate_order",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.assert_order_item_editable()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_order public.orders%rowtype;\r\n  v_uid uuid := auth.uid();\r\n  v_is_admin boolean := false;\r\n  v_is_supervisor boolean := false;\r\n  v_status text;\r\n  v_merge text;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order not found for item';\r\n  END IF;\r\n\r\n  v_is_admin := public.is_admin(v_uid);\r\n  v_is_supervisor := public.is_supervisor(v_uid);\r\n  v_status := lower(COALESCE(v_order.status, ''));\r\n\r\n  IF NOT v_is_admin AND v_is_supervisor THEN\r\n    IF TG_OP IN ('INSERT', 'DELETE') THEN\r\n      v_merge := current_setting('order_items.supervisor_merge', true);\r\n      IF TG_OP = 'DELETE' AND v_merge = 'on' AND v_status = 'placed' THEN\r\n        RETURN OLD;\r\n      END IF;\r\n      RAISE EXCEPTION 'supervisors cannot add or remove order items';\r\n    END IF;\r\n\r\n    IF v_status <> 'placed' THEN\r\n      RAISE EXCEPTION 'supervisors can only edit items while order status is placed';\r\n    END IF;\r\n\r\n    IF TG_OP = 'UPDATE' THEN\r\n      IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN\r\n        RAISE EXCEPTION 'supervisors cannot change product on an order line';\r\n      END IF;\r\n    END IF;\r\n\r\n    RETURN NEW;\r\n  END IF;\r\n\r\n  IF NOT v_is_admin THEN\r\n    IF COALESCE(v_order.locked, false) THEN\r\n      RAISE EXCEPTION 'order is locked';\r\n    END IF;\r\n    IF v_status NOT IN ('placed', 'draft') THEN\r\n      RAISE EXCEPTION 'order items cannot be modified when status is %', v_order.status;\r\n    END IF;\r\n  END IF;\r\n\r\n  RETURN COALESCE(NEW, OLD);\r\nEND;\r\n$function$\n",
          "function_name": "assert_order_item_editable",
          "function_schema": "public"
        },
        {
          "arguments": "p_finished_item_id uuid, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text",
          "definition": "CREATE OR REPLACE FUNCTION public.available_servings(p_finished_item_id uuid, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text)\n RETURNS TABLE(finished_item_id uuid, warehouse_id uuid, variant_key text, max_servings numeric, bottleneck_ingredient uuid, bottleneck_needed numeric, bottleneck_available numeric)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  with normalized as (\r\n    select public.normalize_variant_key(coalesce(p_variant_key, 'base')) as vkey\r\n  ),\r\n  req as (\r\n    select\r\n      r.ingredient_item_id as ingredient_id,\r\n      r.qty_per_unit as qty_per_unit,\r\n      coalesce(r.yield_qty_units, 1) as yield_units\r\n    from public.recipes r\r\n    join normalized n on true\r\n    where r.active\r\n      and r.finished_item_id = p_finished_item_id\r\n      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = n.vkey\r\n  ),\r\n  stock as (\r\n    select\r\n      s.item_id,\r\n      s.variant_key,\r\n      coalesce(s.net_units, 0) as on_hand\r\n    from public.warehouse_layer_stock s\r\n    where s.warehouse_id = p_warehouse_id\r\n  ),\r\n  per_component as (\r\n    select\r\n      req.ingredient_id,\r\n      req.qty_per_unit,\r\n      req.yield_units,\r\n      coalesce(st.on_hand, 0) as on_hand,\r\n      /* how many finished units this ingredient can support */\r\n      floor(\r\n        case\r\n          when req.qty_per_unit <= 0 then 0\r\n          else (coalesce(st.on_hand, 0) * req.yield_units) / req.qty_per_unit\r\n        end\r\n      ) as max_by_component\r\n    from req\r\n    left join stock st on st.item_id = req.ingredient_id and st.variant_key = 'base'\r\n  ),\r\n  agg as (\r\n    select\r\n      min(max_by_component) as max_servings,\r\n      /* pick the bottleneck ingredient (smallest capacity) */\r\n      (array_agg(ingredient_id order by max_by_component asc nulls first))[1] as bottleneck_ingredient,\r\n      (array_agg(qty_per_unit order by max_by_component asc nulls first))[1] as bottleneck_needed,\r\n      (array_agg(on_hand order by max_by_component asc nulls first))[1] as bottleneck_available\r\n    from per_component\r\n  )\r\n  select\r\n    p_finished_item_id,\r\n    p_warehouse_id,\r\n    (select vkey from normalized) as variant_key,\r\n    coalesce(agg.max_servings, 0) as max_servings,\r\n    agg.bottleneck_ingredient,\r\n    agg.bottleneck_needed,\r\n    agg.bottleneck_available\r\n  from agg;\r\n$function$\n",
          "function_name": "available_servings",
          "function_schema": "public"
        },
        {
          "arguments": "p_user uuid, p_warehouse_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.can_operate_outlet_warehouse_stocktake(p_user uuid, p_warehouse_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT public.is_admin(p_user)\r\n      OR public.is_stocktake_user(p_user)\r\n      OR EXISTS (\r\n        SELECT 1\r\n        FROM public.outlet_warehouses ow\r\n        WHERE ow.warehouse_id = p_warehouse_id\r\n          AND ow.outlet_id = ANY(COALESCE(public.member_outlet_ids(p_user), ARRAY[]::uuid[]))\r\n      );\r\n$function$\n",
          "function_name": "can_operate_outlet_warehouse_stocktake",
          "function_schema": "public"
        },
        {
          "arguments": "p_period_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.close_stock_period(p_period_id uuid)\n RETURNS warehouse_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_row public.warehouse_stock_periods%rowtype;\r\n  v_prev_id uuid;\r\n  v_snapshot jsonb;\r\n  v_has_closing boolean := false;\r\nbegin\r\n  select * into v_row from public.warehouse_stock_periods where id = p_period_id for update;\r\n  if not found then\r\n    raise exception 'period not found or already closed';\r\n  end if;\r\n\r\n  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), v_row.warehouse_id) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if v_row.status <> 'open' then\r\n    raise exception 'period not found or already closed';\r\n  end if;\r\n\r\n  select exists (\r\n    select 1 from public.warehouse_stock_counts wsc\r\n    where wsc.period_id = p_period_id\r\n      and wsc.kind = 'closing'\r\n  ) into v_has_closing;\r\n\r\n  if not v_has_closing then\r\n    raise exception 'closing counts required before closing period';\r\n  end if;\r\n\r\n  select wsp.id\r\n  into v_prev_id\r\n  from public.warehouse_stock_periods wsp\r\n  where wsp.warehouse_id = v_row.warehouse_id\r\n    and wsp.status = 'closed'\r\n    and wsp.id <> p_period_id\r\n  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last\r\n  limit 1;\r\n\r\n  with keys as (\r\n    select distinct\r\n      wli.item_id,\r\n      public.normalize_variant_key(wli.variant_key) as variant_key\r\n    from public.warehouse_live_items wli\r\n    where wli.warehouse_id = v_row.warehouse_id\r\n    union\r\n    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)\r\n    from public.warehouse_stock_counts wsc\r\n    where wsc.period_id = p_period_id\r\n      and wsc.kind in ('opening', 'closing')\r\n    union\r\n    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)\r\n    from public.warehouse_stock_counts wsc\r\n    where wsc.period_id = v_prev_id\r\n      and wsc.kind = 'closing'\r\n  )\r\n  insert into public.warehouse_stock_counts(\r\n    period_id, item_id, variant_key, counted_qty, kind, counted_by, context\r\n  )\r\n  select\r\n    p_period_id,\r\n    k.item_id,\r\n    k.variant_key,\r\n    0,\r\n    'closing',\r\n    auth.uid(),\r\n    jsonb_build_object('auto_zero', true, 'reason', 'close_period')\r\n  from keys k\r\n  left join public.warehouse_stock_counts c\r\n    on c.period_id = p_period_id\r\n   and c.kind = 'closing'\r\n   and c.item_id = k.item_id\r\n   and public.normalize_variant_key(c.variant_key) = k.variant_key\r\n  where c.id is null;\r\n\r\n  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)\r\n  into v_snapshot\r\n  from (\r\n    select wsc.item_id,\r\n           wsc.variant_key,\r\n           wsc.counted_qty as closing_qty\r\n    from public.warehouse_stock_counts wsc\r\n    where wsc.period_id = p_period_id\r\n      and wsc.kind = 'closing'\r\n    order by wsc.item_id, wsc.variant_key\r\n  ) t;\r\n\r\n  if coalesce(jsonb_array_length(v_snapshot), 0) = 0 then\r\n    raise exception 'closing counts required before closing period';\r\n  end if;\r\n\r\n  update public.warehouse_stock_periods\r\n  set status = 'closed',\r\n      closed_at = now(),\r\n      closed_by = auth.uid(),\r\n      closing_snapshot = v_snapshot\r\n  where id = p_period_id and status = 'open'\r\n  returning * into v_row;\r\n\r\n  if not found then\r\n    raise exception 'period not found or already closed';\r\n  end if;\r\n\r\n  perform public.set_pos_sync_cutoff_for_warehouse(v_row.warehouse_id, v_row.closed_at);\r\n  perform public.start_stock_period(v_row.warehouse_id, 'Auto-open after close');\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
          "function_name": "close_stock_period",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%rowtype;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to complete order %', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.source_event_id IS NOT NULL THEN\r\n    RAISE EXCEPTION 'not a warehouse app order';\r\n  END IF;\r\n\r\n  IF lower(COALESCE(v_order.status, '')) <> 'loaded' THEN\r\n    RAISE EXCEPTION 'order must be loaded before complete (current: %)', v_order.status;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'completed',\r\n      locked = true,\r\n      delivery_driver_name = COALESCE(NULLIF(p_driver_name, ''), delivery_driver_name),\r\n      delivery_driver_signature_path = NULLIF(p_signature_path, ''),\r\n      delivery_driver_signed_at = now(),\r\n      offloader_signed_name = COALESCE(NULLIF(p_driver_name, ''), offloader_signed_name),\r\n      offloader_signature_path = COALESCE(NULLIF(p_signature_path, ''), offloader_signature_path),\r\n      offloader_signed_at = now(),\r\n      completed_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), completed_pdf_path),\r\n      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),\r\n      offloaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), offloaded_pdf_path),\r\n      completed_at = now(),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
          "function_name": "complete_order",
          "function_schema": "public"
        },
        {
          "arguments": "p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[]",
          "definition": "CREATE OR REPLACE FUNCTION public.console_locked_warehouses(p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[])\n RETURNS TABLE(id uuid, name text, parent_warehouse_id uuid, kind text, active boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  ids uuid[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_locked_ids, ARRAY[]::uuid[])));\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT w.id, w.name, w.parent_warehouse_id, w.kind, w.active\r\n  FROM public.warehouses w\r\n  WHERE p_include_inactive\r\n        OR w.active\r\n        OR (array_length(ids, 1) IS NOT NULL AND w.id = ANY(ids));\r\nEND;\r\n$function$\n",
          "function_name": "console_locked_warehouses",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.console_operator_directory()\n RETURNS TABLE(id uuid, display_name text, name text, email text, auth_user_id uuid)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    u.id,\r\n    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS display_name,\r\n    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS name,\r\n    u.email,\r\n    u.id AS auth_user_id\r\n  FROM public.user_roles ur\r\n  JOIN auth.users u ON u.id = ur.user_id\r\n  WHERE ur.role_id = 'eef421e0-ce06-4518-93c4-6bb6525f6742'\r\n    AND (u.is_anonymous IS NULL OR u.is_anonymous = false)\r\n    AND u.email IS NOT NULL;\r\n$function$\n",
          "function_name": "console_operator_directory",
          "function_schema": "public"
        },
        {
          "arguments": "p_qty numeric, p_from text, p_to text",
          "definition": "CREATE OR REPLACE FUNCTION public.convert_uom_qty(p_qty numeric, p_from text, p_to text)\n RETURNS numeric\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_from text := lower(trim(coalesce(p_from, '')));\r\n  v_to text := lower(trim(coalesce(p_to, '')));\r\n  v_multiplier numeric := 1;\r\nBEGIN\r\n  IF p_qty IS NULL THEN\r\n    RETURN NULL;\r\n  END IF;\r\n\r\n  IF v_from = '' OR v_to = '' OR v_from = v_to THEN\r\n    RETURN p_qty;\r\n  END IF;\r\n\r\n  SELECT uc.multiplier\r\n    INTO v_multiplier\r\n  FROM public.uom_conversions uc\r\n  WHERE uc.active\r\n    AND lower(uc.from_uom) = v_from\r\n    AND lower(uc.to_uom) = v_to\r\n  LIMIT 1;\r\n\r\n  RETURN p_qty * COALESCE(v_multiplier, 1);\r\nEND;\r\n$function$\n",
          "function_name": "convert_uom_qty",
          "function_schema": "public"
        },
        {
          "arguments": "p_scope_id uuid, p_counter_key text",
          "definition": "CREATE OR REPLACE FUNCTION public.debug_pos_sync_counter(p_scope_id uuid, p_counter_key text)\n RETURNS TABLE(counter_key text, scope_id uuid, last_value bigint, updated_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n SET row_security TO 'off'\nAS $function$\r\nbegin\r\n  return query\r\n  select c.counter_key, c.scope_id, c.last_value, c.updated_at\r\n  from public.counter_values c\r\n  where c.counter_key = p_counter_key\r\n    and c.scope_id = p_scope_id;\r\nend;\r\n$function$\n",
          "function_name": "debug_pos_sync_counter",
          "function_schema": "public"
        },
        {
          "arguments": "p_user uuid DEFAULT NULL::uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL::uuid)\n RETURNS uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];\r\n$function$\n",
          "function_name": "default_outlet_id",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%rowtype;\r\nBEGIN\r\n  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN\r\n    RAISE EXCEPTION 'not authorized to dispatch orders';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.source_event_id IS NOT NULL THEN\r\n    RAISE EXCEPTION 'not a warehouse app order';\r\n  END IF;\r\n\r\n  IF lower(COALESCE(v_order.status, '')) <> 'accepted' THEN\r\n    RAISE EXCEPTION 'order must be accepted before dispatch (current: %)', v_order.status;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'loaded',\r\n      locked = true,\r\n      handoff_driver_name = COALESCE(NULLIF(p_driver_name, ''), handoff_driver_name),\r\n      handoff_driver_signature_path = NULLIF(p_signature_path, ''),\r\n      handoff_driver_signed_at = now(),\r\n      driver_signed_name = COALESCE(NULLIF(p_driver_name, ''), driver_signed_name),\r\n      driver_signature_path = COALESCE(NULLIF(p_signature_path, ''), driver_signature_path),\r\n      driver_signed_at = now(),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
          "function_name": "dispatch_order",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.enforce_outlet_single_warehouse()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if new.default_sales_warehouse_id is not null then\r\n    new.default_receiving_warehouse_id := new.default_sales_warehouse_id;\r\n  end if;\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "enforce_outlet_single_warehouse",
          "function_schema": "public"
        },
        {
          "arguments": "p_entity_type text, p_entity_id text, p_payload jsonb DEFAULT '{}'::jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.enqueue_catalog_sync_for_outlets(p_entity_type text, p_entity_id text, p_payload jsonb DEFAULT '{}'::jsonb)\n RETURNS integer\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_count integer := 0;\r\nBEGIN\r\n  INSERT INTO public.outlet_catalog_sync_events(outlet_id, entity_type, entity_id, payload)\r\n  SELECT o.id, p_entity_type, p_entity_id, p_payload\r\n  FROM public.outlets o\r\n  WHERE COALESCE(o.active, true);\r\n\r\n  GET DIAGNOSTICS v_count = ROW_COUNT;\r\n  RETURN v_count;\r\nEND;\r\n$function$\n",
          "function_name": "enqueue_catalog_sync_for_outlets",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.ensure_open_stock_period(p_warehouse_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_warehouse_id IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  IF EXISTS (\r\n    SELECT 1\r\n    FROM public.warehouse_stock_periods wsp\r\n    WHERE wsp.warehouse_id = p_warehouse_id\r\n      AND wsp.status = 'open'\r\n  ) THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  IF EXISTS (\r\n    SELECT 1\r\n    FROM public.warehouses w\r\n    WHERE w.id = p_warehouse_id\r\n      AND COALESCE(w.auto_open_stock_period, false)\r\n  ) THEN\r\n    PERFORM public.start_stock_period(p_warehouse_id, 'Auto-open for stock flow');\r\n  END IF;\r\nEND;\r\n$function$\n",
          "function_name": "ensure_open_stock_period",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.ensure_order_locked_and_allocated()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF NEW.source_event_id IS NOT NULL THEN\r\n    RETURN NEW;\r\n  END IF;\r\n\r\n  IF NEW.status IN ('accepted', 'ordered', 'offloaded', 'delivered', 'completed')\r\n     AND NOT COALESCE(NEW.locked, false) THEN\r\n    PERFORM public.record_order_fulfillment(NEW.id);\r\n    UPDATE public.orders\r\n    SET locked = true,\r\n        updated_at = now()\r\n    WHERE id = NEW.id\r\n      AND locked = false;\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
          "function_name": "ensure_order_locked_and_allocated",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_limit integer DEFAULT 100",
          "definition": "CREATE OR REPLACE FUNCTION public.fetch_outlet_catalog_sync(p_outlet_id uuid, p_limit integer DEFAULT 100)\n RETURNS SETOF outlet_catalog_sync_events\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT *\r\n  FROM public.outlet_catalog_sync_events\r\n  WHERE outlet_id = p_outlet_id\r\n    AND status = 'pending'\r\n  ORDER BY created_at ASC\r\n  LIMIT GREATEST(COALESCE(p_limit, 100), 1);\r\n$function$\n",
          "function_name": "fetch_outlet_catalog_sync",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_cutoff(p_outlet_id uuid)\n RETURNS timestamp with time zone\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT to_timestamp(cv.last_value)\r\n  FROM public.counter_values cv\r\n  WHERE cv.counter_key = 'pos_sync_cutoff'\r\n    AND cv.scope_id = p_outlet_id\r\n  ORDER BY cv.updated_at DESC NULLS LAST\r\n  LIMIT 1;\r\n$function$\n",
          "function_name": "get_outlet_pos_sync_cutoff",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_opening(p_outlet_id uuid)\n RETURNS timestamp with time zone\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT to_timestamp(cv.last_value)\r\n  FROM public.counter_values cv\r\n  WHERE cv.counter_key = 'pos_sync_opening'\r\n    AND cv.scope_id = p_outlet_id\r\n  ORDER BY cv.updated_at DESC NULLS LAST\r\n  LIMIT 1;\r\n$function$\n",
          "function_name": "get_outlet_pos_sync_opening",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.has_open_warehouse_period(p_warehouse_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  select exists (\r\n    select 1\r\n    from public.warehouse_stock_periods wsp\r\n    where wsp.warehouse_id = p_warehouse_id\r\n      and wsp.status = 'open'\r\n    limit 1\r\n  );\r\n$function$\n",
          "function_name": "has_open_warehouse_period",
          "function_schema": "public"
        },
        {
          "arguments": "p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.has_stocktake_role(p_user_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\nAS $function$\r\n  select exists (\r\n    select 1\r\n    from public.user_roles ur\r\n    where ur.user_id = p_user_id\r\n      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'\r\n  )\r\n  OR exists (\r\n    select 1\r\n    from public.stocktake_app_users su\r\n    where su.id = p_user_id\r\n      and su.active\r\n  );\r\n$function$\n",
          "function_name": "has_stocktake_role",
          "function_schema": "public"
        },
        {
          "arguments": "p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n  RETURN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_user_id);\r\nEND;\r\n$function$\n",
          "function_name": "is_admin",
          "function_schema": "public"
        },
        {
          "arguments": "p_user uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.is_stocktake_user(p_user uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\nAS $function$\r\n  SELECT EXISTS (\r\n    SELECT 1 FROM public.user_roles ur\r\n    WHERE ur.user_id = p_user\r\n      AND ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'\r\n  )\r\n  OR EXISTS (\r\n    SELECT 1 FROM public.stocktake_app_users su\r\n    WHERE su.id = p_user AND su.active\r\n  )\r\n  OR EXISTS (\r\n    SELECT 1\r\n    FROM public.outlets o\r\n    JOIN public.outlet_warehouses ow ON ow.outlet_id = o.id AND COALESCE(ow.show_in_stocktake, true)\r\n    WHERE o.auth_user_id = p_user AND COALESCE(o.active, true)\r\n  );\r\n$function$\n",
          "function_name": "is_stocktake_user",
          "function_schema": "public"
        },
        {
          "arguments": "p_user uuid DEFAULT auth.uid()",
          "definition": "CREATE OR REPLACE FUNCTION public.is_supervisor(p_user uuid DEFAULT auth.uid())\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.user_roles ur\r\n    JOIN public.roles r ON r.id = ur.role_id\r\n    WHERE ur.user_id = p_user\r\n      AND lower(coalesce(r.normalized_slug, r.slug)) = 'supervisor'\r\n  );\r\n$function$\n",
          "function_name": "is_supervisor",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.is_warehouse_app_order(p_order_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.orders o\r\n    WHERE o.id = p_order_id\r\n      AND o.source_event_id IS NULL\r\n  );\r\n$function$\n",
          "function_name": "is_warehouse_app_order",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.list_middleware_outlets()\n RETURNS SETOF outlets\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT *\r\n  FROM public.outlets o\r\n  WHERE COALESCE(o.active, true)\r\n    AND COALESCE(o.has_pos_middleware, false)\r\n    AND COALESCE(o.channel, 'selling') = 'selling'\r\n    AND o.name !~* '\\mstorerooms?\\M'\r\n  ORDER BY o.name;\r\n$function$\n",
          "function_name": "list_middleware_outlets",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_outlet_id uuid, p_search text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.list_warehouse_items(p_warehouse_id uuid, p_outlet_id uuid, p_search text DEFAULT NULL::text)\n RETURNS TABLE(warehouse_id uuid, item_id uuid, item_name text, variant_key text, variant_name text, sku text, net_units numeric, unit_cost numeric, item_kind item_kind, image_url text, has_recipe boolean, consumption_uom text, purchase_pack_unit text, transfer_unit text, transfer_quantity numeric)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  with storage_keys as (\r\n    select\r\n      ish.item_id,\r\n      ish.normalized_variant_key\r\n    from public.item_storage_homes ish\r\n    where ish.storage_warehouse_id = p_warehouse_id\r\n  ),\r\n  items_in_warehouse as (\r\n    select distinct item_id from storage_keys\r\n  ),\r\n  base_items as (\r\n    select\r\n      p_warehouse_id as warehouse_id,\r\n      ci.id as item_id,\r\n      ci.name as item_name,\r\n      'base'::text as variant_key,\r\n      null::text as variant_name,\r\n      ci.sku as sku,\r\n      0::numeric as net_units,\r\n      coalesce(ci.cost, 0)::numeric as unit_cost,\r\n      ci.item_kind as item_kind,\r\n      ci.image_url,\r\n      exists (\r\n        select 1 from public.recipes r\r\n        where r.active\r\n          and r.finished_item_id = ci.id\r\n          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = 'base'\r\n      ) as has_recipe,\r\n      ci.consumption_uom as consumption_uom,\r\n      ci.purchase_pack_unit as purchase_pack_unit,\r\n      ci.transfer_unit as transfer_unit,\r\n      ci.transfer_quantity as transfer_quantity\r\n    from public.catalog_items ci\r\n    where ci.id in (select item_id from items_in_warehouse)\r\n  ),\r\n  variant_items as (\r\n    select\r\n      p_warehouse_id as warehouse_id,\r\n      cv.item_id,\r\n      ci.name as item_name,\r\n      public.normalize_variant_key(cv.id) as variant_key,\r\n      cv.name as variant_name,\r\n      cv.sku as sku,\r\n      0::numeric as net_units,\r\n      coalesce(ci.cost, 0)::numeric as unit_cost,\r\n      cv.item_kind as item_kind,\r\n      coalesce(cv.image_url, ci.image_url) as image_url,\r\n      exists (\r\n        select 1 from public.recipes r\r\n        where r.active\r\n          and r.finished_item_id = cv.item_id\r\n          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = public.normalize_variant_key(cv.id)\r\n      ) as has_recipe,\r\n      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,\r\n      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,\r\n      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,\r\n      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity\r\n    from storage_keys sk\r\n    join public.catalog_variants cv\r\n      on cv.item_id = sk.item_id\r\n      and public.normalize_variant_key(cv.id) = sk.normalized_variant_key\r\n    join public.catalog_items ci on ci.id = cv.item_id\r\n    where sk.normalized_variant_key <> 'base'\r\n      and coalesce(cv.active, true)\r\n  ),\r\n  available_items as (\r\n    select * from base_items\r\n    union all\r\n    select * from variant_items\r\n  ),\r\n  with_stock as (\r\n    select\r\n      wli.warehouse_id,\r\n      wli.item_id,\r\n      wli.item_name,\r\n      wli.variant_key,\r\n      cv.name as variant_name,\r\n      cv.sku as sku,\r\n      wli.net_units,\r\n      wli.unit_cost,\r\n      wli.item_kind,\r\n      coalesce(cv.image_url, ci.image_url, wli.image_url) as image_url,\r\n      wli.has_recipe,\r\n      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,\r\n      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,\r\n      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,\r\n      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity\r\n    from public.warehouse_live_items wli\r\n    join public.catalog_items ci on ci.id = wli.item_id\r\n    left join public.catalog_variants cv\r\n      on cv.item_id = wli.item_id\r\n      and public.normalize_variant_key(cv.id) = public.normalize_variant_key(wli.variant_key)\r\n      and coalesce(cv.active, true)\r\n    where wli.warehouse_id = p_warehouse_id\r\n  )\r\n  select\r\n    ai.warehouse_id,\r\n    ai.item_id,\r\n    ai.item_name,\r\n    ai.variant_key,\r\n    ai.variant_name,\r\n    ai.sku,\r\n    coalesce(ws.net_units, ai.net_units) as net_units,\r\n    ai.unit_cost,\r\n    ai.item_kind,\r\n    ai.image_url,\r\n    ai.has_recipe,\r\n    ai.consumption_uom,\r\n    ai.purchase_pack_unit,\r\n    ai.transfer_unit,\r\n    ai.transfer_quantity\r\n  from available_items ai\r\n  left join with_stock ws\r\n    on ws.warehouse_id = ai.warehouse_id\r\n    and ws.item_id = ai.item_id\r\n    and public.normalize_variant_key(ws.variant_key) = public.normalize_variant_key(ai.variant_key)\r\n  where (\r\n    p_search is null\r\n    or ai.item_name ilike ('%' || p_search || '%')\r\n    or coalesce(ai.variant_name, '') ilike ('%' || p_search || '%')\r\n    or coalesce(ai.sku, '') ilike ('%' || p_search || '%')\r\n  )\r\n  order by item_name asc, variant_key asc;\r\n$function$\n",
          "function_name": "list_warehouse_items",
          "function_schema": "public"
        },
        {
          "arguments": "payload jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.log_pos_sync_failure(payload jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if coalesce(payload->>'stage','') ilike '%pos_item_match%'\r\n     or coalesce(payload->>'error_message','') ilike '%pos_item_match%'\r\n     or coalesce(payload->>'stage','') = 'missing_mapping'\r\n     or coalesce(payload->>'error_message','') ilike '%missing_mapping%'\r\n     or coalesce(payload->>'error_message','') ilike '%pos_item_map missing%'\r\n     or coalesce(payload->>'error_message','') ilike '%no_mappable_items%'\r\n     or coalesce(payload->>'error_message','') ilike '%no items had a valid pos_item_map%'\r\n     or payload->'error_message' @> '[{\"code\":\"no_mappable_items\"}]'::jsonb\r\n     or coalesce(payload->>'error_message','') ilike '%missing_open_stock_period%'\r\n     or coalesce(payload->>'error_message','') ilike '%open stock period required%'\r\n     or payload->'error_message' @> '[{\"code\":\"missing_open_stock_period\"}]'::jsonb\r\n     or payload->'details' @> '[{\"code\":\"missing_open_stock_period\"}]'::jsonb\r\n  then\r\n    return;\r\n  end if;\r\n\r\n  insert into public.pos_sync_failures(\r\n    outlet_id,\r\n    source_event_id,\r\n    pos_order_id,\r\n    sale_id,\r\n    stage,\r\n    error_message,\r\n    details\r\n  ) values (\r\n    nullif(payload->>'outlet_id','')::uuid,\r\n    nullif(payload->>'source_event_id',''),\r\n    nullif(payload->>'pos_order_id',''),\r\n    nullif(payload->>'sale_id',''),\r\n    coalesce(nullif(payload->>'stage',''),'unknown'),\r\n    coalesce(nullif(payload->>'error_message',''), 'unknown error'),\r\n    payload->'details'\r\n  );\r\nend;\r\n$function$\n",
          "function_name": "log_pos_sync_failure",
          "function_schema": "public"
        },
        {
          "arguments": "p_event_ids uuid[]",
          "definition": "CREATE OR REPLACE FUNCTION public.mark_catalog_sync_delivered(p_event_ids uuid[])\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  UPDATE public.outlet_catalog_sync_events\r\n  SET status = 'delivered', delivered_at = now(), error_message = NULL\r\n  WHERE id = ANY(p_event_ids);\r\nEND;\r\n$function$\n",
          "function_name": "mark_catalog_sync_delivered",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.mark_order_loaded(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\nBEGIN\r\n  IF public.is_supervisor(v_uid) OR public.is_admin(v_uid) THEN\r\n    PERFORM public.dispatch_order(p_order_id, p_driver_name, p_signature_path);\r\n    IF NULLIF(p_pdf_path, '') IS NOT NULL THEN\r\n      UPDATE public.orders SET loaded_pdf_path = p_pdf_path, updated_at = now() WHERE id = p_order_id;\r\n    END IF;\r\n    RETURN;\r\n  END IF;\r\n\r\n  RAISE EXCEPTION 'use dispatch_order from supervisor app; outlet completes via complete_order';\r\nEND;\r\n$function$\n",
          "function_name": "mark_order_loaded",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.mark_order_modified(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  UPDATE public.orders\r\n  SET modified_by_supervisor = true,\r\n      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
          "function_name": "mark_order_modified",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.mark_order_offloaded(p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  PERFORM public.complete_order(p_order_id, p_offloader_name, p_signature_path, p_pdf_path);\r\nEND;\r\n$function$\n",
          "function_name": "mark_order_offloaded",
          "function_schema": "public"
        },
        {
          "arguments": "p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT COALESCE(\r\n    CASE\r\n      WHEN p_user_id IS NULL THEN NULL\r\n      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)\r\n      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)\r\n    END,\r\n    '{}'\r\n  );\r\n$function$\n",
          "function_name": "member_outlet_ids",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids()\n RETURNS SETOF uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));\r\n$function$\n",
          "function_name": "member_outlet_ids",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_prefix text;\r\n  v_next bigint;\r\n  v_scope uuid := coalesce(p_outlet_id, '00000000-0000-0000-0000-000000000000');\r\nbegin\r\n  if p_outlet_id is null then\r\n    raise exception 'outlet id required for numbering';\r\n  end if;\r\n\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('order_number', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  select coalesce(nullif(o.code, ''), substr(o.id::text, 1, 4)) into v_prefix\r\n  from public.outlets o\r\n  where o.id = p_outlet_id;\r\n\r\n  v_prefix := coalesce(v_prefix, 'OUT');\r\n  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));\r\n  return substr(v_prefix, 1, 1) || lpad(v_next::text, 11, '0');\r\nend;\r\n$function$\n",
          "function_name": "next_order_number",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.next_purchase_receipt_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('purchase_receipt', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'PR-' || lpad(v_next::text, 6, '0');\r\nend;\r\n$function$\n",
          "function_name": "next_purchase_receipt_reference",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.next_stocktake_number()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('stocktake_number', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'AT' || lpad(v_next::text, 10, '0');\r\nend;\r\n$function$\n",
          "function_name": "next_stocktake_number",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.next_transfer_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('transfer', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'WT-' || lpad(v_next::text, 6, '0');\r\nend;\r\n$function$\n",
          "function_name": "next_transfer_reference",
          "function_schema": "public"
        },
        {
          "arguments": "p_variant_key text",
          "definition": "CREATE OR REPLACE FUNCTION public.normalize_variant_key(p_variant_key text)\n RETURNS text\n LANGUAGE sql\nAS $function$\r\n  select coalesce(nullif($1, ''), 'base');\r\n$function$\n",
          "function_name": "normalize_variant_key",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  target_outlet uuid;\r\nBEGIN\r\n  IF p_order_id IS NULL OR p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;\r\n  IF target_outlet IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  IF public.is_admin(p_user_id) THEN\r\n    RETURN true;\r\n  END IF;\r\n\r\n  IF public.is_supervisor(p_user_id) AND public.is_warehouse_app_order(p_order_id) THEN\r\n    RETURN true;\r\n  END IF;\r\n\r\n  RETURN (\r\n    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))\r\n    OR public.outlet_auth_user_matches(target_outlet, p_user_id)\r\n  );\r\nEND;\r\n$function$\n",
          "function_name": "order_is_accessible",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(p_outlet_id uuid, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  IF public.is_admin(p_user_id) THEN\r\n    RETURN true;\r\n  END IF;\r\n\r\n  RETURN EXISTS (\r\n    SELECT 1 FROM public.outlets o\r\n    WHERE o.id = p_outlet_id AND o.auth_user_id = p_user_id AND o.active\r\n  );\r\nEND;\r\n$function$\n",
          "function_name": "outlet_auth_user_matches",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.outlet_default_warehouses(p_outlet_id uuid)\n RETURNS TABLE(default_sales_warehouse_id uuid, default_receiving_warehouse_id uuid)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  select o.default_sales_warehouse_id, o.default_receiving_warehouse_id\r\n  from public.outlets o\r\n  where o.id = p_outlet_id;\r\n$function$\n",
          "function_name": "outlet_default_warehouses",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_sold_at timestamp with time zone DEFAULT now()",
          "definition": "CREATE OR REPLACE FUNCTION public.outlet_pos_sale_in_sync_window(p_outlet_id uuid, p_sold_at timestamp with time zone DEFAULT now())\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_opening timestamptz;\r\n  v_cutoff timestamptz;\r\n  v_sold timestamptz := COALESCE(p_sold_at, now());\r\nBEGIN\r\n  IF p_outlet_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  v_opening := public.get_outlet_pos_sync_opening(p_outlet_id);\r\n  IF v_opening IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  IF v_sold < v_opening THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  v_cutoff := public.get_outlet_pos_sync_cutoff(p_outlet_id);\r\n  IF v_cutoff IS NOT NULL AND v_cutoff < v_opening AND v_sold > v_cutoff THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  RETURN true;\r\nEND;\r\n$function$\n",
          "function_name": "outlet_pos_sale_in_sync_window",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.place_order(p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS TABLE(order_id uuid, order_number text, created_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := (SELECT auth.uid());\r\n  v_now timestamptz := now();\r\n  v_row public.orders%rowtype;\r\n  v_item jsonb;\r\n  v_qty numeric;\r\n  v_qty_cases numeric;\r\n  v_receiving_contains numeric;\r\n  v_default_sales_wh uuid;\r\n  v_variant_key text;\r\n  v_route_wh uuid;\r\nBEGIN\r\n  IF p_outlet_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet id required';\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR p_outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized for outlet %', p_outlet_id;\r\n  END IF;\r\n\r\n  SELECT default_sales_warehouse_id\r\n    INTO v_default_sales_wh\r\n  FROM public.outlet_default_warehouses(p_outlet_id);\r\n\r\n  INSERT INTO public.orders(\r\n    outlet_id,\r\n    order_number,\r\n    status,\r\n    locked,\r\n    created_by,\r\n    tz,\r\n    pdf_path,\r\n    employee_signed_name,\r\n    employee_signature_path,\r\n    employee_signed_at,\r\n    source_event_id,\r\n    updated_at,\r\n    created_at\r\n  ) VALUES (\r\n    p_outlet_id,\r\n    public.next_order_number(p_outlet_id),\r\n    'placed',\r\n    false,\r\n    v_uid,\r\n    COALESCE(current_setting('TIMEZONE', true), 'UTC'),\r\n    p_pdf_path,\r\n    COALESCE(NULLIF(p_employee_name, ''), p_employee_name),\r\n    NULLIF(p_signature_path, ''),\r\n    v_now,\r\n    NULL,\r\n    v_now,\r\n    v_now\r\n  )\r\n  RETURNING * INTO v_row;\r\n\r\n  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP\r\n    IF (v_item ->> 'product_id') IS NULL THEN\r\n      RAISE EXCEPTION 'product_id is required for each line item';\r\n    END IF;\r\n\r\n    v_receiving_contains := NULLIF(v_item ->> 'receiving_contains', '')::numeric;\r\n    v_qty := COALESCE((v_item ->> 'qty')::numeric, 0);\r\n    v_qty_cases := COALESCE((v_item ->> 'qty_cases')::numeric, NULL);\r\n    IF v_qty_cases IS NULL AND v_receiving_contains IS NOT NULL AND v_receiving_contains > 0 THEN\r\n      v_qty_cases := v_qty / v_receiving_contains;\r\n    END IF;\r\n\r\n    v_variant_key := public.normalize_variant_key(\r\n      COALESCE(NULLIF(v_item ->> 'variation_key', ''), NULLIF(v_item ->> 'variation_id', ''), 'base')\r\n    );\r\n\r\n    v_route_wh := v_default_sales_wh;\r\n\r\n    INSERT INTO public.order_items(\r\n      order_id,\r\n      product_id,\r\n      variation_id,\r\n      variation_key,\r\n      warehouse_id,\r\n      name,\r\n      receiving_uom,\r\n      consumption_uom,\r\n      cost,\r\n      qty,\r\n      qty_cases,\r\n      receiving_contains,\r\n      amount\r\n    ) VALUES (\r\n      v_row.id,\r\n      (v_item ->> 'product_id')::uuid,\r\n      NULLIF(v_item ->> 'variation_id', '')::uuid,\r\n      v_variant_key,\r\n      v_route_wh,\r\n      COALESCE(NULLIF(v_item ->> 'name', ''), 'Item'),\r\n      COALESCE(NULLIF(v_item ->> 'receiving_uom', ''), 'each'),\r\n      COALESCE(NULLIF(v_item ->> 'consumption_uom', ''), 'each'),\r\n      COALESCE((v_item ->> 'cost')::numeric, 0),\r\n      v_qty,\r\n      v_qty_cases,\r\n      v_receiving_contains,\r\n      COALESCE((v_item ->> 'cost')::numeric, 0) * v_qty\r\n    );\r\n  END LOOP;\r\n\r\n  order_id := v_row.id;\r\n  order_number := v_row.order_number;\r\n  created_at := v_row.created_at;\r\n  RETURN NEXT;\r\nEND;\r\n$function$\n",
          "function_name": "place_order",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_item_id uuid, p_variant_key text DEFAULT 'base'::text",
          "definition": "CREATE OR REPLACE FUNCTION public.recipe_uom_available_qty(p_warehouse_id uuid, p_item_id uuid, p_variant_key text DEFAULT 'base'::text)\n RETURNS TABLE(item_id uuid, variant_key text, source_uom text, target_uom text, base_qty numeric, recipe_qty numeric)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  with stock as (\r\n    select * from public.list_warehouse_items(p_warehouse_id, null, null)\r\n    where item_id = p_item_id\r\n      and normalize_variant_key(variant_key) = normalize_variant_key(coalesce(p_variant_key, 'base'))\r\n    limit 1\r\n  ),\r\n  profile as (\r\n    select * from public.recipe_uom_profiles\r\n    where item_id = p_item_id\r\n      and normalize_variant_key(variant_key) = normalize_variant_key(coalesce(p_variant_key, 'base'))\r\n      and active\r\n    limit 1\r\n  ),\r\n  steps as (\r\n    select multiplier\r\n    from public.recipe_uom_chain_steps\r\n    where profile_id = (select id from profile)\r\n    order by step_order\r\n  )\r\n  select\r\n    stock.item_id,\r\n    stock.variant_key,\r\n    profile.source_uom,\r\n    profile.target_uom,\r\n    stock.net_units as base_qty,\r\n    stock.net_units * coalesce((select exp(sum(ln(multiplier))) from steps), 1) as recipe_qty\r\n  from stock\r\n  join profile on true;\r\n$function$\n",
          "function_name": "recipe_uom_available_qty",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_damage_id uuid;\r\n  v_variant_key text;\r\nbegin\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse_id is required';\r\n  end if;\r\n\r\n  perform public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id);\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one damage line is required';\r\n  end if;\r\n\r\n  insert into public.warehouse_damages(warehouse_id, note, context, created_by)\r\n  values (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())\r\n  returning id into v_damage_id;\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units,\r\n      nullif(elem->>'note', '') as line_note\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each damage line needs product_id and qty > 0';\r\n    end if;\r\n\r\n    v_variant_key := public.normalize_variant_key(rec.variant_key);\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)\r\n    values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      -1 * rec.qty_units,\r\n      'damage',\r\n      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))\r\n    );\r\n  end loop;\r\n\r\n  return v_damage_id;\r\nend;\r\n$function$\n",
          "function_name": "record_damage",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.record_order_fulfillment(p_order_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_order public.orders%rowtype;\r\n  v_recv_wh uuid;\r\n  v_default_sales_wh uuid;\r\n  v_sources uuid[];\r\n  v_source uuid;\r\n  v_items jsonb;\r\nbegin\r\n  select * into v_order from public.orders where id = p_order_id;\r\n  if not found then\r\n    raise exception 'order % not found', p_order_id;\r\n  end if;\r\n\r\n  select default_receiving_warehouse_id, default_sales_warehouse_id\r\n    into v_recv_wh, v_default_sales_wh\r\n  from public.outlet_default_warehouses(v_order.outlet_id);\r\n\r\n  if v_recv_wh is null then\r\n    raise exception 'receiving warehouse not set for outlet %', v_order.outlet_id;\r\n  end if;\r\n\r\n  create temporary table tmp_item_routes on commit drop as\r\n  with base_items as (\r\n    select\r\n      oi.id as order_item_id,\r\n      oi.product_id,\r\n      public.normalize_variant_key(coalesce(oi.variation_key, 'base')) as variant_key,\r\n      oi.qty\r\n    from public.order_items oi\r\n    where oi.order_id = p_order_id\r\n  ),\r\n  sources as (\r\n    select\r\n      bi.order_item_id,\r\n      bi.product_id,\r\n      bi.variant_key,\r\n      bi.qty,\r\n      coalesce(\r\n        cv.storage_home_id,\r\n        ci.storage_home_id,\r\n        v_default_sales_wh\r\n      ) as source_warehouse_id\r\n    from base_items bi\r\n    join public.catalog_items ci on ci.id = bi.product_id\r\n    left join public.catalog_variants cv\r\n      on cv.item_id = bi.product_id\r\n     and public.normalize_variant_key(cv.id::text) = bi.variant_key\r\n  )\r\n  select * from sources;\r\n\r\n  if exists (select 1 from tmp_item_routes where source_warehouse_id is null) then\r\n    raise exception 'storage_home_id missing for one or more items in order %', p_order_id;\r\n  end if;\r\n\r\n  select array_agg(distinct source_warehouse_id)\r\n    into v_sources\r\n  from tmp_item_routes;\r\n\r\n  if v_sources is null or array_length(v_sources, 1) = 0 then\r\n    return;\r\n  end if;\r\n\r\n  foreach v_source in array v_sources loop\r\n    select jsonb_agg(\r\n      jsonb_build_object('product_id', product_id, 'variant_key', variant_key, 'qty', qty)\r\n    )\r\n    into v_items\r\n    from tmp_item_routes\r\n    where source_warehouse_id = v_source\r\n      and qty is not null\r\n      and qty <> 0;\r\n\r\n    if v_items is null or jsonb_array_length(v_items) = 0 then\r\n      continue;\r\n    end if;\r\n\r\n    perform public.transfer_units_between_warehouses(\r\n      v_source,\r\n      v_recv_wh,\r\n      v_items,\r\n      'Auto-transfer on approval for order ' || coalesce(v_order.order_number, p_order_id::text)\r\n    );\r\n  end loop;\r\nend;\r\n$function$\n",
          "function_name": "record_order_fulfillment",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS outlet_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n SET row_security TO 'off'\nAS $function$\r\ndeclare\r\n  v_sale public.outlet_sales%rowtype;\r\n  v_deduct_wh uuid;\r\n  v_deduct_enabled boolean;\r\n  v_variant_key text := public.normalize_variant_key(p_variant_key);\r\n  v_consumption_per_base numeric := 1;\r\n  v_consumption_unit text;\r\n  v_effective_qty numeric;\r\n  v_flow_batch_id uuid;\r\nbegin\r\n  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then\r\n    raise exception 'outlet, item, qty required';\r\n  end if;\r\n\r\n  select coalesce(deduct_on_pos_sale, true)\r\n    into v_deduct_enabled\r\n  from public.outlets where id = p_outlet_id;\r\n\r\n  if v_deduct_enabled = false then\r\n    insert into public.outlet_sales(\r\n      outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context\r\n    ) values (\r\n      p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),\r\n      p_warehouse_id, p_sold_at, auth.uid(), p_context\r\n    ) returning * into v_sale;\r\n    return v_sale;\r\n  end if;\r\n\r\n  select default_sales_warehouse_id\r\n    into v_deduct_wh\r\n  from public.outlet_default_warehouses(p_outlet_id);\r\n\r\n  if v_deduct_wh is null then\r\n    raise exception 'default sales warehouse missing for outlet %', p_outlet_id;\r\n  end if;\r\n\r\n  perform public.ensure_open_stock_period(v_deduct_wh);\r\n  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);\r\n\r\n  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit\r\n  into v_consumption_per_base, v_consumption_unit\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);\r\n\r\n  insert into public.outlet_sales(\r\n    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context\r\n  ) values (\r\n    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),\r\n    v_deduct_wh, p_sold_at, auth.uid(), p_context\r\n  ) returning * into v_sale;\r\n\r\n  insert into public.stock_flow_batches(\r\n    source_type,\r\n    source_id,\r\n    outlet_id,\r\n    warehouse_id,\r\n    occurred_at,\r\n    status,\r\n    context\r\n  ) values (\r\n    'outlet_sale',\r\n    v_sale.id,\r\n    p_outlet_id,\r\n    v_deduct_wh,\r\n    p_sold_at,\r\n    'open',\r\n    coalesce(p_context, '{}')\r\n  ) returning id into v_flow_batch_id;\r\n\r\n  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)\r\n  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)\r\n  on conflict (outlet_id, item_id, variant_key)\r\n  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,\r\n                updated_at = now();\r\n\r\n  insert into public.stock_ledger(\r\n    location_type,\r\n    warehouse_id,\r\n    item_id,\r\n    variant_key,\r\n    delta_units,\r\n    reason,\r\n    context,\r\n    occurred_at,\r\n    flow_batch_id\r\n  ) values (\r\n    'warehouse',\r\n    v_deduct_wh,\r\n    p_item_id,\r\n    v_variant_key,\r\n    -1 * v_effective_qty,\r\n    'outlet_sale',\r\n    jsonb_build_object(\r\n      'sale_id', v_sale.id,\r\n      'outlet_id', p_outlet_id,\r\n      'uom_used', coalesce(v_consumption_unit, 'each'),\r\n      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),\r\n      'source_qty_units', p_qty_units,\r\n      'sold_at', p_sold_at,\r\n      'flow_batch_id', v_flow_batch_id\r\n    ) || coalesce(p_context, '{}'),\r\n    p_sold_at,\r\n    v_flow_batch_id\r\n  );\r\n\r\n  perform public.apply_recipe_deductions(\r\n    p_item_id,\r\n    p_qty_units,\r\n    v_deduct_wh,\r\n    v_variant_key,\r\n    jsonb_build_object(\r\n      'source','outlet_sale',\r\n      'outlet_id',p_outlet_id,\r\n      'deduct_outlet_id',p_outlet_id,\r\n      'warehouse_id',v_deduct_wh,\r\n      'sale_id',v_sale.id,\r\n      'flow_batch_id', v_flow_batch_id\r\n    ) || coalesce(p_context,'{}'),\r\n    0,\r\n    array[]::uuid[]\r\n  );\r\n\r\n  return v_sale;\r\nend;\r\n$function$\n",
          "function_name": "record_outlet_sale",
          "function_schema": "public"
        },
        {
          "arguments": "p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_sale_price numeric DEFAULT NULL::numeric, p_vat_exc_price numeric DEFAULT NULL::numeric, p_flavour_price numeric DEFAULT NULL::numeric, p_flavour_id text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_sale_price numeric DEFAULT NULL::numeric, p_vat_exc_price numeric DEFAULT NULL::numeric, p_flavour_price numeric DEFAULT NULL::numeric, p_flavour_id text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS outlet_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n SET row_security TO 'off'\nAS $function$\r\ndeclare\r\n  v_sale public.outlet_sales%rowtype;\r\n  v_deduct_wh uuid;\r\n  v_deduct_enabled boolean;\r\n  v_variant_key text := public.normalize_variant_key(p_variant_key);\r\n  v_consumption_per_base numeric := 1;\r\n  v_consumption_unit text;\r\n  v_effective_qty numeric;\r\n  v_flow_batch_id uuid;\r\nbegin\r\n  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then\r\n    raise exception 'outlet, item, qty required';\r\n  end if;\r\n\r\n  select coalesce(deduct_on_pos_sale, true)\r\n    into v_deduct_enabled\r\n  from public.outlets where id = p_outlet_id;\r\n\r\n  if v_deduct_enabled = false then\r\n    insert into public.outlet_sales(\r\n      outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,\r\n      is_production, flavour_id, warehouse_id, sold_at, created_by, context\r\n    ) values (\r\n      p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,\r\n      coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),\r\n      p_flavour_id, p_warehouse_id, p_sold_at, auth.uid(), p_context\r\n    ) returning * into v_sale;\r\n    return v_sale;\r\n  end if;\r\n\r\n  select default_sales_warehouse_id\r\n    into v_deduct_wh\r\n  from public.outlet_default_warehouses(p_outlet_id);\r\n\r\n  if v_deduct_wh is null then\r\n    raise exception 'default sales warehouse missing for outlet %', p_outlet_id;\r\n  end if;\r\n\r\n  perform public.ensure_open_stock_period(v_deduct_wh);\r\n  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);\r\n\r\n  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit\r\n  into v_consumption_per_base, v_consumption_unit\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);\r\n\r\n  insert into public.outlet_sales(\r\n    outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,\r\n    is_production, flavour_id, warehouse_id, sold_at, created_by, context\r\n  ) values (\r\n    p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,\r\n    coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),\r\n    p_flavour_id, v_deduct_wh, p_sold_at, auth.uid(), p_context\r\n  ) returning * into v_sale;\r\n\r\n  insert into public.stock_flow_batches(\r\n    source_type,\r\n    source_id,\r\n    outlet_id,\r\n    warehouse_id,\r\n    occurred_at,\r\n    status,\r\n    context\r\n  ) values (\r\n    'outlet_sale',\r\n    v_sale.id,\r\n    p_outlet_id,\r\n    v_deduct_wh,\r\n    p_sold_at,\r\n    'open',\r\n    coalesce(p_context, '{}')\r\n  ) returning id into v_flow_batch_id;\r\n\r\n  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)\r\n  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)\r\n  on conflict (outlet_id, item_id, variant_key)\r\n  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,\r\n                updated_at = now();\r\n\r\n  insert into public.stock_ledger(\r\n    location_type,\r\n    warehouse_id,\r\n    item_id,\r\n    variant_key,\r\n    delta_units,\r\n    reason,\r\n    context,\r\n    occurred_at,\r\n    flow_batch_id\r\n  ) values (\r\n    'warehouse',\r\n    v_deduct_wh,\r\n    p_item_id,\r\n    v_variant_key,\r\n    -1 * v_effective_qty,\r\n    'outlet_sale',\r\n    jsonb_build_object(\r\n      'sale_id', v_sale.id,\r\n      'outlet_id', p_outlet_id,\r\n      'sale_price', p_sale_price,\r\n      'vat_exc_price', p_vat_exc_price,\r\n      'flavour_id', p_flavour_id,\r\n      'uom_used', coalesce(v_consumption_unit, 'each'),\r\n      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),\r\n      'source_qty_units', p_qty_units,\r\n      'sold_at', p_sold_at,\r\n      'flow_batch_id', v_flow_batch_id\r\n    ) || coalesce(p_context, '{}'),\r\n    p_sold_at,\r\n    v_flow_batch_id\r\n  );\r\n\r\n  perform public.apply_recipe_deductions(\r\n    p_item_id,\r\n    p_qty_units,\r\n    v_deduct_wh,\r\n    v_variant_key,\r\n    jsonb_build_object(\r\n      'source','outlet_sale',\r\n      'outlet_id',p_outlet_id,\r\n      'deduct_outlet_id',p_outlet_id,\r\n      'warehouse_id',v_deduct_wh,\r\n      'sale_id',v_sale.id,\r\n      'flow_batch_id', v_flow_batch_id\r\n    ) || coalesce(p_context,'{}'),\r\n    0,\r\n    array[]::uuid[]\r\n  );\r\n\r\n  return v_sale;\r\nend;\r\n$function$\n",
          "function_name": "record_outlet_sale",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false",
          "definition": "CREATE OR REPLACE FUNCTION public.record_purchase_receipt(p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false)\n RETURNS warehouse_purchase_receipts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_receipt public.warehouse_purchase_receipts%rowtype;\r\n  v_reference text;\r\n  v_variant_key text;\r\n  v_occurred_at timestamptz;\r\nbegin\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse_id is required';\r\n  end if;\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one purchase item is required';\r\n  end if;\r\n\r\n  v_reference := coalesce(nullif(p_reference_code, ''), public.next_purchase_receipt_reference());\r\n\r\n  insert into public.warehouse_purchase_receipts(\r\n    warehouse_id,\r\n    supplier_id,\r\n    reference_code,\r\n    note,\r\n    auto_whatsapp,\r\n    context,\r\n    recorded_by\r\n  ) values (\r\n    p_warehouse_id,\r\n    p_supplier_id,\r\n    v_reference,\r\n    p_note,\r\n    coalesce(p_auto_whatsapp, false),\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) returning * into v_receipt;\r\n\r\n  -- FIX: use recorded_at/received_at instead of non-existent created_at\r\n  v_occurred_at := coalesce(v_receipt.received_at, v_receipt.recorded_at, now());\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units,\r\n      coalesce(nullif(elem->>'qty_input_mode', ''), 'units') as qty_input_mode,\r\n      nullif(elem->>'unit_cost', '')::numeric as unit_cost\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each purchase item requires a valid product_id and qty';\r\n    end if;\r\n\r\n    v_variant_key := public.normalize_variant_key(coalesce(rec.variant_key, 'base'));\r\n\r\n    insert into public.warehouse_purchase_items(\r\n      receipt_id,\r\n      item_id,\r\n      variant_key,\r\n      qty_units,\r\n      qty_input_mode,\r\n      unit_cost\r\n    ) values (\r\n      v_receipt.id,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      rec.qty_input_mode,\r\n      rec.unit_cost\r\n    );\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      'purchase_receipt',\r\n      jsonb_build_object('receipt_id', v_receipt.id, 'reference_code', v_receipt.reference_code, 'supplier_id', p_supplier_id, 'receipt_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n  end loop;\r\n\r\n  return v_receipt;\r\nend;\r\n$function$\n",
          "function_name": "record_purchase_receipt",
          "function_schema": "public"
        },
        {
          "arguments": "p_period_id uuid, p_item_id uuid, p_qty numeric, p_variant_key text DEFAULT 'base'::text, p_kind text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.record_stock_count(p_period_id uuid, p_item_id uuid, p_qty numeric, p_variant_key text DEFAULT 'base'::text, p_kind text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS warehouse_stock_counts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_period public.warehouse_stock_periods%rowtype;\r\n  v_row public.warehouse_stock_counts%rowtype;\r\n  v_item_kind item_kind;\r\n  v_has_recipe boolean := false;\r\n  v_variant text := public.normalize_variant_key(p_variant_key);\r\n  v_has_opening boolean := false;\r\n  v_kind text := lower(coalesce(p_kind, ''));\r\nbegin\r\n  select * into v_period from public.warehouse_stock_periods where id = p_period_id;\r\n  if not found then\r\n    raise exception 'stock period not found';\r\n  end if;\r\n\r\n  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), v_period.warehouse_id) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_qty is null or p_qty < 0 then\r\n    raise exception 'qty must be >= 0';\r\n  end if;\r\n\r\n  select ci.item_kind,\r\n         exists (\r\n           select 1 from public.recipes r\r\n           where r.active and r.finished_item_id = p_item_id\r\n         )\r\n  into v_item_kind, v_has_recipe\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  if v_item_kind is null then\r\n    raise exception 'catalog item % not found for stock count', p_item_id;\r\n  end if;\r\n\r\n  if v_item_kind <> 'ingredient' and v_has_recipe then\r\n    raise exception 'stock counts are restricted to ingredient items or non-recipe items';\r\n  end if;\r\n\r\n  if v_period.status <> 'open' then\r\n    raise exception 'stock period is not open';\r\n  end if;\r\n\r\n  select exists (\r\n    select 1 from public.warehouse_stock_counts wsc\r\n    where wsc.period_id = p_period_id\r\n      and wsc.item_id = p_item_id\r\n      and public.normalize_variant_key(wsc.variant_key) = v_variant\r\n      and wsc.kind = 'opening'\r\n  ) into v_has_opening;\r\n\r\n  if v_kind not in ('opening', 'closing') then\r\n    v_kind := 'auto';\r\n  end if;\r\n\r\n  if v_kind = 'closing' and not v_has_opening then\r\n    v_kind := 'opening';\r\n  end if;\r\n\r\n  if v_kind = 'auto' then\r\n    v_kind := case when v_has_opening then 'closing' else 'opening' end;\r\n  end if;\r\n\r\n  if v_kind = 'opening' then\r\n    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))\r\n    on conflict (period_id, item_id, variant_key, kind)\r\n    do update set\r\n      counted_qty = excluded.counted_qty,\r\n      counted_by = excluded.counted_by,\r\n      counted_at = now(),\r\n      context = excluded.context\r\n    returning * into v_row;\r\n\r\n    insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)\r\n    select\r\n      ow.outlet_id,\r\n      p_item_id,\r\n      v_variant,\r\n      p_qty + coalesce(osb.consumed_units, 0),\r\n      coalesce(osb.consumed_units, 0)\r\n    from public.outlet_warehouses ow\r\n    left join public.outlet_stock_balances osb\r\n      on osb.outlet_id = ow.outlet_id\r\n     and osb.item_id = p_item_id\r\n     and osb.variant_key = v_variant\r\n    where ow.warehouse_id = v_period.warehouse_id\r\n      and coalesce(ow.show_in_stocktake, true)\r\n    on conflict (outlet_id, item_id, variant_key)\r\n    do update set\r\n      sent_units = excluded.sent_units,\r\n      updated_at = now();\r\n\r\n    return v_row;\r\n  end if;\r\n\r\n  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n  values (p_period_id, p_item_id, v_variant, p_qty, v_kind, auth.uid(), coalesce(p_context, '{}'))\r\n  on conflict (period_id, item_id, variant_key, kind)\r\n  do update set\r\n    counted_qty = excluded.counted_qty,\r\n    counted_by = excluded.counted_by,\r\n    counted_at = now(),\r\n    context = excluded.context\r\n  returning * into v_row;\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
          "function_name": "record_stock_count",
          "function_schema": "public"
        },
        {
          "arguments": "p_item_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations(p_item_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if p_item_id is null then\r\n    return;\r\n  end if;\r\n  update public.catalog_items ci\r\n  set has_variations = exists (\r\n        select 1\r\n        from public.catalog_variants cv\r\n        where cv.item_id = p_item_id\r\n          and coalesce(cv.active, true)\r\n      ),\r\n      updated_at = now()\r\n  where ci.id = p_item_id;\r\nend;\r\n$function$\n",
          "function_name": "refresh_catalog_has_variations",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations_trigger()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  perform public.refresh_catalog_has_variations(coalesce(new.item_id, old.item_id));\r\n  return coalesce(new, old);\r\nend;\r\n$function$\n",
          "function_name": "refresh_catalog_has_variations_trigger",
          "function_schema": "public"
        },
        {
          "arguments": "p_profile_id uuid, p_steps jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.replace_recipe_uom_chain(p_profile_id uuid, p_steps jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  delete from public.recipe_uom_chain_steps where profile_id = p_profile_id;\r\n\r\n  insert into public.recipe_uom_chain_steps (profile_id, step_order, from_uom, to_uom, multiplier)\r\n  select\r\n    p_profile_id,\r\n    (step->>'step_order')::int,\r\n    step->>'from_uom',\r\n    step->>'to_uom',\r\n    (step->>'multiplier')::numeric\r\n  from jsonb_array_elements(p_steps) as step;\r\nend;\r\n$function$\n",
          "function_name": "replace_recipe_uom_chain",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if p_warehouse_id is null then\r\n    return;\r\n  end if;\r\n\r\n  -- Allow transfers without an open stock period for specific home warehouses.\r\n  if p_warehouse_id = any (array[\r\n    '21e1b353-9f6a-4cea-8998-128f4328b79d'::uuid,\r\n    '251a87ae-3ff6-4d26-918a-0f7c1fc45d4d'::uuid,\r\n    '29f617c5-9c76-4131-aebf-4be4544924db'::uuid,\r\n    '38bfcdb0-fec1-4b91-be05-d8990bf357a8'::uuid,\r\n    '4631b410-fc81-4f16-a74c-7e4de3c1f576'::uuid,\r\n    '732d83ba-48f6-481a-bedf-291b5f158552'::uuid,\r\n    'ac0bb46a-879b-4166-a10e-b31b688ee7c7'::uuid,\r\n    'd4252cfd-03c0-4187-9267-18ec79a00814'::uuid\r\n  ]) then\r\n    return;\r\n  end if;\r\n\r\n  if exists (\r\n    select 1\r\n    from public.outlet_warehouses ow\r\n    where ow.warehouse_id = p_warehouse_id\r\n  ) or exists (\r\n    select 1\r\n    from public.outlets o\r\n    where o.default_sales_warehouse_id = p_warehouse_id\r\n       or o.default_receiving_warehouse_id = p_warehouse_id\r\n  ) then\r\n    if not exists (\r\n      select 1\r\n      from public.warehouse_stock_periods wsp\r\n      where wsp.warehouse_id = p_warehouse_id\r\n        and wsp.status = 'open'\r\n    ) then\r\n      raise exception 'open stock period required for warehouse %', p_warehouse_id;\r\n    end if;\r\n  end if;\r\nend;\r\n$function$\n",
          "function_name": "require_open_stock_period_for_outlet_warehouse",
          "function_schema": "public"
        },
        {
          "arguments": "p_item_sku text, p_variant_sku text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.resolve_catalog_by_sku(p_item_sku text, p_variant_sku text DEFAULT NULL::text)\n RETURNS TABLE(catalog_item_id uuid, catalog_item_name text, catalog_item_sku text, variant_key text, variant_name text, variant_sku text)\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_item_sku text := nullif(trim(p_item_sku), '');\r\n  v_variant_sku text := nullif(trim(p_variant_sku), '');\r\n  v_item_id uuid;\r\nBEGIN\r\n  IF v_item_sku IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  -- Match by SKU (case-insensitive) or by catalog item UUID in Code field\r\n  SELECT ci.id INTO v_item_id\r\n  FROM public.catalog_items ci\r\n  WHERE lower(ci.sku) = lower(v_item_sku)\r\n     OR ci.id::text = v_item_sku\r\n  LIMIT 1;\r\n\r\n  IF v_item_id IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  IF v_variant_sku IS NOT NULL THEN\r\n    RETURN QUERY\r\n    SELECT\r\n      ci.id,\r\n      ci.name,\r\n      ci.sku,\r\n      public.normalize_variant_key(cv.id),\r\n      cv.name,\r\n      cv.sku\r\n    FROM public.catalog_items ci\r\n    JOIN public.catalog_variants cv ON cv.item_id = ci.id\r\n    WHERE ci.id = v_item_id\r\n      AND (lower(cv.sku) = lower(v_variant_sku) OR cv.id = v_variant_sku)\r\n      AND COALESCE(cv.active, true)\r\n    LIMIT 1;\r\n    RETURN;\r\n  END IF;\r\n\r\n  RETURN QUERY\r\n  SELECT ci.id, ci.name, ci.sku, 'base'::text, NULL::text, NULL::text\r\n  FROM public.catalog_items ci\r\n  WHERE ci.id = v_item_id\r\n  LIMIT 1;\r\nEND;\r\n$function$\n",
          "function_name": "resolve_catalog_by_sku",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_component_id uuid, p_variant_key text, p_delta_units numeric, p_source_ledger_id uuid, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[]",
          "definition": "CREATE OR REPLACE FUNCTION public.rollup_from_component(p_warehouse_id uuid, p_component_id uuid, p_variant_key text, p_delta_units numeric, p_source_ledger_id uuid, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[])\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_variant text := public.normalize_variant_key(coalesce(p_variant_key, 'base'));\r\n  v_produced numeric;\r\nbegin\r\n  if p_delta_units <= 0 then\r\n    return;\r\n  end if;\r\n  if p_depth > 6 then\r\n    return; -- safety guard\r\n  end if;\r\n  if p_component_id = any (p_seen) then\r\n    return; -- avoid cycles\r\n  end if;\r\n\r\n  for rec in\r\n    select\r\n      r.finished_item_id      as parent_item_id,\r\n      public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) as parent_variant,\r\n      r.qty_per_unit,\r\n      coalesce(r.yield_qty_units, 1) as yield_units,\r\n      ci.item_kind            as parent_kind\r\n    from public.recipes r\r\n    join public.catalog_items ci on ci.id = r.finished_item_id\r\n    where r.active\r\n      and r.ingredient_item_id = p_component_id\r\n      and r.recipe_for_kind = ci.item_kind\r\n  loop\r\n    if rec.qty_per_unit <= 0 or rec.yield_units <= 0 then\r\n      continue;\r\n    end if;\r\n\r\n    v_produced := (p_delta_units / rec.qty_per_unit) * rec.yield_units;\r\n\r\n    insert into public.stock_ledger(\r\n      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context\r\n    ) values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.parent_item_id,\r\n      rec.parent_variant,\r\n      v_produced,\r\n      'rollup_production',\r\n      jsonb_build_object(\r\n        'source_ledger_id', p_source_ledger_id,\r\n        'component_id', p_component_id,\r\n        'component_delta', p_delta_units,\r\n        'qty_per_unit', rec.qty_per_unit,\r\n        'yield_units', rec.yield_units\r\n      )\r\n    );\r\n\r\n    perform public.rollup_from_component(\r\n      p_warehouse_id,\r\n      rec.parent_item_id,\r\n      rec.parent_variant,\r\n      v_produced,\r\n      p_source_ledger_id,\r\n      p_depth + 1,\r\n      array_append(p_seen, p_component_id)\r\n    );\r\n  end loop;\r\nend;\r\n$function$\n",
          "function_name": "rollup_from_component",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.rollup_on_raw_insert()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_kind item_kind;\r\nbegin\r\n  if new.location_type <> 'warehouse' or new.delta_units <= 0 then\r\n    return new;\r\n  end if;\r\n\r\n  select ci.item_kind into v_kind from public.catalog_items ci where ci.id = new.item_id;\r\n  if v_kind <> 'raw' then\r\n    return new;\r\n  end if;\r\n\r\n  perform public.rollup_from_component(\r\n    new.warehouse_id,\r\n    new.item_id,\r\n    new.variant_key,\r\n    new.delta_units,\r\n    new.id,\r\n    0,\r\n    array[new.item_id]\r\n  );\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "rollup_on_raw_insert",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.seed_outlet_routes_on_item()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  insert into public.outlet_item_routes (\r\n    outlet_id,\r\n    item_id,\r\n    warehouse_id,\r\n    target_outlet_id,\r\n    deduct_enabled,\r\n    variant_key,\r\n    normalized_variant_key\r\n  )\r\n  select o.id,\r\n         new.id,\r\n         o.default_sales_warehouse_id,\r\n         o.id,\r\n         true,\r\n         'base',\r\n         'base'\r\n  from public.outlets o\r\n  where o.default_sales_warehouse_id is not null\r\n  on conflict do nothing;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "seed_outlet_routes_on_item",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.seed_outlet_routes_on_outlet()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if new.default_sales_warehouse_id is null then\r\n    return new;\r\n  end if;\r\n\r\n  insert into public.outlet_item_routes (\r\n    outlet_id,\r\n    item_id,\r\n    warehouse_id,\r\n    target_outlet_id,\r\n    deduct_enabled,\r\n    variant_key,\r\n    normalized_variant_key\r\n  )\r\n  select new.id,\r\n         ci.id,\r\n         new.default_sales_warehouse_id,\r\n         new.id,\r\n         true,\r\n         'base',\r\n         'base'\r\n  from public.catalog_items ci\r\n  on conflict do nothing;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "seed_outlet_routes_on_outlet",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_android_app_versions_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nbegin\r\n  new.updated_at = now();\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "set_android_app_versions_updated_at",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_cutoff timestamp with time zone",
          "definition": "CREATE OR REPLACE FUNCTION public.set_pos_sync_cutoff_for_warehouse(p_warehouse_id uuid, p_cutoff timestamp with time zone)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_cutoff_epoch bigint;\r\nbegin\r\n  if not public.is_stocktake_user(auth.uid()) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse required';\r\n  end if;\r\n\r\n  if p_cutoff is null then\r\n    raise exception 'cutoff required';\r\n  end if;\r\n\r\n  v_cutoff_epoch := floor(extract(epoch from p_cutoff));\r\n\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  select 'pos_sync_cutoff', o.id, v_cutoff_epoch\r\n  from public.outlets o\r\n  where o.default_sales_warehouse_id = p_warehouse_id\r\n\r\n  union\r\n\r\n  select 'pos_sync_cutoff', ow.outlet_id, v_cutoff_epoch\r\n  from public.outlet_warehouses ow\r\n  where ow.warehouse_id = p_warehouse_id\r\n    and coalesce(ow.show_in_stocktake, true)\r\n\r\n  on conflict (counter_key, scope_id)\r\n  do update\r\n    set last_value = excluded.last_value,\r\n        updated_at = now();\r\nend;\r\n$function$\n",
          "function_name": "set_pos_sync_cutoff_for_warehouse",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_opened timestamp with time zone",
          "definition": "CREATE OR REPLACE FUNCTION public.set_pos_sync_opening_for_warehouse(p_warehouse_id uuid, p_opened timestamp with time zone)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n SET row_security TO 'off'\nAS $function$\r\ndeclare\r\n  v_opened_epoch bigint;\r\n  v_outlets uuid[];\r\nbegin\r\n  if not public.is_stocktake_user(auth.uid()) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse required';\r\n  end if;\r\n\r\n  if p_opened is null then\r\n    raise exception 'opened time required';\r\n  end if;\r\n\r\n  v_opened_epoch := floor(extract(epoch from p_opened));\r\n\r\n  select array_agg(outlet_id)\r\n  into v_outlets\r\n  from (\r\n    select o.id as outlet_id\r\n    from public.outlets o\r\n    where o.default_sales_warehouse_id = p_warehouse_id\r\n\r\n    union\r\n\r\n    select ow.outlet_id\r\n    from public.outlet_warehouses ow\r\n    where ow.warehouse_id = p_warehouse_id\r\n      and coalesce(ow.show_in_stocktake, true)\r\n  ) scope_outlets;\r\n\r\n  if v_outlets is null or array_length(v_outlets, 1) is null then\r\n    raise exception 'no outlet mappings found for warehouse %', p_warehouse_id;\r\n  end if;\r\n\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  select 'pos_sync_opening', unnest(v_outlets), v_opened_epoch\r\n  on conflict (counter_key, scope_id)\r\n  do update\r\n    set last_value = excluded.last_value,\r\n        updated_at = now();\r\n\r\n  update public.counter_values\r\n  set last_value = 0,\r\n      updated_at = now()\r\n  where counter_key = 'pos_sync_cutoff'\r\n    and scope_id = any(v_outlets);\r\nend;\r\n$function$\n",
          "function_name": "set_pos_sync_opening_for_warehouse",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_production_assignment_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  NEW.updated_at := now();\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
          "function_name": "set_production_assignment_updated_at",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_stocktake_app_user_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  NEW.updated_at := now();\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
          "function_name": "set_stocktake_app_user_updated_at",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_transfer_operator_name()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if new.operator_name is null or btrim(new.operator_name) = '' then\r\n    if new.created_by is not null then\r\n      select coalesce(u.raw_user_meta_data->>'display_name', u.email, 'Operator')\r\n        into new.operator_name\r\n      from auth.users u\r\n      where u.id = new.created_by;\r\n    else\r\n      new.operator_name := 'Operator';\r\n    end if;\r\n  end if;\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "set_transfer_operator_name",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_uom_conversion_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  NEW.updated_at := now();\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
          "function_name": "set_uom_conversion_updated_at",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.set_uom_options_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nbegin\r\n  new.updated_at := now();\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "set_uom_options_updated_at",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid, p_note text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.start_stock_period(p_warehouse_id uuid, p_note text DEFAULT NULL::text)\n RETURNS warehouse_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_row public.warehouse_stock_periods%rowtype;\r\n  v_prev public.warehouse_stock_periods%rowtype;\r\n  v_opening_snapshot jsonb := '[]'::jsonb;\r\nbegin\r\n  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), p_warehouse_id) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse required';\r\n  end if;\r\n\r\n  if not exists (\r\n    select 1\r\n    from public.warehouses w\r\n    where w.id = p_warehouse_id\r\n      and coalesce(w.active, true)\r\n  ) then\r\n    raise exception 'warehouse not found or inactive';\r\n  end if;\r\n\r\n  if exists (\r\n    select 1\r\n    from public.warehouse_stock_periods wsp\r\n    where wsp.warehouse_id = p_warehouse_id\r\n      and wsp.status = 'open'\r\n  ) then\r\n    raise exception 'open stock period already exists for this warehouse';\r\n  end if;\r\n\r\n  select * into v_prev\r\n  from public.warehouse_stock_periods wsp\r\n  where wsp.warehouse_id = p_warehouse_id\r\n    and wsp.status = 'closed'\r\n  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last\r\n  limit 1;\r\n\r\n  if v_prev.id is not null then\r\n    v_opening_snapshot := coalesce(\r\n      v_prev.closing_snapshot,\r\n      (\r\n        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)\r\n        from (\r\n          select wsc.item_id, wsc.variant_key, wsc.counted_qty as closing_qty\r\n          from public.warehouse_stock_counts wsc\r\n          where wsc.period_id = v_prev.id\r\n            and wsc.kind = 'closing'\r\n          order by wsc.item_id, wsc.variant_key\r\n        ) t\r\n      )\r\n    );\r\n  end if;\r\n\r\n  insert into public.warehouse_stock_periods(\r\n    warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number\r\n  )\r\n  values (\r\n    p_warehouse_id,\r\n    null,\r\n    'open',\r\n    auth.uid(),\r\n    p_note,\r\n    v_opening_snapshot,\r\n    public.next_stocktake_number()\r\n  )\r\n  returning * into v_row;\r\n\r\n  if coalesce(jsonb_array_length(v_row.opening_snapshot), 0) > 0 then\r\n    insert into public.warehouse_stock_counts(\r\n      period_id, item_id, variant_key, counted_qty, kind, counted_by, context\r\n    )\r\n    select v_row.id, s.item_id, s.variant_key, s.closing_qty, 'opening', auth.uid(),\r\n           jsonb_build_object('snapshot', true, 'seeded_from', 'previous_closing')\r\n    from jsonb_to_recordset(coalesce(v_row.opening_snapshot, '[]'::jsonb))\r\n      as s(item_id uuid, variant_key text, closing_qty numeric);\r\n  end if;\r\n\r\n  perform public.set_pos_sync_opening_for_warehouse(v_row.warehouse_id, v_row.opened_at);\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
          "function_name": "start_stock_period",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.stock_ledger_flow_trace()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_sale_id uuid := nullif(new.context->>'sale_id', '')::uuid;\r\n  v_order_id uuid := nullif(new.context->>'order_id', '')::uuid;\r\n  v_outlet_id uuid := nullif(new.context->>'outlet_id', '')::uuid;\r\n  v_component_kind text := lower(coalesce(new.context->>'component_kind', ''));\r\n  v_flow_batch_id uuid := coalesce(new.flow_batch_id, nullif(new.context->>'flow_batch_id', '')::uuid);\r\n  v_level text;\r\n  v_trace_id uuid;\r\n  v_available numeric := null;\r\n  v_negative boolean := false;\r\nbegin\r\n  if new.reason not in ('outlet_sale', 'recipe_consumption') then\r\n    return new;\r\n  end if;\r\n\r\n  if new.reason = 'outlet_sale' then\r\n    v_level := 'finished';\r\n  elsif v_component_kind = 'ingredient' then\r\n    v_level := 'ingredient';\r\n  else\r\n    v_level := 'raw';\r\n  end if;\r\n\r\n  if new.warehouse_id is not null then\r\n    select wli.net_units\r\n      into v_available\r\n    from public.warehouse_live_items wli\r\n    where wli.warehouse_id = new.warehouse_id\r\n      and wli.item_id = new.item_id\r\n      and public.normalize_variant_key(wli.variant_key) = public.normalize_variant_key(coalesce(new.variant_key, 'base'))\r\n    limit 1;\r\n  end if;\r\n\r\n  if v_available is not null and v_available < 0 then\r\n    v_negative := true;\r\n  end if;\r\n\r\n  if v_flow_batch_id is not null then\r\n    insert into public.flow_traces (\r\n      sale_id,\r\n      order_id,\r\n      outlet_id,\r\n      level,\r\n      item_id,\r\n      variant_key,\r\n      warehouse_id,\r\n      flow_batch_id,\r\n      context\r\n    ) values (\r\n      v_sale_id,\r\n      v_order_id,\r\n      v_outlet_id,\r\n      v_level,\r\n      new.item_id,\r\n      public.normalize_variant_key(coalesce(new.variant_key, 'base')),\r\n      new.warehouse_id,\r\n      v_flow_batch_id,\r\n      new.context\r\n    )\r\n    on conflict on constraint ux_flow_traces_batch_level_item_wh\r\n    do update set\r\n      context = excluded.context\r\n    returning id into v_trace_id;\r\n  else\r\n    insert into public.flow_traces (\r\n      sale_id,\r\n      order_id,\r\n      outlet_id,\r\n      level,\r\n      item_id,\r\n      variant_key,\r\n      warehouse_id,\r\n      context\r\n    ) values (\r\n      v_sale_id,\r\n      v_order_id,\r\n      v_outlet_id,\r\n      v_level,\r\n      new.item_id,\r\n      public.normalize_variant_key(coalesce(new.variant_key, 'base')),\r\n      new.warehouse_id,\r\n      new.context\r\n    )\r\n    on conflict on constraint ux_flow_traces_sale_level_item_wh\r\n    do update set\r\n      context = excluded.context\r\n    returning id into v_trace_id;\r\n  end if;\r\n\r\n  insert into public.flow_trace_steps (\r\n    trace_id,\r\n    occurred_at,\r\n    delta_units,\r\n    available_units,\r\n    reason,\r\n    negative,\r\n    context,\r\n    flow_batch_id,\r\n    ledger_id\r\n  ) values (\r\n    v_trace_id,\r\n    new.occurred_at,\r\n    new.delta_units,\r\n    v_available,\r\n    new.reason,\r\n    v_negative,\r\n    new.context,\r\n    v_flow_batch_id,\r\n    new.id\r\n  )\r\n  on conflict (ledger_id)\r\n  do nothing;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "stock_ledger_flow_trace",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.stock_ledger_set_occurred_at()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  new.occurred_at := coalesce(\r\n    new.occurred_at,\r\n    (new.context->>'sold_at')::timestamptz,\r\n    (new.context->>'order_created_at')::timestamptz,\r\n    (new.context->>'movement_created_at')::timestamptz,\r\n    now()\r\n  );\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "stock_ledger_set_occurred_at",
          "function_schema": "public"
        },
        {
          "arguments": "p_email text, p_pin text",
          "definition": "CREATE OR REPLACE FUNCTION public.stocktake_app_login(p_email text, p_pin text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public, private'\n SET row_security TO 'off'\nAS $function$\r\ndeclare\r\n  v_user public.stocktake_app_users%rowtype;\r\n  v_now timestamptz := now();\r\n  v_exp_seconds bigint;\r\n  v_payload jsonb;\r\n  v_token text;\r\n  v_secret text;\r\nbegin\r\n  if p_email is null or btrim(p_email) = '' or p_pin is null or btrim(p_pin) = '' then\r\n    raise exception 'email and pin required';\r\n  end if;\r\n\r\n  select *\r\n  into v_user\r\n  from public.stocktake_app_users\r\n  where lower(email) = lower(p_email)\r\n    and active\r\n  limit 1;\r\n\r\n  if not found or (v_user.pin_hash <> p_pin and extensions.crypt(p_pin, v_user.pin_hash) <> v_user.pin_hash) then\r\n    raise exception 'invalid credentials';\r\n  end if;\r\n\r\n  update public.stocktake_app_users\r\n  set last_login_at = v_now\r\n  where id = v_user.id;\r\n\r\n  v_exp_seconds := extract(epoch from (v_now + interval '12 hours'))::bigint;\r\n  v_payload := jsonb_build_object(\r\n    'sub', v_user.id::text,\r\n    'email', v_user.email,\r\n    'role', 'authenticated',\r\n    'iat', extract(epoch from v_now)::bigint,\r\n    'exp', v_exp_seconds\r\n  );\r\n\r\n  select jwt_secret into v_secret from private.app_settings where id = true;\r\n  if v_secret is null or v_secret = '' then\r\n    raise exception 'jwt secret not configured';\r\n  end if;\r\n\r\n  v_token := extensions.sign(v_payload::json, v_secret);\r\n\r\n  return jsonb_build_object(\r\n    'token', v_token,\r\n    'refresh_token', '',\r\n    'expires_at', (v_exp_seconds * 1000),\r\n    'outlet_id', '',\r\n    'outlet_name', '',\r\n    'user_id', v_user.id::text,\r\n    'email', v_user.email,\r\n    'display_name', v_user.display_name,\r\n    'roles', jsonb_build_array(jsonb_build_object(\r\n      'id', '95b6a75d-bd46-4764-b5ea-981b1608f1ca',\r\n      'slug', 'stock operator',\r\n      'normalized_slug', 'stock operator',\r\n      'display_name', 'Stock Operator'\r\n    )),\r\n    'is_admin', false,\r\n    'can_transfer', false,\r\n    'is_transfer_manager', false,\r\n    'is_supervisor', false\r\n  );\r\nend;\r\n$function$\n",
          "function_name": "stocktake_app_login",
          "function_schema": "public"
        },
        {
          "arguments": "p_user uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.stocktake_outlet_ids(p_user uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT COALESCE(\r\n    array_agg(ur.outlet_id),\r\n    '{}'\r\n  )\r\n  FROM public.user_roles ur\r\n  WHERE ur.user_id = p_user\r\n    AND ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'\r\n    AND ur.outlet_id IS NOT NULL;\r\n$function$\n",
          "function_name": "stocktake_outlet_ids",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.supervisor_approve_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  PERFORM public.accept_order(p_order_id, p_supervisor_name, p_signature_path, p_pdf_path);\r\nEND;\r\n$function$\n",
          "function_name": "supervisor_approve_order",
          "function_schema": "public"
        },
        {
          "arguments": "p_order_item_id uuid, p_new_variant_key text, p_new_name text DEFAULT NULL::text, p_receiving_uom text DEFAULT NULL::text, p_consumption_uom text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric",
          "definition": "CREATE OR REPLACE FUNCTION public.supervisor_merge_order_item_variant(p_order_item_id uuid, p_new_variant_key text, p_new_name text DEFAULT NULL::text, p_receiving_uom text DEFAULT NULL::text, p_consumption_uom text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_src public.order_items%rowtype;\r\n  v_order public.orders%rowtype;\r\n  v_new_key text;\r\n  v_target_id uuid;\r\n  v_target_qty numeric;\r\n  v_merged_qty numeric;\r\nBEGIN\r\n  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n\r\n  SELECT * INTO v_src FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order item not found';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = v_src.order_id FOR UPDATE;\r\n  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN\r\n    RAISE EXCEPTION 'order must be placed to merge variants';\r\n  END IF;\r\n\r\n  v_new_key := public.normalize_variant_key(COALESCE(p_new_variant_key, 'base'));\r\n\r\n  SELECT oi.id, oi.qty\r\n    INTO v_target_id, v_target_qty\r\n  FROM public.order_items oi\r\n  WHERE oi.order_id = v_src.order_id\r\n    AND oi.product_id = v_src.product_id\r\n    AND public.normalize_variant_key(oi.variation_key) = v_new_key\r\n    AND oi.id <> v_src.id\r\n  LIMIT 1;\r\n\r\n  IF v_target_id IS NOT NULL THEN\r\n    v_merged_qty := COALESCE(v_target_qty, 0) + COALESCE(v_src.qty, 0);\r\n    UPDATE public.order_items\r\n    SET qty = v_merged_qty,\r\n        amount = COALESCE(cost, 0) * v_merged_qty\r\n    WHERE id = v_target_id;\r\n\r\n    PERFORM set_config('order_items.supervisor_merge', 'on', true);\r\n    DELETE FROM public.order_items WHERE id = v_src.id;\r\n    PERFORM set_config('order_items.supervisor_merge', 'off', true);\r\n  ELSE\r\n    UPDATE public.order_items\r\n    SET variation_key = v_new_key,\r\n        name = COALESCE(NULLIF(p_new_name, ''), name),\r\n        receiving_uom = COALESCE(NULLIF(p_receiving_uom, ''), receiving_uom),\r\n        consumption_uom = COALESCE(NULLIF(p_consumption_uom, ''), consumption_uom),\r\n        cost = COALESCE(p_cost, cost),\r\n        amount = COALESCE(COALESCE(p_cost, cost), 0) * COALESCE(qty, 0)\r\n    WHERE id = v_src.id;\r\n  END IF;\r\nEND;\r\n$function$\n",
          "function_name": "supervisor_merge_order_item_variant",
          "function_schema": "public"
        },
        {
          "arguments": "p_warehouse_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)\n RETURNS TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean, scanner_id uuid, scanner_name text)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    s.id,\r\n    s.name,\r\n    s.contact_name,\r\n    s.contact_phone,\r\n    s.contact_email,\r\n    s.active,\r\n    s.scanner_id,\r\n    sc.name AS scanner_name\r\n  FROM public.product_supplier_links psl\r\n  JOIN public.suppliers s ON s.id = psl.supplier_id\r\n  LEFT JOIN public.scanners sc ON sc.id = s.scanner_id\r\n  WHERE s.active\r\n    AND psl.active\r\n    AND (\r\n      p_warehouse_id IS NULL\r\n      OR psl.warehouse_id IS NULL\r\n      OR psl.warehouse_id = p_warehouse_id\r\n    );\r\n$function$\n",
          "function_name": "suppliers_for_warehouse",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_item_storage_homes_from_item()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_item_id uuid;\r\n  v_ids uuid[];\r\n  v_new jsonb;\r\nbegin\r\n  v_item_id := coalesce(new.id, old.id);\r\n  if v_item_id is null then\r\n    return coalesce(new, old);\r\n  end if;\r\n\r\n  if tg_op = 'DELETE' then\r\n    delete from public.item_storage_homes\r\n    where item_id = v_item_id\r\n      and normalized_variant_key = 'base';\r\n    return old;\r\n  end if;\r\n\r\n  v_new := to_jsonb(new);\r\n\r\n  v_ids := array(\r\n    select distinct id_text::uuid\r\n    from (\r\n      select jsonb_array_elements_text(coalesce(v_new->'storage_home_ids', '[]'::jsonb)) as id_text\r\n      union all\r\n      select jsonb_array_elements_text(\r\n        jsonb_build_array(\r\n          v_new->>'storage_home_id',\r\n          v_new->>'default_warehouse_id'\r\n        )\r\n      ) as id_text\r\n    ) t\r\n    where id_text is not null\r\n      and id_text <> ''\r\n      and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'\r\n  );\r\n\r\n  delete from public.item_storage_homes\r\n  where item_id = v_item_id\r\n    and normalized_variant_key = 'base';\r\n\r\n  if v_ids is not null and array_length(v_ids, 1) is not null then\r\n    insert into public.item_storage_homes (item_id, variant_key, storage_warehouse_id)\r\n    select v_item_id, 'base', unnest(v_ids)\r\n    on conflict do nothing;\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_item_storage_homes_from_item",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_item_storage_homes_from_variant()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_item_id uuid;\r\n  v_variant_key text;\r\n  v_ids uuid[];\r\n  v_new jsonb;\r\nbegin\r\n  v_item_id := coalesce(new.item_id, old.item_id);\r\n  v_variant_key := public.normalize_variant_key(coalesce(new.id, old.id));\r\n  if v_item_id is null or v_variant_key is null then\r\n    return coalesce(new, old);\r\n  end if;\r\n\r\n  if tg_op = 'DELETE' then\r\n    delete from public.item_storage_homes\r\n    where item_id = v_item_id\r\n      and normalized_variant_key = v_variant_key;\r\n    return old;\r\n  end if;\r\n\r\n  v_new := to_jsonb(new);\r\n\r\n  v_ids := array(\r\n    select distinct id_text::uuid\r\n    from (\r\n      select jsonb_array_elements_text(coalesce(v_new->'storage_home_ids', '[]'::jsonb)) as id_text\r\n      union all\r\n      select jsonb_array_elements_text(\r\n        jsonb_build_array(\r\n          v_new->>'storage_home_id',\r\n          v_new->>'default_warehouse_id'\r\n        )\r\n      ) as id_text\r\n    ) t\r\n    where id_text is not null\r\n      and id_text <> ''\r\n      and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'\r\n  );\r\n\r\n  delete from public.item_storage_homes\r\n  where item_id = v_item_id\r\n    and normalized_variant_key = v_variant_key;\r\n\r\n  if v_ids is not null and array_length(v_ids, 1) is not null then\r\n    insert into public.item_storage_homes (item_id, variant_key, storage_warehouse_id)\r\n    select v_item_id, v_variant_key, unnest(v_ids)\r\n    on conflict do nothing;\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_item_storage_homes_from_variant",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_opening_stock_to_ledger()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_item_id uuid;\r\n  v_variant text;\r\n  v_period_id uuid;\r\n  v_warehouse_id uuid;\r\n  v_desired numeric := 0;\r\n  v_current numeric := 0;\r\n  v_delta numeric := 0;\r\n  v_kind text;\r\nbegin\r\n  if tg_op = 'DELETE' then\r\n    return old;\r\n  end if;\r\n\r\n  v_kind := lower(coalesce(new.kind, ''));\r\n  if v_kind not in ('opening', 'closing') then\r\n    return new;\r\n  end if;\r\n\r\n  v_item_id := new.item_id;\r\n  v_variant := public.normalize_variant_key(new.variant_key);\r\n  v_period_id := new.period_id;\r\n  v_desired := coalesce(new.counted_qty, 0);\r\n\r\n  select wsp.warehouse_id\r\n    into v_warehouse_id\r\n  from public.warehouse_stock_periods wsp\r\n  where wsp.id = v_period_id\r\n  limit 1;\r\n\r\n  if v_warehouse_id is null then\r\n    return new;\r\n  end if;\r\n\r\n  select coalesce(sum(sl.delta_units), 0)\r\n    into v_current\r\n  from public.stock_ledger sl\r\n  where sl.location_type = 'warehouse'\r\n    and sl.warehouse_id = v_warehouse_id\r\n    and sl.item_id = v_item_id\r\n    and public.normalize_variant_key(sl.variant_key) = v_variant;\r\n\r\n  v_delta := v_desired - coalesce(v_current, 0);\r\n  if v_delta = 0 then\r\n    return new;\r\n  end if;\r\n\r\n  insert into public.stock_ledger(\r\n    location_type,\r\n    warehouse_id,\r\n    item_id,\r\n    variant_key,\r\n    delta_units,\r\n    reason,\r\n    context,\r\n    occurred_at\r\n  ) values (\r\n    'warehouse',\r\n    v_warehouse_id,\r\n    v_item_id,\r\n    v_variant,\r\n    v_delta,\r\n    'opening_stock',\r\n    jsonb_build_object('period_id', v_period_id::text, 'source', 'stock_count', 'kind', v_kind),\r\n    now()\r\n  );\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_opening_stock_to_ledger",
          "function_schema": "public"
        },
        {
          "arguments": "payload jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_outlet uuid := (payload->>'outlet_id')::uuid;\r\n  v_source text := payload->>'source_event_id';\r\n  v_order_id uuid;\r\n  v_item jsonb;\r\n  v_resolved record;\r\n  v_qty numeric;\r\n  v_qty_text text;\r\n  v_branch integer := nullif(payload->>'branch_id', '')::integer;\r\n  v_outlet_name text;\r\n  v_item_sku text;\r\n  v_variant_sku text;\r\n  v_ctx jsonb;\r\n  v_sold_at timestamptz;\r\nBEGIN\r\n  IF v_outlet IS NULL OR v_source IS NULL THEN\r\n    RAISE EXCEPTION 'outlet_id and source_event_id are required';\r\n  END IF;\r\n\r\n  SELECT id INTO v_order_id FROM public.orders WHERE source_event_id = v_source;\r\n  IF FOUND THEN RETURN; END IF;\r\n\r\n  v_sold_at := COALESCE(nullif(payload->>'occurred_at','')::timestamptz, now());\r\n  SELECT name INTO v_outlet_name FROM public.outlets WHERE id = v_outlet;\r\n\r\n  INSERT INTO public.orders(\r\n    outlet_id, source_event_id, pos_sale_id, status, locked, branch_id, pos_branch_id,\r\n    order_type, bill_type, total_discount, total_discount_amount, total_gst,\r\n    service_charges, delivery_charges, tip, pos_fee, price_type,\r\n    customer_name, customer_phone, customer_email, raw_payload\r\n  )\r\n  VALUES (\r\n    v_outlet, v_source, nullif(payload->>'sale_id',''),\r\n    'synced', true, v_branch, v_branch,\r\n    payload->>'order_type', payload->>'bill_type',\r\n    nullif(payload->>'total_discount','')::numeric,\r\n    nullif(payload->>'total_discount_amount','')::numeric,\r\n    nullif(payload->>'total_gst','')::numeric,\r\n    nullif(payload->>'service_charges','')::numeric,\r\n    nullif(payload->>'delivery_charges','')::numeric,\r\n    nullif(payload->>'tip','')::numeric,\r\n    nullif(payload->>'pos_fee','')::numeric,\r\n    payload->>'price_type',\r\n    payload->'customer'->>'name',\r\n    payload->'customer'->>'phone',\r\n    payload->'customer'->>'email',\r\n    payload\r\n  )\r\n  RETURNING id INTO v_order_id;\r\n\r\n  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))\r\n  LOOP\r\n    v_item_sku := nullif(trim(COALESCE(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');\r\n    v_variant_sku := nullif(trim(COALESCE(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');\r\n    IF v_item_sku IS NULL THEN CONTINUE; END IF;\r\n\r\n    SELECT * INTO v_resolved FROM public.resolve_catalog_by_sku(v_item_sku, v_variant_sku) LIMIT 1;\r\n    IF NOT FOUND THEN CONTINUE; END IF;\r\n\r\n    v_qty_text := nullif(v_item->>'quantity', '');\r\n    v_qty := COALESCE(v_qty_text::numeric, 0);\r\n    IF v_qty <= 0 THEN CONTINUE; END IF;\r\n\r\n    v_ctx := jsonb_build_object(\r\n      'outlet_name', v_outlet_name,\r\n      'outlet_id', v_outlet,\r\n      'catalog_item_id', v_resolved.catalog_item_id,\r\n      'catalog_item_name', v_resolved.catalog_item_name,\r\n      'catalog_item_sku', v_resolved.catalog_item_sku,\r\n      'variant_key', v_resolved.variant_key,\r\n      'variant_name', v_resolved.variant_name,\r\n      'variant_sku', v_resolved.variant_sku,\r\n      'pos_item_id', v_item->>'pos_item_id',\r\n      'source_event_id', v_source,\r\n      'order_id', v_order_id\r\n    );\r\n\r\n    INSERT INTO public.outlet_sales(\r\n      outlet_id, item_id, qty_units, variant_key, sold_at, sale_price,\r\n      vat_exc_price, flavour_price, flavour_id, context\r\n    )\r\n    VALUES (\r\n      v_outlet, v_resolved.catalog_item_id, v_qty, v_resolved.variant_key, v_sold_at,\r\n      nullif(v_item->>'sale_price','')::numeric,\r\n      nullif(v_item->>'vat_exc_price','')::numeric,\r\n      nullif(v_item->>'flavour_price','')::numeric,\r\n      v_item->>'flavour_id',\r\n      v_ctx\r\n    );\r\n\r\n    PERFORM public.apply_pos_sale_deduction_rules(\r\n      p_outlet_id := v_outlet,\r\n      p_sold_item_id := v_resolved.catalog_item_id,\r\n      p_sold_variant_key := v_resolved.variant_key,\r\n      p_sale_qty := v_qty,\r\n      p_sold_at := v_sold_at,\r\n      p_context := v_ctx\r\n    );\r\n  END LOOP;\r\nEND;\r\n$function$\n",
          "function_name": "sync_pos_order",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_recipe_ingredient_outlet_products()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\ndeclare\r\n  finished_id uuid;\r\n  ingredient_id uuid;\r\n  recipe_kind text;\r\n  recipe_active boolean;\r\nbegin\r\n  finished_id := coalesce(new.finished_item_id, old.finished_item_id);\r\n  ingredient_id := coalesce(new.ingredient_item_id, old.ingredient_item_id);\r\n  recipe_kind := coalesce(new.recipe_for_kind, old.recipe_for_kind);\r\n  recipe_active := coalesce(new.active, old.active, false);\r\n\r\n  if finished_id is null or ingredient_id is null then\r\n    return coalesce(new, old);\r\n  end if;\r\n\r\n  if recipe_kind <> 'finished' or recipe_active = false then\r\n    return coalesce(new, old);\r\n  end if;\r\n\r\n  insert into public.outlet_products (outlet_id, item_id, variant_key, enabled)\r\n  select distinct r.outlet_id, ingredient_id, 'base', true\r\n  from public.outlet_item_routes r\r\n  where r.item_id = finished_id\r\n    and r.normalized_variant_key = 'base'\r\n  on conflict (outlet_id, item_id, variant_key)\r\n    do update set enabled = excluded.enabled;\r\n\r\n  return coalesce(new, old);\r\nend;\r\n$function$\n",
          "function_name": "sync_recipe_ingredient_outlet_products",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_variant_order_routes_from_base_route()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  variant_keys text[];\r\nbegin\r\n  if coalesce(new.normalized_variant_key, '') <> 'base' then\r\n    return new;\r\n  end if;\r\n\r\n  select array_agg(distinct cv.id) into variant_keys\r\n  from public.catalog_variants cv\r\n  where cv.item_id = new.item_id\r\n    and coalesce(cv.active, true)\r\n    and public.normalize_variant_key(cv.id) <> 'base';\r\n\r\n  if variant_keys is null or array_length(variant_keys, 1) is null then\r\n    return new;\r\n  end if;\r\n\r\n  insert into public.outlet_order_routes (\r\n    outlet_id,\r\n    item_id,\r\n    warehouse_id,\r\n    variant_key,\r\n    normalized_variant_key,\r\n    created_at,\r\n    updated_at\r\n  )\r\n  select\r\n    new.outlet_id,\r\n    new.item_id,\r\n    new.warehouse_id,\r\n    key,\r\n    public.normalize_variant_key(key),\r\n    now(),\r\n    now()\r\n  from unnest(variant_keys) as key\r\n  on conflict (outlet_id, item_id, normalized_variant_key)\r\n    do update set\r\n      warehouse_id = excluded.warehouse_id,\r\n      variant_key = excluded.variant_key,\r\n      updated_at = now();\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_variant_order_routes_from_base_route",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_variant_routes_from_base()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\ndeclare\r\n  v_variant_key text;\r\n  route_row record;\r\nbegin\r\n  if coalesce(new.active, true) is false then\r\n    return new;\r\n  end if;\r\n\r\n  v_variant_key := public.normalize_variant_key(new.id);\r\n  if v_variant_key = 'base' then\r\n    return new;\r\n  end if;\r\n\r\n  for route_row in\r\n    select outlet_id, warehouse_id, deduct_enabled, target_outlet_id\r\n    from outlet_item_routes\r\n    where item_id = new.item_id and normalized_variant_key = 'base'\r\n  loop\r\n    insert into outlet_item_routes (\r\n      outlet_id,\r\n      item_id,\r\n      warehouse_id,\r\n      variant_key,\r\n      normalized_variant_key,\r\n      deduct_enabled,\r\n      target_outlet_id\r\n    )\r\n    values (\r\n      route_row.outlet_id,\r\n      new.item_id,\r\n      route_row.warehouse_id,\r\n      new.id,\r\n      v_variant_key,\r\n      coalesce(route_row.deduct_enabled, true),\r\n      route_row.target_outlet_id\r\n    )\r\n    on conflict (outlet_id, item_id, normalized_variant_key)\r\n      do update set\r\n        warehouse_id = excluded.warehouse_id,\r\n        deduct_enabled = excluded.deduct_enabled,\r\n        target_outlet_id = excluded.target_outlet_id;\r\n\r\n    insert into outlet_products (outlet_id, item_id, variant_key, enabled)\r\n    values (route_row.outlet_id, new.item_id, v_variant_key, true)\r\n    on conflict (outlet_id, item_id, variant_key)\r\n      do update set enabled = excluded.enabled;\r\n  end loop;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_variant_routes_from_base",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_variant_routes_from_base_route()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\ndeclare\r\n  variant_keys text[];\r\nbegin\r\n  if coalesce(new.normalized_variant_key, '') <> 'base' then\r\n    return new;\r\n  end if;\r\n\r\n  select array_agg(distinct cv.id) into variant_keys\r\n  from public.catalog_variants cv\r\n  where cv.item_id = new.item_id\r\n    and coalesce(cv.active, true)\r\n    and public.normalize_variant_key(cv.id) <> 'base';\r\n\r\n  if variant_keys is null or array_length(variant_keys, 1) is null then\r\n    return new;\r\n  end if;\r\n\r\n  insert into public.outlet_item_routes (\r\n    outlet_id,\r\n    item_id,\r\n    warehouse_id,\r\n    variant_key,\r\n    normalized_variant_key,\r\n    deduct_enabled,\r\n    target_outlet_id\r\n  )\r\n  select\r\n    new.outlet_id,\r\n    new.item_id,\r\n    new.warehouse_id,\r\n    key,\r\n    public.normalize_variant_key(key),\r\n    coalesce(new.deduct_enabled, true),\r\n    new.target_outlet_id\r\n  from unnest(variant_keys) as key\r\n  on conflict (outlet_id, item_id, normalized_variant_key)\r\n    do update set\r\n      warehouse_id = excluded.warehouse_id,\r\n      deduct_enabled = excluded.deduct_enabled,\r\n      target_outlet_id = excluded.target_outlet_id;\r\n\r\n  insert into public.outlet_products (outlet_id, item_id, variant_key, enabled)\r\n  select new.outlet_id, new.item_id, key, true\r\n  from unnest(variant_keys) as key\r\n  on conflict (outlet_id, item_id, variant_key)\r\n    do update set enabled = excluded.enabled;\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_variant_routes_from_base_route",
          "function_schema": "public"
        },
        {
          "arguments": "p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_reference text;\r\n  v_transfer_id uuid;\r\n  v_variant_key text;\r\n  v_occurred_at timestamptz;\r\nbegin\r\n  if p_source is null or p_destination is null then\r\n    raise exception 'source and destination required';\r\n  end if;\r\n\r\n  -- Require an open stock period on the source warehouse only.\r\n  perform public.require_open_stock_period_for_outlet_warehouse(p_source);\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one transfer line is required';\r\n  end if;\r\n\r\n  v_reference := public.next_transfer_reference();\r\n\r\n  insert into public.warehouse_transfers(\r\n    reference_code,\r\n    source_warehouse_id,\r\n    destination_warehouse_id,\r\n    note,\r\n    context,\r\n    created_by\r\n  ) values (\r\n    v_reference,\r\n    p_source,\r\n    p_destination,\r\n    p_note,\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) returning id, created_at into v_transfer_id, v_occurred_at;\r\n\r\n  v_occurred_at := coalesce(v_occurred_at, now());\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each line needs product_id and qty > 0';\r\n    end if;\r\n\r\n    v_variant_key := public.normalize_variant_key(rec.variant_key);\r\n\r\n    insert into public.warehouse_transfer_items(transfer_id, item_id, variant_key, qty_units)\r\n    values (v_transfer_id, rec.item_id, v_variant_key, rec.qty_units);\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_source,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      -1 * rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out', 'transfer_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_destination,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in', 'transfer_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n  end loop;\r\n\r\n  return v_reference;\r\nend;\r\n$function$\n",
          "function_name": "transfer_units_between_warehouses",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.trg_set_stock_period_outlet_id()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  IF NEW.outlet_id IS NULL THEN\r\n    SELECT ow.outlet_id INTO NEW.outlet_id\r\n    FROM public.outlet_warehouses ow\r\n    WHERE ow.warehouse_id = NEW.warehouse_id\r\n    ORDER BY ow.outlet_id\r\n    LIMIT 1;\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
          "function_name": "trg_set_stock_period_outlet_id",
          "function_schema": "public"
        },
        {
          "arguments": "payload jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.upsert_outlet_heartbeat(payload jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;\r\nBEGIN\r\n  IF v_outlet IS NULL THEN\r\n    RAISE EXCEPTION 'outlet_id is required';\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_pos_heartbeats(outlet_id, last_seen_at, middleware_version, host_name, updated_at)\r\n  VALUES (\r\n    v_outlet,\r\n    now(),\r\n    nullif(payload->>'middleware_version', ''),\r\n    nullif(payload->>'host_name', ''),\r\n    now()\r\n  )\r\n  ON CONFLICT (outlet_id) DO UPDATE SET\r\n    last_seen_at = EXCLUDED.last_seen_at,\r\n    middleware_version = COALESCE(EXCLUDED.middleware_version, public.outlet_pos_heartbeats.middleware_version),\r\n    host_name = COALESCE(EXCLUDED.host_name, public.outlet_pos_heartbeats.host_name),\r\n    updated_at = now();\r\nEND;\r\n$function$\n",
          "function_name": "upsert_outlet_heartbeat",
          "function_schema": "public"
        },
        {
          "arguments": "p_item_id uuid, p_variant_key text, p_source_uom text, p_target_uom text",
          "definition": "CREATE OR REPLACE FUNCTION public.upsert_recipe_uom_profile(p_item_id uuid, p_variant_key text, p_source_uom text, p_target_uom text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_id uuid;\r\nbegin\r\n  insert into public.recipe_uom_profiles (item_id, variant_key, source_uom, target_uom, active)\r\n  values (p_item_id, coalesce(p_variant_key, 'base'), p_source_uom, p_target_uom, true)\r\n  on conflict (item_id, variant_key, active)\r\n  do update set\r\n    source_uom = excluded.source_uom,\r\n    target_uom = excluded.target_uom,\r\n    updated_at = now()\r\n  returning id into v_id;\r\n\r\n  return v_id;\r\nend;\r\n$function$\n",
          "function_name": "upsert_recipe_uom_profile",
          "function_schema": "public"
        },
        {
          "arguments": "payload jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;\r\n  v_source text := nullif(payload->>'source_event_id', '');\r\n  v_item jsonb;\r\n  v_resolved record;\r\n  v_qty numeric;\r\n  v_qty_text text;\r\n  v_errors jsonb := '[]'::jsonb;\r\n  v_has_mapped boolean := false;\r\n  v_item_sku text;\r\n  v_variant_sku text;\r\n  v_sold_at timestamptz;\r\n  v_has_middleware boolean := false;\r\nBEGIN\r\n  IF v_outlet IS NULL THEN\r\n    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_outlet','message','outlet_id is required'));\r\n    RETURN jsonb_build_object('ok', false, 'errors', v_errors);\r\n  END IF;\r\n\r\n  IF v_source IS NULL THEN\r\n    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_source','message','source_event_id is required'));\r\n    RETURN jsonb_build_object('ok', false, 'errors', v_errors);\r\n  END IF;\r\n\r\n  SELECT COALESCE(o.has_pos_middleware, false)\r\n  INTO v_has_middleware\r\n  FROM public.outlets o\r\n  WHERE o.id = v_outlet;\r\n\r\n  IF NOT v_has_middleware THEN\r\n    v_errors := v_errors || jsonb_build_array(jsonb_build_object(\r\n      'code', 'middleware_disabled',\r\n      'message', 'POS middleware is not enabled for this outlet'\r\n    ));\r\n    RETURN jsonb_build_object('ok', false, 'errors', v_errors);\r\n  END IF;\r\n\r\n  IF EXISTS (SELECT 1 FROM public.orders WHERE source_event_id = v_source) THEN\r\n    RETURN jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'duplicate', true);\r\n  END IF;\r\n\r\n  v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());\r\n  IF NOT public.outlet_pos_sale_in_sync_window(v_outlet, v_sold_at) THEN\r\n    v_errors := v_errors || jsonb_build_array(jsonb_build_object(\r\n      'code', 'outside_sync_window',\r\n      'message', 'Sale is outside the current POS sync window — open a stocktake period in the Afterten Orders app'\r\n    ));\r\n    RETURN jsonb_build_object('ok', false, 'errors', v_errors);\r\n  END IF;\r\n\r\n  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))\r\n  LOOP\r\n    v_item_sku := nullif(trim(COALESCE(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');\r\n    v_variant_sku := nullif(trim(COALESCE(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');\r\n\r\n    IF v_item_sku IS NULL THEN\r\n      v_errors := v_errors || jsonb_build_array(jsonb_build_object(\r\n        'code', 'missing_item_sku',\r\n        'message', format('Line \"%s\" has no item SKU — set MenuItem.Code to catalog SKU on POS', COALESCE(v_item->>'name', v_item->>'pos_item_id'))\r\n      ));\r\n      CONTINUE;\r\n    END IF;\r\n\r\n    SELECT * INTO v_resolved FROM public.resolve_catalog_by_sku(v_item_sku, v_variant_sku) LIMIT 1;\r\n    IF NOT FOUND THEN\r\n      v_errors := v_errors || jsonb_build_array(jsonb_build_object(\r\n        'code', 'unknown_sku',\r\n        'message', format('No catalog match for SKU %s%s', v_item_sku, CASE WHEN v_variant_sku IS NOT NULL THEN ' / ' || v_variant_sku ELSE '' END)\r\n      ));\r\n      CONTINUE;\r\n    END IF;\r\n\r\n    v_qty_text := nullif(v_item->>'quantity', '');\r\n    v_qty := COALESCE(v_qty_text::numeric, 0);\r\n    IF v_qty <= 0 THEN\r\n      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','invalid_qty','message','quantity must be > 0'));\r\n      CONTINUE;\r\n    END IF;\r\n\r\n    v_has_mapped := true;\r\n  END LOOP;\r\n\r\n  IF NOT v_has_mapped AND jsonb_array_length(COALESCE(payload->'items', '[]'::jsonb)) > 0 THEN\r\n    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','no_mappable_items','message','No line items matched catalog SKUs'));\r\n  END IF;\r\n\r\n  RETURN jsonb_build_object('ok', jsonb_array_length(v_errors) = 0 OR v_has_mapped, 'errors', v_errors);\r\nEND;\r\n$function$\n",
          "function_name": "validate_pos_order",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.whoami_outlet()\n RETURNS TABLE(outlet_id uuid, outlet_name text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n  RETURN QUERY\r\n  SELECT o.id, o.name\r\n  FROM public.outlets o\r\n  WHERE o.active AND o.auth_user_id = v_uid;\r\nEND;\r\n$function$\n",
          "function_name": "whoami_outlet",
          "function_schema": "public"
        },
        {
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.whoami_roles()\n RETURNS TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_email text;\r\n  v_is_admin boolean := false;\r\n  v_is_backoffice boolean := false;\r\n  v_roles text[] := ARRAY[]::text[];\r\n  v_outlets jsonb := '[]'::jsonb;\r\n  v_role_catalog jsonb := '[]'::jsonb;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  -- Qualify column to avoid ambiguity with output parameter \"email\"\r\n  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;\r\n  v_is_admin := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);\r\n  v_is_backoffice := EXISTS (\r\n    SELECT 1 FROM public.user_roles ur\r\n    WHERE ur.user_id = v_uid\r\n      AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'\r\n  );\r\n\r\n  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'description' - 'active' - 'created_at'), '[]'::jsonb)\r\n    INTO v_role_catalog\r\n  FROM (\r\n    SELECT id, slug, normalized_slug, display_name\r\n    FROM public.roles\r\n    WHERE active\r\n    ORDER BY display_name\r\n  ) r;\r\n\r\n  SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])\r\n    INTO v_roles\r\n  FROM public.user_roles ur\r\n  JOIN public.roles r ON r.id = ur.role_id\r\n  WHERE ur.user_id = v_uid AND ur.outlet_id IS NULL;\r\n\r\n  IF v_is_admin THEN\r\n    v_roles := array_append(v_roles, 'admin');\r\n  END IF;\r\n\r\n  IF v_is_admin OR v_is_backoffice THEN\r\n    SELECT COALESCE(\r\n      jsonb_agg(\r\n        jsonb_build_object(\r\n          'outlet_id', o.id,\r\n          'outlet_name', o.name,\r\n          'roles', (\r\n            SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])\r\n            FROM public.user_roles ur2\r\n            JOIN public.roles r ON r.id = ur2.role_id\r\n            WHERE ur2.user_id = v_uid AND ur2.outlet_id = o.id\r\n          ) || CASE WHEN o.auth_user_id = v_uid THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END\r\n        )\r\n      ),\r\n      '[]'::jsonb\r\n    ) INTO v_outlets\r\n    FROM public.outlets o\r\n    WHERE o.active;\r\n  ELSE\r\n    WITH raw_outlets AS (\r\n      SELECT o.id,\r\n             o.name,\r\n             TRUE AS via_auth_mapping\r\n      FROM public.outlets o\r\n      WHERE o.active AND o.auth_user_id = v_uid\r\n\r\n      UNION ALL\r\n\r\n      SELECT o.id,\r\n             o.name,\r\n             FALSE AS via_auth_mapping\r\n      FROM public.user_roles ur\r\n      JOIN public.outlets o ON o.id = ur.outlet_id\r\n      WHERE ur.user_id = v_uid AND o.active\r\n    ),\r\n    outlet_sources AS (\r\n      SELECT id,\r\n             name,\r\n             bool_or(via_auth_mapping) AS via_auth_mapping\r\n      FROM raw_outlets\r\n      GROUP BY id, name\r\n    )\r\n    SELECT COALESCE(\r\n      jsonb_agg(\r\n        jsonb_build_object(\r\n          'outlet_id', src.id,\r\n          'outlet_name', src.name,\r\n          'roles', (\r\n            SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])\r\n            FROM public.user_roles ur2\r\n            JOIN public.roles r ON r.id = ur2.role_id\r\n            WHERE ur2.user_id = v_uid AND ur2.outlet_id = src.id\r\n          ) || CASE WHEN src.via_auth_mapping THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END\r\n        )\r\n      ),\r\n      '[]'::jsonb\r\n    ) INTO v_outlets\r\n    FROM outlet_sources src;\r\n  END IF;\r\n\r\n  RETURN QUERY SELECT v_uid, v_email, v_is_admin, v_roles, v_outlets, v_role_catalog;\r\nEND;\r\n$function$\n",
          "function_name": "whoami_roles",
          "function_schema": "public"
        }
      ],
      "constraints": [
        {
          "table_name": "android_app_versions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155134_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "android_app_versions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155134_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "android_app_versions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155134_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "android_app_versions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155134_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "android_app_versions",
          "column_name": "app_key",
          "table_schema": "public",
          "constraint_name": "android_app_versions_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "android_app_versions",
          "foreign_column_name": "app_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_12_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_15_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_18_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_19_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_20_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_23_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_26_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_27_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18598_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_consumption_qty_positive",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "consumption_qty_per_base",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_cost_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "cost",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_package_contains_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "units_per_purchase_pack",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_purchase_unit_mass_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "purchase_unit_mass",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_qty_decimal_places_chk",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "qty_decimal_places",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_selling_price_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "selling_price",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "catalog_items_transfer_quantity_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "transfer_quantity",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": "default_warehouse_id",
          "table_schema": "public",
          "constraint_name": "catalog_items_default_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": "locked_from_warehouse_id",
          "table_schema": "public",
          "constraint_name": "catalog_items_locked_from_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_items",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "catalog_items_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_13_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_14_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_16_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_19_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_22_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_23_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_24_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_78440_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_variants",
          "column_name": "default_warehouse_id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_default_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "locked_from_warehouse_id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_locked_from_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_item_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "catalog_variants",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_item_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "catalog_variants",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_item_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "catalog_variants",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "catalog_variants",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "catalog_variants_item_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "catalog_variants",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "counter_values",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62385_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "counter_values",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62385_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "counter_values",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62385_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "counter_values",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62385_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "counter_values",
          "column_name": "counter_key",
          "table_schema": "public",
          "constraint_name": "counter_values_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "counter_values",
          "foreign_column_name": "counter_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "counter_values",
          "column_name": "counter_key",
          "table_schema": "public",
          "constraint_name": "counter_values_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "counter_values",
          "foreign_column_name": "scope_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "counter_values",
          "column_name": "scope_id",
          "table_schema": "public",
          "constraint_name": "counter_values_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "counter_values",
          "foreign_column_name": "counter_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "counter_values",
          "column_name": "scope_id",
          "table_schema": "public",
          "constraint_name": "counter_values_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "counter_values",
          "foreign_column_name": "scope_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154715_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": "flow_batch_id",
          "table_schema": "public",
          "constraint_name": "flow_trace_steps_flow_batch_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "stock_flow_batches",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": "ledger_id",
          "table_schema": "public",
          "constraint_name": "flow_trace_steps_ledger_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "stock_ledger",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": "trace_id",
          "table_schema": "public",
          "constraint_name": "flow_trace_steps_trace_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "flow_traces",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_trace_steps",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "flow_trace_steps_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "flow_trace_steps",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154702_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "flow_traces",
          "column_name": "flow_batch_id",
          "table_schema": "public",
          "constraint_name": "flow_traces_flow_batch_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "stock_flow_batches",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "flow_traces",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "flow_traces_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "flow_traces",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_72253_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "item_storage_homes_normalized_chk",
          "constraint_type": "CHECK",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "item_storage_homes_normalized_chk",
          "constraint_type": "CHECK",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "storage_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_storage_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "storage_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "storage_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "storage_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "storage_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "storage_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_storage_homes",
          "column_name": "storage_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_storage_homes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_storage_homes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19904_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "item_transfer_profiles_transfer_quantity_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "item_transfer_profiles",
          "foreign_column_name": "transfer_quantity",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": "from_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_transfer_profiles_from_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_transfer_profiles_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": "to_warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_transfer_profiles_to_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_transfer_profiles",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "item_transfer_profiles_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_transfer_profiles",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19939_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "item_warehouse_handling_policies_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "item_warehouse_handling_policies_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "item_warehouse_handling_policies_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "item_warehouse_handling_policies",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_catalog_schedule",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155688_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_catalog_schedule",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155688_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_catalog_schedule",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "middleware_catalog_schedule_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "middleware_catalog_schedule",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_14_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18871_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "order_items_cost_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "order_items",
          "foreign_column_name": "cost",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "order_items_qty_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "order_items",
          "foreign_column_name": "qty",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": "order_id",
          "table_schema": "public",
          "constraint_name": "order_items_order_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "orders",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": "product_id",
          "table_schema": "public",
          "constraint_name": "order_items_product_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "order_items_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "order_items",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "order_items_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "order_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_28_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18844_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": "approved_by",
          "table_schema": "public",
          "constraint_name": "orders_approved_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": "created_by",
          "table_schema": "public",
          "constraint_name": "orders_created_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "orders",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "orders_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "orders",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "orders_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "orders",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155528_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_catalog_sync_events_entity_type_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_catalog_sync_events",
          "foreign_column_name": "entity_type",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_catalog_sync_events_status_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_catalog_sync_events",
          "foreign_column_name": "status",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_catalog_sync_events_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlet_catalog_sync_events_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_catalog_sync_events",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_12_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_62395_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_norm_chk",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_norm_chk",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "target_outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_target_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "normalized_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_item_routes",
          "column_name": "normalized_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_item_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_item_routes",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_143393_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_order_routes_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_order_routes_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_order_routes_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_order_routes",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlet_order_routes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_order_routes",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_12_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155586_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_deduct_qty_per_sale_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_qty_per_sale",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_deduct_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_sold_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "sold_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_item_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "deduct_variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "sold_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_sold_item_id_sold_vari_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlet_pos_deduction_rules",
          "foreign_column_name": "deduct_item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155511_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155511_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155511_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_heartbeats_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_pos_heartbeats_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_pos_heartbeats",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_69959_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_products",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_69959_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_products",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_69959_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_products",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_69959_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_products",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_products",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_products_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_products",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18747_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlet_sales_qty_units_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlet_sales",
          "foreign_column_name": "qty_units",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "column_name": "created_by",
          "table_schema": "public",
          "constraint_name": "outlet_sales_created_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_sales_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_sales_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_sales_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlet_sales_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_sales",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18717_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "variant_key",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stock_balances",
          "column_name": "variant_key",
          "table_schema": "public",
          "constraint_name": "outlet_stock_balances_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stock_balances",
          "foreign_column_name": "item_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_11_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18810_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": "counted_by",
          "table_schema": "public",
          "constraint_name": "outlet_stocktakes_counted_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "outlet_stocktakes_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_stocktakes_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_stocktakes",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlet_stocktakes_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_stocktakes",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_77200_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_77200_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_77200_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_77200_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_warehouses",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_warehouses",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_warehouses",
          "foreign_column_name": "warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlet_warehouses_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlet_warehouses",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_13_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_14_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18562_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlets_default_wh_match",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlets",
          "foreign_column_name": "default_sales_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlets_default_wh_match",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlets",
          "foreign_column_name": "default_receiving_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlets_sales_wh_required",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlets",
          "foreign_column_name": "deduct_on_pos_sale",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "outlets_sales_wh_required",
          "constraint_type": "CHECK",
          "foreign_table_name": "outlets",
          "foreign_column_name": "default_sales_warehouse_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": "auth_user_id",
          "table_schema": "public",
          "constraint_name": "outlets_auth_user_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlets",
          "column_name": "default_sales_warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlets_default_sales_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "outlets_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "outlets",
          "column_name": "auth_user_id",
          "table_schema": "public",
          "constraint_name": "outlets_auth_user_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "outlets",
          "foreign_column_name": "auth_user_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "platform_admins",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18587_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "platform_admins",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18587_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "platform_admins",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "platform_admins_user_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "platform_admins",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "platform_admins_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "platform_admins",
          "foreign_column_name": "user_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57689_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57689_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57689_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57689_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": "order_id",
          "table_schema": "public",
          "constraint_name": "pos_inventory_consumed_order_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "orders",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "pos_inventory_consumed_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "pos_inventory_consumed_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "pos_inventory_consumed",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_inventory_consumed",
          "column_name": "source_event_id",
          "table_schema": "public",
          "constraint_name": "pos_inventory_consumed_source_event_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "pos_inventory_consumed",
          "foreign_column_name": "source_event_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_item_map",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57714_14_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_item_map",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57714_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_item_map",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57714_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_item_map",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_57714_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_item_map",
          "column_name": "catalog_item_id",
          "table_schema": "public",
          "constraint_name": "pos_item_map_catalog_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_item_map",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "pos_item_map_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_item_map",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "pos_item_map_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "pos_item_map",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "pos_sync_failures",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_71125_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_sync_failures",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_71125_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_sync_failures",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_71125_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_sync_failures",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_71125_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "pos_sync_failures",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "pos_sync_failures_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "pos_sync_failures",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21922_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "product_supplier_links",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "product_supplier_links_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "product_supplier_links",
          "column_name": "supplier_id",
          "table_schema": "public",
          "constraint_name": "product_supplier_links_supplier_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "suppliers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "product_supplier_links",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "product_supplier_links_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "product_supplier_links",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "product_supplier_links_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "product_supplier_links",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19162_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19162_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19162_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19162_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19162_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "roles",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "roles_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "roles",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_88831_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_88831_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_88831_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "scanners",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "scanners_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "scanners",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "scanners",
          "column_name": "name",
          "table_schema": "public",
          "constraint_name": "scanners_name_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "scanners",
          "foreign_column_name": "name",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154735_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_flow_batches",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "stock_flow_batches_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "stock_flow_batches",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18634_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stock_ledger",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "stock_ledger_location_type_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "stock_ledger",
          "foreign_column_name": "location_type",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": "flow_batch_id",
          "table_schema": "public",
          "constraint_name": "stock_ledger_flow_batch_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "stock_flow_batches",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "stock_ledger_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "stock_ledger_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "stock_ledger_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stock_ledger",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "stock_ledger_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "stock_ledger",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_154659_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stocktake_app_users",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "stocktake_app_users_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "stocktake_app_users",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_100249_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "supplier_scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_100249_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "supplier_scanners",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_100249_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "scanner_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_scanner_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "scanners",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "supplier_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_supplier_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "suppliers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "supplier_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "supplier_scanners",
          "foreign_column_name": "scanner_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "supplier_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "supplier_scanners",
          "foreign_column_name": "supplier_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "scanner_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "supplier_scanners",
          "foreign_column_name": "supplier_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "supplier_scanners",
          "column_name": "scanner_id",
          "table_schema": "public",
          "constraint_name": "supplier_scanners_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "supplier_scanners",
          "foreign_column_name": "scanner_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21910_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21910_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21910_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21910_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_21910_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "suppliers_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "suppliers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_74744_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_conversions",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "uom_conversions_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "uom_conversions",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "column_name": "from_uom",
          "table_schema": "public",
          "constraint_name": "uom_conversions_from_uom_to_uom_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "uom_conversions",
          "foreign_column_name": "from_uom",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "column_name": "from_uom",
          "table_schema": "public",
          "constraint_name": "uom_conversions_from_uom_to_uom_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "uom_conversions",
          "foreign_column_name": "to_uom",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "column_name": "to_uom",
          "table_schema": "public",
          "constraint_name": "uom_conversions_from_uom_to_uom_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "uom_conversions",
          "foreign_column_name": "to_uom",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_conversions",
          "column_name": "to_uom",
          "table_schema": "public",
          "constraint_name": "uom_conversions_from_uom_to_uom_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "uom_conversions",
          "foreign_column_name": "from_uom",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155302_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "uom_options",
          "column_name": "code",
          "table_schema": "public",
          "constraint_name": "uom_options_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "uom_options",
          "foreign_column_name": "code",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "uom_options",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "uom_options_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "uom_options",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19174_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "user_roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19174_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "user_roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19174_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "user_roles",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_19174_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "user_roles",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "user_roles_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "role_id",
          "table_schema": "public",
          "constraint_name": "user_roles_role_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "roles",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "user_roles",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "user_roles_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "user_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "user_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "role_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "role_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "user_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "role_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "role_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "role_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "user_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "role_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "user_roles",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "user_roles",
          "foreign_column_name": "outlet_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_backoffice_logs",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_75974_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_backoffice_logs",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_75974_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_backoffice_logs",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_75974_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_backoffice_logs",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_backoffice_logs_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_backoffice_logs",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_damages",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22571_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_damages",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22571_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_damages",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22571_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_damages",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22571_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_damages",
          "column_name": "created_by",
          "table_schema": "public",
          "constraint_name": "warehouse_damages_created_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_damages",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouse_damages_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_damages",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_damages_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_damages",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_12_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_14_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_15_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155268_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_imports",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_imports_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_purchase_imports",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22658_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_items_qty_units_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouse_purchase_items",
          "foreign_column_name": "qty_units",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_items_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": "receipt_id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_items_receipt_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouse_purchase_receipts",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_items",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_items_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_purchase_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22629_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": "recorded_by",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_receipts_recorded_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": "supplier_id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_receipts_supplier_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "suppliers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_receipts_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_purchase_receipts_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_purchase_receipts",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65122_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_counted_qty_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouse_stock_counts",
          "foreign_column_name": "counted_qty",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_kind_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouse_stock_counts",
          "foreign_column_name": "kind",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": "counted_by",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_counted_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": "period_id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_period_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouse_stock_periods",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_counts",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_counts_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_stock_counts",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65087_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65087_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65087_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65087_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_65087_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_status_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouse_stock_periods",
          "foreign_column_name": "status",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "closed_by",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_closed_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "opened_by",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_opened_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_stock_periods",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_stock_periods",
          "column_name": "stocktake_number",
          "table_schema": "public",
          "constraint_name": "warehouse_stock_periods_stocktake_number_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "warehouse_stock_periods",
          "foreign_column_name": "stocktake_number",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22543_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22543_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22543_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22543_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22543_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouse_transfer_items_qty_units_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouse_transfer_items",
          "foreign_column_name": "qty_units",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": "item_id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfer_items_item_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": "transfer_id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfer_items_transfer_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouse_transfers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfer_items",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfer_items_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_transfer_items",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_22515_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": "created_by",
          "table_schema": "public",
          "constraint_name": "warehouse_transfers_created_by_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": "destination_warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfers_destination_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": "source_warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfers_source_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouse_transfers",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouse_transfers_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouse_transfers",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_12_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_13_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_18545_9_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "warehouses_warehouse_scope_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "warehouse_scope",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouses",
          "column_name": "parent_warehouse_id",
          "table_schema": "public",
          "constraint_name": "warehouses_parent_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "warehouses",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "warehouses_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        }
      ],
      "foreign_keys": [
        {
          "table_name": "catalog_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "catalog_items_default_warehouse_id_fkey"
        },
        {
          "table_name": "catalog_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (locked_from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "catalog_items_locked_from_warehouse_id_fkey"
        },
        {
          "table_name": "catalog_variants",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id)",
          "constraint_name": "catalog_variants_default_warehouse_id_fkey"
        },
        {
          "table_name": "catalog_variants",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "catalog_variants_item_id_fkey"
        },
        {
          "table_name": "catalog_variants",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (locked_from_warehouse_id) REFERENCES warehouses(id)",
          "constraint_name": "catalog_variants_locked_from_warehouse_id_fkey"
        },
        {
          "table_name": "flow_trace_steps",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (flow_batch_id) REFERENCES stock_flow_batches(id) ON DELETE SET NULL",
          "constraint_name": "flow_trace_steps_flow_batch_id_fkey"
        },
        {
          "table_name": "flow_trace_steps",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (ledger_id) REFERENCES stock_ledger(id) ON DELETE SET NULL",
          "constraint_name": "flow_trace_steps_ledger_id_fkey"
        },
        {
          "table_name": "flow_trace_steps",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (trace_id) REFERENCES flow_traces(id) ON DELETE CASCADE",
          "constraint_name": "flow_trace_steps_trace_id_fkey"
        },
        {
          "table_name": "flow_traces",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (flow_batch_id) REFERENCES stock_flow_batches(id) ON DELETE SET NULL",
          "constraint_name": "flow_traces_flow_batch_id_fkey"
        },
        {
          "table_name": "item_storage_homes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "item_storage_homes_item_id_fkey"
        },
        {
          "table_name": "item_storage_homes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (storage_warehouse_id) REFERENCES warehouses(id)",
          "constraint_name": "item_storage_homes_storage_warehouse_id_fkey"
        },
        {
          "table_name": "item_transfer_profiles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "item_transfer_profiles_from_warehouse_id_fkey"
        },
        {
          "table_name": "item_transfer_profiles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "item_transfer_profiles_item_id_fkey"
        },
        {
          "table_name": "item_transfer_profiles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "item_transfer_profiles_to_warehouse_id_fkey"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "item_warehouse_handling_policies_item_id_fkey"
        },
        {
          "table_name": "item_warehouse_handling_policies",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "item_warehouse_handling_policies_warehouse_id_fkey"
        },
        {
          "table_name": "order_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE",
          "constraint_name": "order_items_order_id_fkey"
        },
        {
          "table_name": "order_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (product_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "order_items_product_id_fkey"
        },
        {
          "table_name": "order_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "order_items_warehouse_id_fkey"
        },
        {
          "table_name": "orders",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "orders_approved_by_fkey"
        },
        {
          "table_name": "orders",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "orders_created_by_fkey"
        },
        {
          "table_name": "orders",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT",
          "constraint_name": "orders_outlet_id_fkey"
        },
        {
          "table_name": "outlet_catalog_sync_events",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_catalog_sync_events_outlet_id_fkey"
        },
        {
          "table_name": "outlet_item_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_item_routes_item_id_fkey"
        },
        {
          "table_name": "outlet_item_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_item_routes_outlet_id_fkey"
        },
        {
          "table_name": "outlet_item_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (target_outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_item_routes_target_outlet_id_fkey"
        },
        {
          "table_name": "outlet_item_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "outlet_item_routes_warehouse_id_fkey"
        },
        {
          "table_name": "outlet_order_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_order_routes_item_id_fkey"
        },
        {
          "table_name": "outlet_order_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_order_routes_outlet_id_fkey"
        },
        {
          "table_name": "outlet_order_routes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "outlet_order_routes_warehouse_id_fkey"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (deduct_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_deduction_rules_deduct_item_id_fkey"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_deduction_rules_outlet_id_fkey"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (sold_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_deduction_rules_sold_item_id_fkey"
        },
        {
          "table_name": "outlet_pos_deduction_rules",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_deduction_rules_warehouse_id_fkey"
        },
        {
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_heartbeats_outlet_id_fkey"
        },
        {
          "table_name": "outlet_products",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_products_item_id_fkey"
        },
        {
          "table_name": "outlet_products",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_products_outlet_id_fkey"
        },
        {
          "table_name": "outlet_sales",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "outlet_sales_created_by_fkey"
        },
        {
          "table_name": "outlet_sales",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_sales_item_id_fkey"
        },
        {
          "table_name": "outlet_sales",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_sales_outlet_id_fkey"
        },
        {
          "table_name": "outlet_sales",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "outlet_sales_warehouse_id_fkey"
        },
        {
          "table_name": "outlet_stock_balances",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_stock_balances_item_id_fkey"
        },
        {
          "table_name": "outlet_stock_balances",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_stock_balances_outlet_id_fkey"
        },
        {
          "table_name": "outlet_stocktakes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (counted_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "outlet_stocktakes_counted_by_fkey"
        },
        {
          "table_name": "outlet_stocktakes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "outlet_stocktakes_item_id_fkey"
        },
        {
          "table_name": "outlet_stocktakes",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_stocktakes_outlet_id_fkey"
        },
        {
          "table_name": "outlet_warehouses",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_warehouses_outlet_id_fkey"
        },
        {
          "table_name": "outlet_warehouses",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "outlet_warehouses_warehouse_id_fkey"
        },
        {
          "table_name": "outlets",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "outlets_auth_user_id_fkey"
        },
        {
          "table_name": "outlets",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (default_sales_warehouse_id) REFERENCES warehouses(id)",
          "constraint_name": "outlets_default_sales_warehouse_id_fkey"
        },
        {
          "table_name": "platform_admins",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
          "constraint_name": "platform_admins_user_id_fkey"
        },
        {
          "table_name": "pos_inventory_consumed",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL",
          "constraint_name": "pos_inventory_consumed_order_id_fkey"
        },
        {
          "table_name": "pos_inventory_consumed",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "pos_inventory_consumed_outlet_id_fkey"
        },
        {
          "table_name": "pos_item_map",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "pos_item_map_catalog_item_id_fkey"
        },
        {
          "table_name": "pos_item_map",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "pos_item_map_warehouse_id_fkey"
        },
        {
          "table_name": "product_supplier_links",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "product_supplier_links_item_id_fkey"
        },
        {
          "table_name": "product_supplier_links",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE",
          "constraint_name": "product_supplier_links_supplier_id_fkey"
        },
        {
          "table_name": "product_supplier_links",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "product_supplier_links_warehouse_id_fkey"
        },
        {
          "table_name": "stock_ledger",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (flow_batch_id) REFERENCES stock_flow_batches(id) ON DELETE SET NULL",
          "constraint_name": "stock_ledger_flow_batch_id_fkey"
        },
        {
          "table_name": "stock_ledger",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "stock_ledger_item_id_fkey"
        },
        {
          "table_name": "stock_ledger",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL",
          "constraint_name": "stock_ledger_outlet_id_fkey"
        },
        {
          "table_name": "stock_ledger",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "stock_ledger_warehouse_id_fkey"
        },
        {
          "table_name": "supplier_scanners",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (scanner_id) REFERENCES scanners(id) ON DELETE CASCADE",
          "constraint_name": "supplier_scanners_scanner_id_fkey"
        },
        {
          "table_name": "supplier_scanners",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE",
          "constraint_name": "supplier_scanners_supplier_id_fkey"
        },
        {
          "table_name": "user_roles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "user_roles_outlet_id_fkey"
        },
        {
          "table_name": "user_roles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE",
          "constraint_name": "user_roles_role_id_fkey"
        },
        {
          "table_name": "user_roles",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
          "constraint_name": "user_roles_user_id_fkey"
        },
        {
          "table_name": "warehouse_damages",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "warehouse_damages_created_by_fkey"
        },
        {
          "table_name": "warehouse_damages",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
          "constraint_name": "warehouse_damages_warehouse_id_fkey"
        },
        {
          "table_name": "warehouse_purchase_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_purchase_items_item_id_fkey"
        },
        {
          "table_name": "warehouse_purchase_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (receipt_id) REFERENCES warehouse_purchase_receipts(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_purchase_items_receipt_id_fkey"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "warehouse_purchase_receipts_recorded_by_fkey"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL",
          "constraint_name": "warehouse_purchase_receipts_supplier_id_fkey"
        },
        {
          "table_name": "warehouse_purchase_receipts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
          "constraint_name": "warehouse_purchase_receipts_warehouse_id_fkey"
        },
        {
          "table_name": "warehouse_stock_counts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (counted_by) REFERENCES auth.users(id)",
          "constraint_name": "warehouse_stock_counts_counted_by_fkey"
        },
        {
          "table_name": "warehouse_stock_counts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_stock_counts_item_id_fkey"
        },
        {
          "table_name": "warehouse_stock_counts",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (period_id) REFERENCES warehouse_stock_periods(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_stock_counts_period_id_fkey"
        },
        {
          "table_name": "warehouse_stock_periods",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (closed_by) REFERENCES auth.users(id)",
          "constraint_name": "warehouse_stock_periods_closed_by_fkey"
        },
        {
          "table_name": "warehouse_stock_periods",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (opened_by) REFERENCES auth.users(id)",
          "constraint_name": "warehouse_stock_periods_opened_by_fkey"
        },
        {
          "table_name": "warehouse_stock_periods",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_stock_periods_outlet_id_fkey"
        },
        {
          "table_name": "warehouse_stock_periods",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_stock_periods_warehouse_id_fkey"
        },
        {
          "table_name": "warehouse_transfer_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_transfer_items_item_id_fkey"
        },
        {
          "table_name": "warehouse_transfer_items",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (transfer_id) REFERENCES warehouse_transfers(id) ON DELETE CASCADE",
          "constraint_name": "warehouse_transfer_items_transfer_id_fkey"
        },
        {
          "table_name": "warehouse_transfers",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
          "constraint_name": "warehouse_transfers_created_by_fkey"
        },
        {
          "table_name": "warehouse_transfers",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
          "constraint_name": "warehouse_transfers_destination_warehouse_id_fkey"
        },
        {
          "table_name": "warehouse_transfers",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
          "constraint_name": "warehouse_transfers_source_warehouse_id_fkey"
        },
        {
          "table_name": "warehouses",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (parent_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "warehouses_parent_warehouse_id_fkey"
        }
      ]
    }
  }
]