{
    "views": [
        {
            "name": "current_user_roles",
            "definition": " SELECT ur.role,\n    ur.outlet_id,\n    o.name AS outlet_name\n   FROM (user_roles ur\n     LEFT JOIN outlets o ON ((o.id = ur.outlet_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ur.active);"
        },
        {
            "name": "order_pack_consumption",
            "definition": " SELECT ps.order_item_id AS id,\n    ps.order_id,\n    o.order_number,\n    o.outlet_id,\n    outlets.name AS outlet_name,\n    ps.warehouse_id,\n    w.name AS warehouse_name,\n    ps.product_id,\n    prod.name AS product_name,\n    ps.variation_id,\n    pv.name AS variation_name,\n    COALESCE(oi.uom, pv.uom, prod.uom, 'Case'::text) AS pack_label,\n    COALESCE(ps.qty_cases, ps.qty_units) AS packs_ordered,\n    COALESCE(ps.package_contains, pv.package_contains, prod.package_contains, (1)::numeric) AS units_per_pack,\n    ps.qty_units AS units_total,\n    o.created_at,\n    o.status\n   FROM ((((((products_sold ps\n     JOIN orders o ON ((o.id = ps.order_id)))\n     JOIN outlets ON ((outlets.id = o.outlet_id)))\n     LEFT JOIN order_items oi ON ((oi.id = ps.order_item_id)))\n     LEFT JOIN products prod ON ((prod.id = ps.product_id)))\n     LEFT JOIN product_variations pv ON ((pv.id = ps.variation_id)))\n     LEFT JOIN warehouses w ON ((w.id = ps.warehouse_id)));"
        },
        {
            "name": "outlet_order_log",
            "definition": " SELECT o.id AS order_id,\n    o.order_number,\n    o.outlet_id,\n    outlets.name AS outlet_name,\n    o.status,\n    o.lock_stage,\n    o.created_at,\n    o.employee_signed_name,\n    o.supervisor_signed_name,\n    o.driver_signed_name,\n    o.offloader_signed_name,\n    o.pdf_path,\n    o.approved_pdf_path,\n    o.loaded_pdf_path,\n    o.offloaded_pdf_path\n   FROM (orders o\n     JOIN outlets ON ((outlets.id = o.outlet_id)));"
        },
        {
            "name": "outlet_product_order_totals",
            "definition": " SELECT o.outlet_id,\n    outlets.name AS outlet_name,\n    ps.product_id,\n    prod.name AS product_name,\n    ps.variation_id,\n    pv.name AS variation_name,\n    sum(COALESCE(ps.qty_cases, (0)::numeric)) AS total_qty_cases,\n    sum(ps.qty_units) AS total_qty_units,\n    min(o.created_at) AS first_order_at,\n    max(o.created_at) AS last_order_at\n   FROM ((((products_sold ps\n     JOIN orders o ON ((o.id = ps.order_id)))\n     JOIN outlets ON ((outlets.id = o.outlet_id)))\n     LEFT JOIN products prod ON ((prod.id = ps.product_id)))\n     LEFT JOIN product_variations pv ON ((pv.id = ps.variation_id)))\n  GROUP BY o.outlet_id, outlets.name, ps.product_id, prod.name, ps.variation_id, pv.name;"
        },
        {
            "name": "outlet_stock_current",
            "definition": " SELECT location_id AS outlet_id,\n    product_id,\n    variation_id,\n    sum(qty_change) AS qty\n   FROM stock_ledger sl\n  WHERE (location_type = 'outlet'::stock_location_type)\n  GROUP BY location_id, product_id, variation_id;"
        },
        {
            "name": "variances_sold",
            "definition": " SELECT id,\n    order_id,\n    order_item_id,\n    outlet_id,\n    product_id,\n    variation_id,\n    warehouse_id,\n    qty_cases,\n    package_contains,\n    qty_units,\n    recorded_stage,\n    recorded_at,\n    recorded_by\n   FROM products_sold\n  WHERE (variation_id IS NOT NULL);"
        },
        {
            "name": "warehouse_group_stock_current",
            "definition": " WITH child_stock AS (\n         SELECT w.parent_warehouse_id AS group_id,\n            sl.product_id,\n            sl.variation_id,\n            sum(sl.qty_change) AS qty\n           FROM (stock_ledger sl\n             JOIN warehouses w ON ((w.id = sl.location_id)))\n          WHERE ((sl.location_type = 'warehouse'::stock_location_type) AND (w.parent_warehouse_id IS NOT NULL))\n          GROUP BY w.parent_warehouse_id, sl.product_id, sl.variation_id\n        ), parent_self AS (\n         SELECT w.id AS group_id,\n            sl.product_id,\n            sl.variation_id,\n            sum(sl.qty_change) AS qty\n           FROM (stock_ledger sl\n             JOIN warehouses w ON ((w.id = sl.location_id)))\n          WHERE (sl.location_type = 'warehouse'::stock_location_type)\n          GROUP BY w.id, sl.product_id, sl.variation_id\n        )\n SELECT group_id AS warehouse_parent_id,\n    product_id,\n    variation_id,\n    sum(qty) AS qty\n   FROM ( SELECT child_stock.group_id,\n            child_stock.product_id,\n            child_stock.variation_id,\n            child_stock.qty\n           FROM child_stock\n        UNION ALL\n         SELECT parent_self.group_id,\n            parent_self.product_id,\n            parent_self.variation_id,\n            parent_self.qty\n           FROM parent_self) s\n  WHERE (group_id IS NOT NULL)\n  GROUP BY group_id, product_id, variation_id;"
        },
        {
            "name": "warehouse_stock_current",
            "definition": " SELECT location_id AS warehouse_id,\n    product_id,\n    variation_id,\n    sum(qty_change) AS qty\n   FROM stock_ledger sl\n  WHERE (location_type = 'warehouse'::stock_location_type)\n  GROUP BY location_id, product_id, variation_id;"
        }
    ],
    "tables": [
        {
            "table": "assets",
            "column": "key",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "assets",
            "column": "bucket",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "assets",
            "column": "url",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "current_user_roles",
            "column": "role",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "current_user_roles",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "current_user_roles",
            "column": "outlet_name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "package_contains",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 9,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 10,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "damages",
            "column": "source_entry_id",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_item_allocations",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_item_allocations",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_item_allocations",
            "column": "order_item_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_item_allocations",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_item_allocations",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "uom",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "cost",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "amount",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 11,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_items",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "order_number",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "outlet_name",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "warehouse_name",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "product_name",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "variation_name",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "pack_label",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "packs_ordered",
            "comment": null,
            "default": null,
            "ordinal": 13,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "units_per_pack",
            "comment": null,
            "default": null,
            "ordinal": 14,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "units_total",
            "comment": null,
            "default": null,
            "ordinal": 15,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "created_at",
            "comment": null,
            "default": null,
            "ordinal": 16,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "order_pack_consumption",
            "column": "status",
            "comment": null,
            "default": null,
            "ordinal": 17,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "order_number",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "status",
            "comment": null,
            "default": "'Placed'::text",
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 5,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "tz",
            "comment": null,
            "default": "'Africa/Lusaka'::text",
            "ordinal": 6,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "approved_at",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "approved_by",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "locked",
            "comment": null,
            "default": "true",
            "ordinal": 9,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "modified_by_supervisor",
            "comment": null,
            "default": "false",
            "ordinal": 10,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "modified_by_supervisor_name",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "employee_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "employee_signature_path",
            "comment": null,
            "default": null,
            "ordinal": 13,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "employee_signed_at",
            "comment": null,
            "default": null,
            "ordinal": 14,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "supervisor_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 15,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "supervisor_signature_path",
            "comment": null,
            "default": null,
            "ordinal": 16,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "supervisor_signed_at",
            "comment": null,
            "default": null,
            "ordinal": 17,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "driver_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 18,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "driver_signature_path",
            "comment": null,
            "default": null,
            "ordinal": 19,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "driver_signed_at",
            "comment": null,
            "default": null,
            "ordinal": 20,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "offloader_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 21,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "offloader_signature_path",
            "comment": null,
            "default": null,
            "ordinal": 22,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "offloader_signed_at",
            "comment": null,
            "default": null,
            "ordinal": 23,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 24,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "approved_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 25,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "loaded_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 26,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "offloaded_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 27,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "lock_stage",
            "comment": null,
            "default": "'outlet'::order_lock_stage",
            "ordinal": 28,
            "udt_name": "order_lock_stage",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "warehouse_deducted_at",
            "comment": null,
            "default": null,
            "ordinal": 29,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "warehouse_deducted_by",
            "comment": null,
            "default": null,
            "ordinal": 30,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "outlet_received_at",
            "comment": null,
            "default": null,
            "ordinal": 31,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "orders",
            "column": "outlet_received_by",
            "comment": null,
            "default": null,
            "ordinal": 32,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "order_number",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "outlet_name",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "status",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "lock_stage",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "order_lock_stage",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "created_at",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "employee_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "supervisor_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "driver_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "offloader_signed_name",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "approved_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 13,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "loaded_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 14,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_order_log",
            "column": "offloaded_pdf_path",
            "comment": null,
            "default": null,
            "ordinal": 15,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_primary_warehouse",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_primary_warehouse",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_primary_warehouse",
            "column": "updated_at",
            "comment": null,
            "default": "now()",
            "ordinal": 3,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "outlet_name",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "product_name",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "variation_name",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "total_qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "total_qty_units",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "first_order_at",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_product_order_totals",
            "column": "last_order_at",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_sequences",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_sequences",
            "column": "next_seq",
            "comment": null,
            "default": "1",
            "ordinal": 2,
            "udt_name": "int8",
            "data_type": "bigint",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "period_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "opening_qty",
            "comment": null,
            "default": "0",
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "ordered_qty",
            "comment": null,
            "default": "0",
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "pos_sales_qty",
            "comment": null,
            "default": "0",
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "expected_qty",
            "comment": null,
            "default": "0",
            "ordinal": 9,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "actual_qty",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "variance_qty",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "closing_qty",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_balances",
            "column": "computed_at",
            "comment": null,
            "default": "now()",
            "ordinal": 13,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_current",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_current",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_current",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_current",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "period_start",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "period_end",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "status",
            "comment": null,
            "default": "'open'::text",
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "created_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 7,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stock_periods",
            "column": "closed_at",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "period_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "counted_qty",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "counted_cases",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "snapshot_kind",
            "comment": null,
            "default": "'spot'::text",
            "ordinal": 9,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 11,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlet_stocktakes",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlets",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlets",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlets",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 5,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "outlets",
            "column": "auth_user_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "qty_units",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "sale_reference",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "sale_source",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "sold_at",
            "comment": null,
            "default": "now()",
            "ordinal": 10,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 11,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "pos_sales",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "recipe_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "ingredient_product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "ingredient_variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "measure_unit",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "recipe_measure_unit",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "qty_per_sale",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipe_ingredients",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 5,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "notes",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "created_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 7,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_recipes",
            "column": "updated_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "supplier_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 6,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 7,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_supplier_links",
            "column": "updated_at",
            "comment": null,
            "default": "now()",
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "image_url",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "uom",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "cost",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 7,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "default_warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "product_variations",
            "column": "sku",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "sku",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "image_url",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "uom",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "cost",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "has_variations",
            "comment": null,
            "default": "false",
            "ordinal": 7,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 8,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "default_warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 11,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "order_item_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "package_contains",
            "comment": null,
            "default": "1",
            "ordinal": 9,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "qty_units",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "recorded_stage",
            "comment": null,
            "default": "'delivered'::text",
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "products_sold",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 13,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "roles",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "roles",
            "column": "slug",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "roles",
            "column": "display_name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "roles",
            "column": "description",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "roles",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 5,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "occurred_at",
            "comment": null,
            "default": "now()",
            "ordinal": 2,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "location_type",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "stock_location_type",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "location_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "qty_change",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "reason",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "stock_reason",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "ref_movement_id",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "ref_order_id",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_ledger",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movement_items",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movement_items",
            "column": "movement_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movement_items",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movement_items",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movement_items",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "status",
            "comment": null,
            "default": "'pending'::text",
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "source_location_type",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "stock_location_type",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "source_location_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "dest_location_type",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "stock_location_type",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "dest_location_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 7,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "approved_at",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "approved_by",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "completed_at",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "stock_movements",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "contact_name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "contact_phone",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "contact_email",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "notes",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 7,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 8,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "suppliers",
            "column": "updated_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "user_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "role",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 5,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "user_roles",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 6,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "order_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "order_item_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "package_contains",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "qty_units",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "recorded_stage",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "recorded_at",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "variances_sold",
            "column": "recorded_by",
            "comment": null,
            "default": null,
            "ordinal": 13,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_group_stock_current",
            "column": "warehouse_parent_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_group_stock_current",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_group_stock_current",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_group_stock_current",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "receipt_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "stock_entry_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "qty_units",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "package_contains",
            "comment": null,
            "default": null,
            "ordinal": 8,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "unit_cost",
            "comment": null,
            "default": null,
            "ordinal": 9,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "created_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 11,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_items",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "supplier_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "reference_code",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "status",
            "comment": null,
            "default": "'received'::warehouse_purchase_status",
            "ordinal": 6,
            "udt_name": "warehouse_purchase_status",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "auto_whatsapp",
            "comment": null,
            "default": "true",
            "ordinal": 8,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "metadata",
            "comment": null,
            "default": "'{}'::jsonb",
            "ordinal": 9,
            "udt_name": "jsonb",
            "data_type": "jsonb",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 10,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 11,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "received_at",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "total_units",
            "comment": null,
            "default": "0",
            "ordinal": 13,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_purchase_receipts",
            "column": "total_lines",
            "comment": null,
            "default": "0",
            "ordinal": 14,
            "udt_name": "int4",
            "data_type": "integer",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_current",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_current",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_current",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_current",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "entry_kind",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "stock_entry_kind",
            "data_type": "USER-DEFINED",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "qty",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 8,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "qty_cases",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "package_contains",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "supplier_id",
            "comment": null,
            "default": null,
            "ordinal": 12,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "reference_code",
            "comment": null,
            "default": null,
            "ordinal": 13,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "unit_cost",
            "comment": null,
            "default": null,
            "ordinal": 14,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "source_purchase_id",
            "comment": null,
            "default": null,
            "ordinal": 15,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "previous_qty",
            "comment": null,
            "default": null,
            "ordinal": 16,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entries",
            "column": "current_qty",
            "comment": null,
            "default": null,
            "ordinal": 17,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "entry_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "event_type",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "payload",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "jsonb",
            "data_type": "jsonb",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "recorded_by",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stock_entry_events",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 6,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "product_id",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "variation_id",
            "comment": null,
            "default": null,
            "ordinal": 4,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "counted_qty",
            "comment": null,
            "default": null,
            "ordinal": 5,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "delta",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "note",
            "comment": null,
            "default": null,
            "ordinal": 7,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "recorded_by",
            "comment": null,
            "default": "auth.uid()",
            "ordinal": 8,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "recorded_at",
            "comment": null,
            "default": "now()",
            "ordinal": 9,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "counted_cases",
            "comment": null,
            "default": null,
            "ordinal": 10,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouse_stocktakes",
            "column": "package_contains",
            "comment": null,
            "default": null,
            "ordinal": 11,
            "udt_name": "numeric",
            "data_type": "numeric",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "id",
            "comment": null,
            "default": "gen_random_uuid()",
            "ordinal": 1,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "outlet_id",
            "comment": null,
            "default": null,
            "ordinal": 2,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "name",
            "comment": null,
            "default": null,
            "ordinal": 3,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "active",
            "comment": null,
            "default": "true",
            "ordinal": 4,
            "udt_name": "bool",
            "data_type": "boolean",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "created_at",
            "comment": null,
            "default": "now()",
            "ordinal": 5,
            "udt_name": "timestamptz",
            "data_type": "timestamp with time zone",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "parent_warehouse_id",
            "comment": null,
            "default": null,
            "ordinal": 6,
            "udt_name": "uuid",
            "data_type": "uuid",
            "is_identity": "NO",
            "is_nullable": "YES",
            "is_generated": "NEVER",
            "identity_generation": null
        },
        {
            "table": "warehouses",
            "column": "kind",
            "comment": null,
            "default": "'child_coldroom'::text",
            "ordinal": 8,
            "udt_name": "text",
            "data_type": "text",
            "is_identity": "NO",
            "is_nullable": "NO",
            "is_generated": "NEVER",
            "identity_generation": null
        }
    ],
    "indexes": [
        {
            "name": "assets_pkey",
            "table": "assets",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX assets_pkey ON public.assets USING btree (key)",
            "is_primary": true
        },
        {
            "name": "damages_pkey",
            "table": "damages",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX damages_pkey ON public.damages USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_damages_product",
            "table": "damages",
            "is_unique": false,
            "definition": "CREATE INDEX idx_damages_product ON public.damages USING btree (product_id, variation_id)",
            "is_primary": false
        },
        {
            "name": "idx_damages_warehouse",
            "table": "damages",
            "is_unique": false,
            "definition": "CREATE INDEX idx_damages_warehouse ON public.damages USING btree (warehouse_id, recorded_at DESC)",
            "is_primary": false
        },
        {
            "name": "order_item_allocations_order_item_id_warehouse_id_key",
            "table": "order_item_allocations",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX order_item_allocations_order_item_id_warehouse_id_key ON public.order_item_allocations USING btree (order_item_id, warehouse_id)",
            "is_primary": false
        },
        {
            "name": "order_item_allocations_pkey",
            "table": "order_item_allocations",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX order_item_allocations_pkey ON public.order_item_allocations USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_order_items_order",
            "table": "order_items",
            "is_unique": false,
            "definition": "CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id)",
            "is_primary": false
        },
        {
            "name": "idx_order_items_product_id",
            "table": "order_items",
            "is_unique": false,
            "definition": "CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id)",
            "is_primary": false
        },
        {
            "name": "idx_order_items_variation_id",
            "table": "order_items",
            "is_unique": false,
            "definition": "CREATE INDEX idx_order_items_variation_id ON public.order_items USING btree (variation_id)",
            "is_primary": false
        },
        {
            "name": "order_items_pkey",
            "table": "order_items",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_orders_outlet",
            "table": "orders",
            "is_unique": false,
            "definition": "CREATE INDEX idx_orders_outlet ON public.orders USING btree (outlet_id)",
            "is_primary": false
        },
        {
            "name": "idx_orders_outlet_created",
            "table": "orders",
            "is_unique": false,
            "definition": "CREATE INDEX idx_orders_outlet_created ON public.orders USING btree (outlet_id, created_at DESC)",
            "is_primary": false
        },
        {
            "name": "idx_orders_outlet_status_created",
            "table": "orders",
            "is_unique": false,
            "definition": "CREATE INDEX idx_orders_outlet_status_created ON public.orders USING btree (outlet_id, status, created_at DESC)",
            "is_primary": false
        },
        {
            "name": "orders_pkey",
            "table": "orders",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)",
            "is_primary": true
        },
        {
            "name": "outlet_primary_warehouse_pkey",
            "table": "outlet_primary_warehouse",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_primary_warehouse_pkey ON public.outlet_primary_warehouse USING btree (outlet_id)",
            "is_primary": true
        },
        {
            "name": "outlet_sequences_pkey",
            "table": "outlet_sequences",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_sequences_pkey ON public.outlet_sequences USING btree (outlet_id)",
            "is_primary": true
        },
        {
            "name": "idx_outlet_stock_balances_null_variation",
            "table": "outlet_stock_balances",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX idx_outlet_stock_balances_null_variation ON public.outlet_stock_balances USING btree (period_id, product_id) WHERE (variation_id IS NULL)",
            "is_primary": false
        },
        {
            "name": "idx_outlet_stock_balances_outlet",
            "table": "outlet_stock_balances",
            "is_unique": false,
            "definition": "CREATE INDEX idx_outlet_stock_balances_outlet ON public.outlet_stock_balances USING btree (outlet_id, period_id)",
            "is_primary": false
        },
        {
            "name": "outlet_stock_balances_period_id_product_id_variation_id_key",
            "table": "outlet_stock_balances",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_stock_balances_period_id_product_id_variation_id_key ON public.outlet_stock_balances USING btree (period_id, product_id, variation_id)",
            "is_primary": false
        },
        {
            "name": "outlet_stock_balances_pkey",
            "table": "outlet_stock_balances",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_stock_balances_pkey ON public.outlet_stock_balances USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_outlet_stock_periods_outlet",
            "table": "outlet_stock_periods",
            "is_unique": false,
            "definition": "CREATE INDEX idx_outlet_stock_periods_outlet ON public.outlet_stock_periods USING btree (outlet_id, status)",
            "is_primary": false
        },
        {
            "name": "outlet_stock_periods_pkey",
            "table": "outlet_stock_periods",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_stock_periods_pkey ON public.outlet_stock_periods USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_outlet_stocktakes_outlet",
            "table": "outlet_stocktakes",
            "is_unique": false,
            "definition": "CREATE INDEX idx_outlet_stocktakes_outlet ON public.outlet_stocktakes USING btree (outlet_id, snapshot_kind)",
            "is_primary": false
        },
        {
            "name": "outlet_stocktakes_pkey",
            "table": "outlet_stocktakes",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlet_stocktakes_pkey ON public.outlet_stocktakes USING btree (id)",
            "is_primary": true
        },
        {
            "name": "outlets_auth_user_id_key",
            "table": "outlets",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlets_auth_user_id_key ON public.outlets USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL)",
            "is_primary": false
        },
        {
            "name": "outlets_pkey",
            "table": "outlets",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX outlets_pkey ON public.outlets USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_pos_sales_outlet",
            "table": "pos_sales",
            "is_unique": false,
            "definition": "CREATE INDEX idx_pos_sales_outlet ON public.pos_sales USING btree (outlet_id, sold_at DESC)",
            "is_primary": false
        },
        {
            "name": "pos_sales_pkey",
            "table": "pos_sales",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX pos_sales_pkey ON public.pos_sales USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_recipe_ingredients_recipe",
            "table": "product_recipe_ingredients",
            "is_unique": false,
            "definition": "CREATE INDEX idx_recipe_ingredients_recipe ON public.product_recipe_ingredients USING btree (recipe_id)",
            "is_primary": false
        },
        {
            "name": "product_recipe_ingredients_pkey",
            "table": "product_recipe_ingredients",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX product_recipe_ingredients_pkey ON public.product_recipe_ingredients USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_product_recipes_product_variation",
            "table": "product_recipes",
            "is_unique": false,
            "definition": "CREATE INDEX idx_product_recipes_product_variation ON public.product_recipes USING btree (product_id, variation_id) WHERE active",
            "is_primary": false
        },
        {
            "name": "product_recipes_pkey",
            "table": "product_recipes",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX product_recipes_pkey ON public.product_recipes USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_product_supplier_links_active",
            "table": "product_supplier_links",
            "is_unique": false,
            "definition": "CREATE INDEX idx_product_supplier_links_active ON public.product_supplier_links USING btree (warehouse_id, product_id, variation_id, active) WHERE active",
            "is_primary": false
        },
        {
            "name": "product_supplier_links_pkey",
            "table": "product_supplier_links",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX product_supplier_links_pkey ON public.product_supplier_links USING btree (id)",
            "is_primary": true
        },
        {
            "name": "ux_product_supplier_links_scope",
            "table": "product_supplier_links",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX ux_product_supplier_links_scope ON public.product_supplier_links USING btree (warehouse_id, supplier_id, product_id, COALESCE(variation_id, '00000000-0000-0000-0000-000000000000'::uuid))",
            "is_primary": false
        },
        {
            "name": "idx_product_variations_product",
            "table": "product_variations",
            "is_unique": false,
            "definition": "CREATE INDEX idx_product_variations_product ON public.product_variations USING btree (product_id)",
            "is_primary": false
        },
        {
            "name": "idx_product_variations_sku_unique",
            "table": "product_variations",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX idx_product_variations_sku_unique ON public.product_variations USING btree (lower(sku)) WHERE (sku IS NOT NULL)",
            "is_primary": false
        },
        {
            "name": "product_variations_pkey",
            "table": "product_variations",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX product_variations_pkey ON public.product_variations USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_products_sku_unique",
            "table": "products",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX idx_products_sku_unique ON public.products USING btree (lower(sku)) WHERE (sku IS NOT NULL)",
            "is_primary": false
        },
        {
            "name": "products_pkey",
            "table": "products",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)",
            "is_primary": true
        },
        {
            "name": "products_sku_key",
            "table": "products",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku)",
            "is_primary": false
        },
        {
            "name": "idx_products_sold_order",
            "table": "products_sold",
            "is_unique": false,
            "definition": "CREATE INDEX idx_products_sold_order ON public.products_sold USING btree (order_id)",
            "is_primary": false
        },
        {
            "name": "idx_products_sold_product",
            "table": "products_sold",
            "is_unique": false,
            "definition": "CREATE INDEX idx_products_sold_product ON public.products_sold USING btree (product_id, variation_id)",
            "is_primary": false
        },
        {
            "name": "products_sold_order_item_id_key",
            "table": "products_sold",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX products_sold_order_item_id_key ON public.products_sold USING btree (order_item_id)",
            "is_primary": false
        },
        {
            "name": "products_sold_pkey",
            "table": "products_sold",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX products_sold_pkey ON public.products_sold USING btree (id)",
            "is_primary": true
        },
        {
            "name": "roles_pkey",
            "table": "roles",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)",
            "is_primary": true
        },
        {
            "name": "roles_slug_key",
            "table": "roles",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX roles_slug_key ON public.roles USING btree (slug)",
            "is_primary": false
        },
        {
            "name": "idx_stock_ledger_loc_prod_var",
            "table": "stock_ledger",
            "is_unique": false,
            "definition": "CREATE INDEX idx_stock_ledger_loc_prod_var ON public.stock_ledger USING btree (location_type, location_id, product_id, variation_id)",
            "is_primary": false
        },
        {
            "name": "stock_ledger_pkey",
            "table": "stock_ledger",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX stock_ledger_pkey ON public.stock_ledger USING btree (id)",
            "is_primary": true
        },
        {
            "name": "stock_movement_items_pkey",
            "table": "stock_movement_items",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX stock_movement_items_pkey ON public.stock_movement_items USING btree (id)",
            "is_primary": true
        },
        {
            "name": "stock_movements_pkey",
            "table": "stock_movements",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_suppliers_name_unique",
            "table": "suppliers",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX idx_suppliers_name_unique ON public.suppliers USING btree (lower(name))",
            "is_primary": false
        },
        {
            "name": "suppliers_pkey",
            "table": "suppliers",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_user_roles_active_role_user",
            "table": "user_roles",
            "is_unique": false,
            "definition": "CREATE INDEX idx_user_roles_active_role_user ON public.user_roles USING btree (role, user_id) WHERE active",
            "is_primary": false
        },
        {
            "name": "user_roles_pkey",
            "table": "user_roles",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)",
            "is_primary": true
        },
        {
            "name": "ux_user_roles_user_role_outlet",
            "table": "user_roles",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX ux_user_roles_user_role_outlet ON public.user_roles USING btree (user_id, role, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE active",
            "is_primary": false
        },
        {
            "name": "idx_wpi_product",
            "table": "warehouse_purchase_items",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wpi_product ON public.warehouse_purchase_items USING btree (product_id)",
            "is_primary": false
        },
        {
            "name": "idx_wpi_receipt",
            "table": "warehouse_purchase_items",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wpi_receipt ON public.warehouse_purchase_items USING btree (receipt_id)",
            "is_primary": false
        },
        {
            "name": "warehouse_purchase_items_pkey",
            "table": "warehouse_purchase_items",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouse_purchase_items_pkey ON public.warehouse_purchase_items USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_wpr_supplier",
            "table": "warehouse_purchase_receipts",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wpr_supplier ON public.warehouse_purchase_receipts USING btree (supplier_id)",
            "is_primary": false
        },
        {
            "name": "idx_wpr_unique_ref",
            "table": "warehouse_purchase_receipts",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX idx_wpr_unique_ref ON public.warehouse_purchase_receipts USING btree (warehouse_id, lower(reference_code))",
            "is_primary": false
        },
        {
            "name": "warehouse_purchase_receipts_pkey",
            "table": "warehouse_purchase_receipts",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouse_purchase_receipts_pkey ON public.warehouse_purchase_receipts USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_wse_product",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_product ON public.warehouse_stock_entries USING btree (product_id)",
            "is_primary": false
        },
        {
            "name": "idx_wse_reference_code",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_reference_code ON public.warehouse_stock_entries USING btree (lower(reference_code))",
            "is_primary": false
        },
        {
            "name": "idx_wse_source_purchase",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_source_purchase ON public.warehouse_stock_entries USING btree (source_purchase_id)",
            "is_primary": false
        },
        {
            "name": "idx_wse_supplier",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_supplier ON public.warehouse_stock_entries USING btree (supplier_id)",
            "is_primary": false
        },
        {
            "name": "idx_wse_variation",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_variation ON public.warehouse_stock_entries USING btree (variation_id)",
            "is_primary": false
        },
        {
            "name": "idx_wse_warehouse",
            "table": "warehouse_stock_entries",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wse_warehouse ON public.warehouse_stock_entries USING btree (warehouse_id)",
            "is_primary": false
        },
        {
            "name": "warehouse_stock_entries_pkey",
            "table": "warehouse_stock_entries",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouse_stock_entries_pkey ON public.warehouse_stock_entries USING btree (id)",
            "is_primary": true
        },
        {
            "name": "idx_wsee_entry",
            "table": "warehouse_stock_entry_events",
            "is_unique": false,
            "definition": "CREATE INDEX idx_wsee_entry ON public.warehouse_stock_entry_events USING btree (entry_id)",
            "is_primary": false
        },
        {
            "name": "warehouse_stock_entry_events_pkey",
            "table": "warehouse_stock_entry_events",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouse_stock_entry_events_pkey ON public.warehouse_stock_entry_events USING btree (id)",
            "is_primary": true
        },
        {
            "name": "warehouse_stocktakes_pkey",
            "table": "warehouse_stocktakes",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouse_stocktakes_pkey ON public.warehouse_stocktakes USING btree (id)",
            "is_primary": true
        },
        {
            "name": "warehouses_pkey",
            "table": "warehouses",
            "is_unique": true,
            "definition": "CREATE UNIQUE INDEX warehouses_pkey ON public.warehouses USING btree (id)",
            "is_primary": true
        }
    ],
    "triggers": [
        {
            "name": "before_update_order_items_supervisor_guard",
            "event": "UPDATE",
            "table": "order_items",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION trg_order_items_supervisor_guard()",
            "orientation": "ROW"
        },
        {
            "name": "biu_order_items_qty_only",
            "event": "UPDATE",
            "table": "order_items",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION trg_order_items_qty_only()",
            "orientation": "ROW"
        },
        {
            "name": "tr_order_items_amount",
            "event": "INSERT",
            "table": "order_items",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION tg_order_items_amount()",
            "orientation": "ROW"
        },
        {
            "name": "tr_order_items_amount",
            "event": "UPDATE",
            "table": "order_items",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION tg_order_items_amount()",
            "orientation": "ROW"
        },
        {
            "name": "tr_order_items_supervisor_qty_only",
            "event": "UPDATE",
            "table": "order_items",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION tg_order_items_supervisor_qty_only()",
            "orientation": "ROW"
        },
        {
            "name": "tr_product_recipes_touch",
            "event": "UPDATE",
            "table": "product_recipes",
            "timing": "BEFORE",
            "statement": "EXECUTE FUNCTION touch_product_recipe()",
            "orientation": "ROW"
        },
        {
            "name": "tr_wse_audit",
            "event": "INSERT",
            "table": "warehouse_stock_entries",
            "timing": "AFTER",
            "statement": "EXECUTE FUNCTION log_warehouse_stock_entry_event()",
            "orientation": "ROW"
        },
        {
            "name": "tr_wse_audit",
            "event": "UPDATE",
            "table": "warehouse_stock_entries",
            "timing": "AFTER",
            "statement": "EXECUTE FUNCTION log_warehouse_stock_entry_event()",
            "orientation": "ROW"
        }
    ],
    "functions": [
        {
            "kind": "f",
            "name": "approve_and_lock_order",
            "source": "CREATE OR REPLACE FUNCTION public.approve_and_lock_order(p_order_id uuid, p_auto_from_primary boolean DEFAULT true)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_order record;\r\n  v_primary uuid;\r\n  v_mov_id uuid;\r\n  v_item record;\r\nbegin\r\n  select * into v_order from public.orders where id = p_order_id for update;\r\n  if not found then\r\n     raise exception 'order % not found', p_order_id;\r\n  end if;\r\n  if v_order.locked then\r\n     return; -- idempotent\r\n  end if;\r\n\r\n  update public.orders\r\n  set locked = true, approved_at = now(), approved_by = auth.uid()\r\n  where id = p_order_id;\r\n\r\n  if not p_auto_from_primary then\r\n    return;\r\n  end if;\r\n\r\n  -- Fetch primary warehouse for this outlet\r\n  select warehouse_id into v_primary\r\n  from public.outlet_primary_warehouse\r\n  where outlet_id = v_order.outlet_id;\r\n\r\n  if v_primary is null then\r\n    -- No primary warehouse configured; skip auto movement\r\n    return;\r\n  end if;\r\n\r\n  -- Create movement from warehouse -> outlet\r\n  insert into public.stock_movements(\r\n    status, source_location_type, source_location_id,\r\n    dest_location_type, dest_location_id\r\n  ) values (\r\n    'approved', 'warehouse', v_primary,\r\n    'outlet', v_order.outlet_id\r\n  ) returning id into v_mov_id;\r\n\r\n  -- Add lines for each order item qty\r\n  for v_item in\r\n    select oi.product_id, oi.variation_id, oi.qty\r\n    from public.order_items oi\r\n    where oi.order_id = p_order_id\r\n  loop\r\n    insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)\r\n    values (v_mov_id, v_item.product_id, v_item.variation_id, v_item.qty);\r\n  end loop;\r\n\r\n  -- Complete movement -> writes ledger\r\n  perform public.complete_stock_movement(v_mov_id);\r\nend;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_order_id uuid, p_auto_from_primary boolean",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "approve_lock_and_allocate_order",
            "source": "CREATE OR REPLACE FUNCTION public.approve_lock_and_allocate_order(p_order_id uuid, p_strict boolean DEFAULT true)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_order record;\r\n  v_primary uuid;\r\n  v_src record;\r\n  v_item record;\r\n  v_remain numeric;\r\n  v_avail numeric;\r\n  v_take numeric;\r\n  v_mov_id uuid;\r\n  v_existing uuid;\r\nbegin\r\n  -- Lock order row and mark approved/locked (idempotent)\r\n  select * into v_order from public.orders where id = p_order_id for update;\r\n  if not found then\r\n     raise exception 'order % not found', p_order_id;\r\n  end if;\r\n  if not v_order.locked then\r\n    update public.orders\r\n    set locked = true, approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, auth.uid())\r\n    where id = p_order_id;\r\n  end if;\r\n\r\n  -- Determine primary warehouse for this outlet\r\n  select warehouse_id into v_primary\r\n  from public.outlet_primary_warehouse\r\n  where outlet_id = v_order.outlet_id;\r\n\r\n  if v_primary is null then\r\n    raise exception 'no primary warehouse configured for outlet %', v_order.outlet_id;\r\n  end if;\r\n\r\n  -- Temporary mapping of source warehouse -> movement id\r\n  create temporary table if not exists tmp_movements(\r\n    warehouse_id uuid primary key,\r\n    movement_id uuid\r\n  ) on commit drop;\r\n  delete from tmp_movements;\r\n\r\n  -- For every order item, allocate across child coldrooms first (if any),\r\n  -- ordered by available qty desc; else allocate from the primary itself\r\n  for v_item in\r\n    select oi.product_id, oi.variation_id, oi.qty from public.order_items oi where oi.order_id = p_order_id\r\n  loop\r\n    v_remain := coalesce(v_item.qty, 0);\r\n\r\n    -- Child coldrooms ordered by availability\r\n    for v_src in\r\n      with avail as (\r\n        select w.id as wid,\r\n               coalesce(ws.qty, 0) as qty\r\n        from public.warehouses w\r\n        left join public.warehouse_stock_current ws\r\n          on ws.warehouse_id = w.id\r\n          and ws.product_id = v_item.product_id\r\n          and (ws.variation_id is not distinct from v_item.variation_id)\r\n        where w.parent_warehouse_id = v_primary and w.active\r\n      )\r\n      select * from avail order by qty desc\r\n    loop\r\n      exit when v_remain <= 0;\r\n      v_avail := coalesce(v_src.qty, 0);\r\n      if v_avail <= 0 then\r\n        continue;\r\n      end if;\r\n      v_take := least(v_avail, v_remain);\r\n\r\n      -- Find or create movement for this source warehouse\r\n      select movement_id into v_existing from tmp_movements where warehouse_id = v_src.wid;\r\n      if v_existing is null then\r\n        insert into public.stock_movements(\r\n          status, source_location_type, source_location_id,\r\n          dest_location_type, dest_location_id\r\n        ) values (\r\n          'approved', 'warehouse', v_src.wid,\r\n          'outlet', v_order.outlet_id\r\n        ) returning id into v_mov_id;\r\n        insert into tmp_movements(warehouse_id, movement_id) values (v_src.wid, v_mov_id);\r\n      else\r\n        v_mov_id := v_existing;\r\n      end if;\r\n\r\n      insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)\r\n      values (v_mov_id, v_item.product_id, v_item.variation_id, v_take);\r\n      v_remain := v_remain - v_take;\r\n    end loop;\r\n\r\n    -- If no children existed or still remainder left, try the primary itself\r\n    if v_remain > 0 then\r\n      select coalesce(ws.qty, 0) into v_avail\r\n      from public.warehouse_stock_current ws\r\n      where ws.warehouse_id = v_primary\r\n        and ws.product_id = v_item.product_id\r\n        and (ws.variation_id is not distinct from v_item.variation_id);\r\n\r\n      if coalesce(v_avail, 0) > 0 then\r\n        v_take := least(v_avail, v_remain);\r\n        select movement_id into v_existing from tmp_movements where warehouse_id = v_primary;\r\n        if v_existing is null then\r\n          insert into public.stock_movements(\r\n            status, source_location_type, source_location_id,\r\n            dest_location_type, dest_location_id\r\n          ) values (\r\n            'approved', 'warehouse', v_primary,\r\n            'outlet', v_order.outlet_id\r\n          ) returning id into v_mov_id;\r\n          insert into tmp_movements(warehouse_id, movement_id) values (v_primary, v_mov_id);\r\n        else\r\n          v_mov_id := v_existing;\r\n        end if;\r\n        insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)\r\n        values (v_mov_id, v_item.product_id, v_item.variation_id, v_take);\r\n        v_remain := v_remain - v_take;\r\n      end if;\r\n    end if;\r\n\r\n    if p_strict and v_remain > 0 then\r\n      raise exception 'insufficient stock for product %, variation %, need % more', v_item.product_id, v_item.variation_id, v_remain;\r\n    end if;\r\n  end loop;\r\n\r\n  -- Complete all movements (write ledger)\r\n  for v_src in select movement_id from tmp_movements loop\r\n    perform public.complete_stock_movement(v_src.movement_id);\r\n  end loop;\r\nend;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_order_id uuid, p_strict boolean",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "close_outlet_stock_period",
            "source": "CREATE OR REPLACE FUNCTION public.close_outlet_stock_period(p_period_id uuid, p_period_end timestamp with time zone DEFAULT now())\n RETURNS outlet_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_period public.outlet_stock_periods%ROWTYPE;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT * INTO v_period\r\n  FROM public.outlet_stock_periods\r\n  WHERE id = p_period_id\r\n  FOR UPDATE;\r\n\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'stock period % not found', p_period_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.outlet_auth_user_matches(v_period.outlet_id, v_uid)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to close this stock period';\r\n  END IF;\r\n\r\n  UPDATE public.outlet_stock_periods\r\n     SET status = 'closed',\r\n         period_end = coalesce(p_period_end, now()),\r\n         closed_at = now()\r\n   WHERE id = p_period_id\r\n   RETURNING * INTO v_period;\r\n\r\n  PERFORM public.refresh_outlet_stock_balances(v_period.id);\r\n\r\n  RETURN v_period;\r\nEND;\r\n$function$\n",
            "returns": "outlet_stock_periods",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_period_id uuid, p_period_end timestamp with time zone",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "complete_stock_movement",
            "source": "CREATE OR REPLACE FUNCTION public.complete_stock_movement(p_movement_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_mov record;\r\n  v_item record;\r\nbegin\r\n  select * into v_mov from public.stock_movements where id = p_movement_id for update;\r\n  if not found then\r\n    raise exception 'movement % not found', p_movement_id;\r\n  end if;\r\n  if v_mov.status = 'completed' then\r\n    return; -- idempotent\r\n  end if;\r\n  if v_mov.status <> 'approved' and v_mov.status <> 'pending' then\r\n    raise exception 'movement % has invalid status %', p_movement_id, v_mov.status;\r\n  end if;\r\n\r\n  for v_item in select * from public.stock_movement_items where movement_id = p_movement_id loop\r\n    -- negative at source (if present)\r\n    if v_mov.source_location_type is not null and v_mov.source_location_id is not null then\r\n      insert into public.stock_ledger(\r\n        location_type, location_id, product_id, variation_id, qty_change, reason, ref_movement_id\r\n      ) values (\r\n        v_mov.source_location_type, v_mov.source_location_id,\r\n        v_item.product_id, v_item.variation_id,\r\n        -1 * v_item.qty, 'transfer_out', p_movement_id\r\n      );\r\n    end if;\r\n    -- positive at destination\r\n    if v_mov.dest_location_type is not null and v_mov.dest_location_id is not null then\r\n      insert into public.stock_ledger(\r\n        location_type, location_id, product_id, variation_id, qty_change, reason, ref_movement_id\r\n      ) values (\r\n        v_mov.dest_location_type, v_mov.dest_location_id,\r\n        v_item.product_id, v_item.variation_id,\r\n        v_item.qty, 'transfer_in', p_movement_id\r\n      );\r\n    end if;\r\n  end loop;\r\n\r\n  update public.stock_movements\r\n  set status = 'completed', completed_at = now()\r\n  where id = p_movement_id;\r\nend;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_movement_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "current_user_email",
            "source": "CREATE OR REPLACE FUNCTION public.current_user_email()\n RETURNS text\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), null);\r\n$function$\n",
            "returns": "text",
            "language": "sql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "default_outlet_id",
            "source": "CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL::uuid)\n RETURNS uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  -- member_outlet_ids returns uuid[] in this database; take the first element\r\n  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];\r\n$function$\n",
            "returns": "uuid",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_user uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "ensure_order_outlet_receipts",
            "source": "CREATE OR REPLACE FUNCTION public.ensure_order_outlet_receipts(p_order_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_order public.orders%ROWTYPE;\r\n  v_uid uuid := auth.uid();\r\n  v_rows int := 0;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.outlet_received_at IS NOT NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  INSERT INTO public.stock_ledger(\r\n    location_type,\r\n    location_id,\r\n    product_id,\r\n    variation_id,\r\n    qty_change,\r\n    reason,\r\n    ref_order_id,\r\n    note\r\n  )\r\n  SELECT\r\n    'outlet',\r\n    v_order.outlet_id,\r\n    oi.product_id,\r\n    oi.variation_id,\r\n    oi.qty,\r\n    'order_delivery',\r\n    oi.order_id,\r\n    format('Order %s outlet receipt', COALESCE(v_order.order_number, oi.order_id::text))\r\n  FROM public.order_items oi\r\n  WHERE oi.order_id = p_order_id\r\n    AND oi.qty > 0;\r\n\r\n  GET DIAGNOSTICS v_rows = ROW_COUNT;\r\n  IF COALESCE(v_rows, 0) = 0 THEN\r\n    RAISE EXCEPTION 'no line items to receive for order %', p_order_id;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET outlet_received_at = now(),\r\n      outlet_received_by = COALESCE(v_uid, outlet_received_by)\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_order_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "ensure_order_warehouse_deductions",
            "source": "CREATE OR REPLACE FUNCTION public.ensure_order_warehouse_deductions(p_order_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_order public.orders%ROWTYPE;\r\n  v_primary uuid;\r\n  v_uid uuid := auth.uid();\r\n  v_rows int := 0;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.warehouse_deducted_at IS NOT NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  SELECT warehouse_id INTO v_primary\r\n  FROM public.outlet_primary_warehouse\r\n  WHERE outlet_id = v_order.outlet_id;\r\n\r\n  IF v_primary IS NULL THEN\r\n    SELECT w.id INTO v_primary\r\n    FROM public.warehouses w\r\n    WHERE w.outlet_id = v_order.outlet_id\r\n    LIMIT 1;\r\n  END IF;\r\n\r\n  INSERT INTO public.stock_ledger(\r\n    location_type,\r\n    location_id,\r\n    product_id,\r\n    variation_id,\r\n    qty_change,\r\n    reason,\r\n    ref_order_id,\r\n    note\r\n  )\r\n  SELECT\r\n    'warehouse',\r\n    COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary),\r\n    oi.product_id,\r\n    oi.variation_id,\r\n    -oi.qty,\r\n    'order_fulfillment',\r\n    oi.order_id,\r\n    format('Order %s warehouse deduction', COALESCE(v_order.order_number, oi.order_id::text))\r\n  FROM public.order_items oi\r\n  LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id\r\n  LEFT JOIN public.products prod ON prod.id = oi.product_id\r\n  WHERE oi.order_id = p_order_id\r\n    AND COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary) IS NOT NULL\r\n    AND oi.qty > 0;\r\n\r\n  GET DIAGNOSTICS v_rows = ROW_COUNT;\r\n  IF COALESCE(v_rows, 0) = 0 THEN\r\n    RAISE EXCEPTION 'no warehouse assignments found for order %', p_order_id;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET warehouse_deducted_at = now(),\r\n      warehouse_deducted_by = COALESCE(v_uid, warehouse_deducted_by)\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_order_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "format_order_number",
            "source": "CREATE OR REPLACE FUNCTION public.format_order_number(outlet_name text, seq bigint)\n RETURNS text\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  WITH safe AS (\r\n    SELECT regexp_replace(trim(coalesce(outlet_name, 'Outlet')), '[^A-Za-z0-9_-]', '_', 'g') AS name\r\n  )\r\n  SELECT format('%s_%07d', name, seq) FROM safe;\r\n$function$\n",
            "returns": "text",
            "language": "sql",
            "arg_count": 2,
            "arguments": "outlet_name text, seq bigint",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "format_order_number_for_outlet",
            "source": "CREATE OR REPLACE FUNCTION public.format_order_number_for_outlet(p_outlet_id uuid)\n RETURNS text\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n        SELECT public.format_order_number(o.name, s.next_seq)\r\n        FROM public.outlets o\r\n        JOIN public.outlet_sequences s ON s.outlet_id = o.id\r\n        WHERE o.id = p_outlet_id\r\n      $function$\n",
            "returns": "text",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_outlet_id uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "has_role",
            "source": "CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_role text)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.has_role(p_user_id, p_role, NULL::uuid);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 2,
            "arguments": "p_user_id uuid, p_role text",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "has_role",
            "source": "CREATE OR REPLACE FUNCTION public.has_role(p_role text, p_outlet_id uuid DEFAULT NULL::uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.has_role(auth.uid(), p_role, p_outlet_id);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 2,
            "arguments": "p_role text, p_outlet_id uuid",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "has_role",
            "source": "CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_role text, p_outlet_id uuid DEFAULT NULL::uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT CASE\r\n    WHEN p_user_id IS NULL OR p_role IS NULL THEN FALSE\r\n    ELSE EXISTS (\r\n      SELECT 1\r\n      FROM public.user_roles ur\r\n      WHERE ur.user_id = p_user_id\r\n        AND ur.active\r\n        AND lower(ur.role) = lower(p_role)\r\n        AND (\r\n          p_outlet_id IS NULL\r\n          OR ur.outlet_id IS NOT DISTINCT FROM p_outlet_id\r\n        )\r\n    )\r\n  END;\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 3,
            "arguments": "p_user_id uuid, p_role text, p_outlet_id uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "has_role_any_outlet",
            "source": "CREATE OR REPLACE FUNCTION public.has_role_any_outlet(p_user uuid, p_role text, p_outlet uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.has_role(p_user, p_role, p_outlet);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 3,
            "arguments": "p_user uuid, p_role text, p_outlet uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "has_role_any_outlet",
            "source": "CREATE OR REPLACE FUNCTION public.has_role_any_outlet(p_user uuid, p_role text)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.has_role(p_user, p_role, NULL::uuid);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 2,
            "arguments": "p_user uuid, p_role text",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "hmac",
            "source": "CREATE OR REPLACE FUNCTION public.hmac(data text, key text, type text)\n RETURNS bytea\n LANGUAGE plpgsql\n IMMUTABLE\n SET search_path TO 'public', 'extensions', 'pg_temp'\nAS $function$\r\ndeclare\r\n  bdata bytea := convert_to(data, 'utf8');\r\n  bkey  bytea := convert_to(key,  'utf8');\r\n  outv  bytea;\r\nbegin\r\n  -- Try Supabase default extensions schema first\r\n  begin\r\n    select extensions.hmac(bdata, bkey, type) into outv;\r\n    return outv;\r\n  exception when undefined_function then\r\n    -- Fallback: some setups install pgcrypto functions in public schema\r\n    begin\r\n      select public.hmac(bdata, bkey, type) into outv;\r\n      return outv;\r\n    exception when undefined_function then\r\n      raise exception 'pgcrypto hmac(bytea,bytea,text) not found in schemas extensions or public. Ensure pgcrypto is installed.';\r\n    end;\r\n  end;\r\nend;\r\n$function$\n",
            "returns": "bytea",
            "language": "plpgsql",
            "arg_count": 3,
            "arguments": "data text, key text, type text",
            "volatility": "i",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "is_admin",
            "source": "CREATE OR REPLACE FUNCTION public.is_admin()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.is_admin(auth.uid());\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "is_admin",
            "source": "CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT public.has_role(p_user_id, 'admin', NULL::uuid);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_user_id uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "jwt_claim",
            "source": "CREATE OR REPLACE FUNCTION public.jwt_claim(claim text)\n RETURNS text\n LANGUAGE sql\n STABLE\n SET search_path TO 'public', 'extensions', 'pg_temp'\nAS $function$\r\n  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> claim), null);\r\n$function$\n",
            "returns": "text",
            "language": "sql",
            "arg_count": 1,
            "arguments": "claim text",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "log_products_sold",
            "source": "CREATE OR REPLACE FUNCTION public.log_products_sold(p_order_id uuid, p_recorded_stage text DEFAULT 'delivered'::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_order public.orders%ROWTYPE;\r\n  v_primary uuid;\r\n  v_uid uuid := auth.uid();\r\n  v_stage text := lower(coalesce(p_recorded_stage, 'delivered'));\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  SELECT warehouse_id INTO v_primary\r\n  FROM public.outlet_primary_warehouse\r\n  WHERE outlet_id = v_order.outlet_id;\r\n\r\n  IF v_primary IS NULL THEN\r\n    SELECT w.id INTO v_primary\r\n    FROM public.warehouses w\r\n    WHERE w.outlet_id = v_order.outlet_id\r\n    LIMIT 1;\r\n  END IF;\r\n\r\n  DELETE FROM public.products_sold WHERE order_id = p_order_id;\r\n\r\n  INSERT INTO public.products_sold(\r\n    order_id,\r\n    order_item_id,\r\n    outlet_id,\r\n    product_id,\r\n    variation_id,\r\n    warehouse_id,\r\n    qty_cases,\r\n    package_contains,\r\n    qty_units,\r\n    recorded_stage,\r\n    recorded_at,\r\n    recorded_by\r\n  )\r\n  SELECT\r\n    oi.order_id,\r\n    oi.id,\r\n    v_order.outlet_id,\r\n    oi.product_id,\r\n    oi.variation_id,\r\n    COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary),\r\n    oi.qty_cases,\r\n    oi.package_contains,\r\n    oi.qty,\r\n    v_stage,\r\n    COALESCE(v_order.offloader_signed_at, now()),\r\n    COALESCE(v_uid, v_order.approved_by)\r\n  FROM public.order_items oi\r\n  LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id\r\n  LEFT JOIN public.products prod ON prod.id = oi.product_id\r\n  WHERE oi.order_id = p_order_id\r\n    AND COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary) IS NOT NULL\r\n    AND oi.qty > 0;\r\nEND;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_order_id uuid, p_recorded_stage text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "log_warehouse_stock_entry_event",
            "source": "CREATE OR REPLACE FUNCTION public.log_warehouse_stock_entry_event()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  INSERT INTO public.warehouse_stock_entry_events(\r\n    entry_id,\r\n    event_type,\r\n    payload,\r\n    recorded_by\r\n  ) VALUES (\r\n    NEW.id,\r\n    lower(TG_OP),\r\n    jsonb_build_object(\r\n      'entry_kind', NEW.entry_kind,\r\n      'qty', NEW.qty,\r\n      'previous_qty', NEW.previous_qty,\r\n      'current_qty', NEW.current_qty,\r\n      'supplier_id', NEW.supplier_id,\r\n      'reference_code', NEW.reference_code,\r\n      'source_purchase_id', NEW.source_purchase_id\r\n    ),\r\n    COALESCE(NEW.recorded_by, auth.uid())\r\n  );\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "mark_order_loaded",
            "source": "CREATE OR REPLACE FUNCTION public.mark_order_loaded(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS orders\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%ROWTYPE;\r\n  v_name text := nullif(btrim(p_driver_name), '');\r\n  v_sig text := nullif(btrim(p_signature_path), '');\r\n  v_pdf text := nullif(btrim(p_pdf_path), '');\r\n  v_status text;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)) THEN\r\n    RAISE EXCEPTION 'not authorized to mark this order as loaded';\r\n  END IF;\r\n\r\n  v_status := lower(coalesce(v_order.status, ''));\r\n  IF v_status NOT IN ('approved', 'loaded', 'delivered') THEN\r\n    RAISE EXCEPTION 'order % must be approved before loading', p_order_id;\r\n  END IF;\r\n\r\n  UPDATE public.orders o\r\n         SET status = CASE\r\n           WHEN lower(coalesce(o.status, '')) = 'delivered' THEN o.status\r\n           ELSE 'Loaded'\r\n         END,\r\n         locked = true,\r\n         lock_stage = 'driver'::public.order_lock_stage,\r\n         driver_signed_name = coalesce(v_name, o.driver_signed_name),\r\n         driver_signature_path = coalesce(v_sig, o.driver_signature_path),\r\n         driver_signed_at = CASE\r\n             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.driver_signed_at, now())\r\n             ELSE o.driver_signed_at\r\n         END,\r\n         pdf_path = coalesce(v_pdf, o.pdf_path),\r\n         loaded_pdf_path = coalesce(v_pdf, o.loaded_pdf_path)\r\n   WHERE o.id = p_order_id\r\n   RETURNING * INTO v_order;\r\n\r\n  RETURN v_order;\r\nEND;\r\n$function$\n",
            "returns": "orders",
            "language": "plpgsql",
            "arg_count": 4,
            "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text, p_pdf_path text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "mark_order_modified",
            "source": "CREATE OR REPLACE FUNCTION public.mark_order_modified(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\ndeclare\r\n  v_uid uuid := auth.uid();\r\n  v_outlet_id uuid;\r\n  v_name text;\r\nbegin\r\n  if v_uid is null then\r\n    raise exception 'not authenticated';\r\n  end if;\r\n\r\n  select o.outlet_id into v_outlet_id from public.orders o where o.id = p_order_id;\r\n  if v_outlet_id is null then\r\n    raise exception 'order % not found', p_order_id;\r\n  end if;\r\n\r\n  if not (public.is_admin(v_uid) or public.has_role(v_uid, 'supervisor', v_outlet_id)) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  v_name := coalesce(p_supervisor_name,\r\n                     nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'name'), ''));\r\n\r\n  update public.orders o\r\n     set modified_by_supervisor = true,\r\n         modified_by_supervisor_name = coalesce(v_name, o.modified_by_supervisor_name)\r\n   where o.id = p_order_id;\r\nend;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_order_id uuid, p_supervisor_name text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "mark_order_offloaded",
            "source": "CREATE OR REPLACE FUNCTION public.mark_order_offloaded(p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS orders\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%ROWTYPE;\r\n  v_name text := nullif(btrim(p_offloader_name), '');\r\n  v_sig text := nullif(btrim(p_signature_path), '');\r\n  v_pdf text := nullif(btrim(p_pdf_path), '');\r\n  v_status text;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (public.is_admin(v_uid)\r\n          OR public.order_is_accessible(p_order_id, v_uid)) THEN\r\n    RAISE EXCEPTION 'not authorized to offload this order';\r\n  END IF;\r\n\r\n  v_status := lower(coalesce(v_order.status, ''));\r\n  IF v_status NOT IN ('loaded', 'delivered') THEN\r\n    RAISE EXCEPTION 'order % must be loaded before offloading', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.driver_signed_at IS NULL THEN\r\n    RAISE EXCEPTION 'driver signature required before offloading order %', p_order_id;\r\n  END IF;\r\n\r\n    UPDATE public.orders o\r\n      SET status = 'Delivered',\r\n         locked = true,\r\n         lock_stage = 'offloader'::public.order_lock_stage,\r\n         offloader_signed_name = coalesce(v_name, o.offloader_signed_name),\r\n         offloader_signature_path = coalesce(v_sig, o.offloader_signature_path),\r\n         offloader_signed_at = CASE\r\n             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.offloader_signed_at, now())\r\n             ELSE o.offloader_signed_at\r\n         END,\r\n         pdf_path = coalesce(v_pdf, o.pdf_path),\r\n         offloaded_pdf_path = coalesce(v_pdf, o.offloaded_pdf_path)\r\n   WHERE o.id = p_order_id\r\n   RETURNING * INTO v_order;\r\n\r\n  PERFORM public.ensure_order_outlet_receipts(p_order_id);\r\n  PERFORM public.log_products_sold(p_order_id);\r\n\r\n  RETURN v_order;\r\nEND;\r\n$function$\n",
            "returns": "orders",
            "language": "plpgsql",
            "arg_count": 4,
            "arguments": "p_order_id uuid, p_offloader_name text, p_signature_path text, p_pdf_path text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "member_outlet_ids",
            "source": "CREATE OR REPLACE FUNCTION public.member_outlet_ids()\n RETURNS SETOF uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  select ur.outlet_id\r\n  from public.user_roles ur\r\n  where ur.user_id = auth.uid()\r\n    and ur.active\r\n    and ur.role in ('supervisor','outlet','transfer_manager');\r\n$function$\n",
            "returns": "SETOF uuid",
            "language": "sql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "member_outlet_ids",
            "source": "CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  select coalesce(array_agg(distinct ur.outlet_id), '{}')\r\n  from public.user_roles ur\r\n  where ur.user_id = p_user_id\r\n    and ur.active is true\r\n    and ur.outlet_id is not null;\r\n$function$\n",
            "returns": "uuid[]",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_user_id uuid",
            "volatility": "s",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "next_order_number",
            "source": "CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions', 'pg_temp'\nAS $function$\r\nDECLARE\r\n  v_next bigint;\r\n  v_name text;\r\n  v_number text;\r\n  v_mapped uuid;\r\nBEGIN\r\n  IF auth.uid() IS NULL THEN\r\n    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';\r\n  END IF;\r\n\r\n  SELECT id INTO v_mapped\r\n  FROM public.outlets\r\n  WHERE auth_user_id = auth.uid();\r\n\r\n  IF v_mapped IS NULL THEN\r\n    RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501';\r\n  END IF;\r\n\r\n  IF v_mapped <> p_outlet_id THEN\r\n    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_sequences(outlet_id, next_seq)\r\n  VALUES (p_outlet_id, 1)\r\n  ON CONFLICT (outlet_id) DO NOTHING;\r\n\r\n  UPDATE public.outlet_sequences\r\n  SET next_seq = next_seq + 1\r\n  WHERE outlet_id = p_outlet_id\r\n  RETURNING next_seq - 1 INTO v_next;\r\n\r\n  SELECT name INTO v_name FROM public.outlets WHERE id = p_outlet_id;\r\n  v_number := v_name || to_char(v_next, 'FM0000000');\r\n  RETURN v_number;\r\nEND;\r\n$function$\n",
            "returns": "text",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_outlet_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "order_is_accessible",
            "source": "CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\nDECLARE\r\n  target_outlet uuid;\r\nBEGIN\r\n  IF p_order_id IS NULL OR p_user_id IS NULL THEN\r\n    RETURN FALSE;\r\n  END IF;\r\n\r\n  SELECT outlet_id INTO target_outlet\r\n  FROM public.orders\r\n  WHERE id = p_order_id;\r\n\r\n  IF target_outlet IS NULL THEN\r\n    RETURN FALSE;\r\n  END IF;\r\n\r\n  IF public.is_admin(p_user_id) THEN\r\n    RETURN TRUE;\r\n  END IF;\r\n\r\n  RETURN (\r\n    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))\r\n    OR public.outlet_auth_user_matches(target_outlet, p_user_id)\r\n    OR public.has_role_any_outlet(p_user_id, 'supervisor', target_outlet)\r\n    OR public.has_role_any_outlet(p_user_id, 'outlet', target_outlet)\r\n  );\r\nEND;\r\n$function$\n",
            "returns": "boolean",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_order_id uuid, p_user_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "outlet_auth_user_matches",
            "source": "CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(p_outlet_id uuid, p_user_id uuid DEFAULT auth.uid())\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.outlets o\r\n    WHERE o.id = p_outlet_id\r\n      AND o.auth_user_id = p_user_id\r\n  );\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 2,
            "arguments": "p_outlet_id uuid, p_user_id uuid",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "outlet_login",
            "source": "CREATE OR REPLACE FUNCTION public.outlet_login(p_email text, p_password text)\n RETURNS json\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions', 'pg_temp'\nAS $function$\r\ndeclare\r\n  v_outlet record;\r\n  v_payload json;\r\n  v_token text;\r\n  -- If you cannot set app.settings.jwt_secret, paste your Legacy JWT Secret below\r\n  -- and remove the angle brackets. This stays server-side in the DB function.\r\n  -- Example: v_secret := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';\r\n  v_secret text := 'l8URwHldwkKqxE8VT5lgpoyH7cPJnIl8Dxc+32p+Rmsu5SvzsksfWVbJOn/jXR5TMTC9T6ZLO9JZvlzmTq1Hew==';  -- TODO: replace\r\n  -- Token lifetime controls. By default, mint a long-lived token so the client\r\n  -- does not need to refresh frequently. Adjust as needed.\r\n  v_now int := extract(epoch from now())::int;\r\n  -- 10 years (approximate, ignoring leap years). Adjust if you prefer a different duration.\r\n  v_exp int := v_now + (60*60*24*365*10); -- ~10 years\r\nbegin\r\n  -- Validate credentials (plaintext comparison per request)\r\n  select id, name into v_outlet\r\n  from public.outlets\r\n  where email = p_email and password = p_password;\r\n\r\n  if not found then\r\n    raise exception 'invalid_email_or_password' using errcode = '28000';\r\n  end if;\r\n\r\n  -- Build JWT payload. Use role=authenticated (a real DB role in Supabase)\r\n  -- Build JWT payload. Use role=authenticated (a real DB role in Supabase)\r\n  -- Include standard claims so PostgREST and clients can validate/inspect.\r\n  v_payload := json_build_object(\r\n    'role', 'authenticated',\r\n    'outlet_id', v_outlet.id::text,\r\n    'outlet_name', v_outlet.name,\r\n    'iat', v_now,\r\n    'exp', v_exp,\r\n    'iss', 'supabase',\r\n    'aud', 'authenticated'\r\n  );\r\n  -- If DB parameter is not set, fall back to the pasted secret above\r\n  v_token := sign(\r\n    v_payload,\r\n    coalesce(current_setting('app.settings.jwt_secret', true), v_secret)\r\n  );\r\n\r\n  return json_build_object(\r\n    'token', v_token,\r\n    'outlet_id', v_outlet.id,\r\n    'outlet_name', v_outlet.name\r\n  );\r\nend;$function$\n",
            "returns": "json",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_email text, p_password text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "place_order",
            "source": "CREATE OR REPLACE FUNCTION public.place_order(p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS TABLE(order_id uuid, order_number text, created_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_seq bigint;\r\n  v_order_id uuid;\r\n  v_order_number text;\r\n  v_created_at timestamptz;\r\n  v_employee_name text := nullif(btrim(coalesce(p_employee_name, '')), '');\r\n  v_sig_path text := nullif(btrim(p_signature_path), '');\r\n  v_pdf_path text := nullif(btrim(p_pdf_path), '');\r\n  v_primary_wh uuid;\r\nBEGIN\r\n  IF p_outlet_id IS NULL THEN\r\n    RAISE EXCEPTION 'p_outlet_id is required';\r\n  END IF;\r\n  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'p_items must be a non-empty JSON array';\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_sequences AS os (outlet_id, next_seq)\r\n  VALUES (p_outlet_id, 1)\r\n  ON CONFLICT (outlet_id)\r\n  DO UPDATE SET next_seq = os.next_seq + 1\r\n  RETURNING os.next_seq INTO v_seq;\r\n\r\n  v_order_number := lpad(v_seq::text, 6, '0');\r\n\r\n  INSERT INTO public.orders (\r\n    outlet_id,\r\n    order_number,\r\n    status,\r\n    locked,\r\n    lock_stage,\r\n    tz,\r\n    created_at,\r\n    employee_signed_name,\r\n    employee_signature_path,\r\n    employee_signed_at,\r\n    pdf_path\r\n  )\r\n  VALUES (\r\n    p_outlet_id,\r\n    v_order_number,\r\n    'Placed',\r\n    true,\r\n    'outlet'::public.order_lock_stage,\r\n    coalesce(current_setting('TIMEZONE', true), 'UTC'),\r\n    now(),\r\n    v_employee_name,\r\n    v_sig_path,\r\n    CASE WHEN v_employee_name IS NOT NULL OR v_sig_path IS NOT NULL THEN now() ELSE NULL END,\r\n    v_pdf_path\r\n  )\r\n  RETURNING id, order_number, created_at\r\n  INTO v_order_id, v_order_number, v_created_at;\r\n\r\n  SELECT warehouse_id INTO v_primary_wh\r\n  FROM public.outlet_primary_warehouse\r\n  WHERE outlet_id = p_outlet_id;\r\n\r\n  WITH payload AS (\r\n    SELECT\r\n      i.product_id,\r\n      i.variation_id,\r\n      i.name,\r\n      i.uom,\r\n      i.cost,\r\n      coalesce(i.qty_cases, i.qty, 0)::numeric AS qty_cases,\r\n      i.warehouse_id AS warehouse_override\r\n    FROM jsonb_to_recordset(p_items) AS i(\r\n      product_id uuid,\r\n      variation_id uuid,\r\n      name text,\r\n      uom text,\r\n      cost numeric,\r\n      qty numeric,\r\n      qty_cases numeric,\r\n      warehouse_id uuid\r\n    )\r\n  )\r\n  INSERT INTO public.order_items (\r\n    order_id,\r\n    product_id,\r\n    variation_id,\r\n    name,\r\n    uom,\r\n    cost,\r\n    qty_cases,\r\n    package_contains,\r\n    qty,\r\n    amount,\r\n    warehouse_id\r\n  )\r\n  SELECT\r\n    v_order_id,\r\n    p_item.product_id,\r\n    p_item.variation_id,\r\n    p_item.name,\r\n    p_item.uom,\r\n    p_item.cost,\r\n    p_item.qty_cases,\r\n    coalesce(pv.package_contains, prod.package_contains, 1) AS package_contains,\r\n    p_item.qty_cases * coalesce(pv.package_contains, prod.package_contains, 1) AS qty_units,\r\n    coalesce(p_item.cost, 0)::numeric * (p_item.qty_cases * coalesce(pv.package_contains, prod.package_contains, 1)) AS amount,\r\n    coalesce(p_item.warehouse_override, pv.default_warehouse_id, prod.default_warehouse_id, v_primary_wh)\r\n  FROM payload p_item\r\n  LEFT JOIN public.products prod ON prod.id = p_item.product_id\r\n  LEFT JOIN public.product_variations pv ON pv.id = p_item.variation_id;\r\n\r\n  RETURN QUERY SELECT v_order_id, v_order_number, v_created_at;\r\nEND;\r\n$function$\n",
            "returns": "TABLE(order_id uuid, order_number text, created_at timestamp with time zone)",
            "language": "plpgsql",
            "arg_count": 5,
            "arguments": "p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text, p_pdf_path text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "recipe_deductions_for_product",
            "source": "CREATE OR REPLACE FUNCTION public.recipe_deductions_for_product(p_product_id uuid, p_variation_id uuid DEFAULT NULL::uuid, p_qty_units numeric DEFAULT 1)\n RETURNS TABLE(warehouse_id uuid, ingredient_product_id uuid, ingredient_variation_id uuid, measure_unit recipe_measure_unit, qty_to_deduct numeric)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  WITH candidate AS (\r\n    SELECT pr.id\r\n    FROM public.product_recipes pr\r\n    WHERE pr.product_id = p_product_id\r\n      AND pr.active\r\n      AND (\r\n        pr.variation_id IS NULL OR pr.variation_id = p_variation_id\r\n      )\r\n    ORDER BY (pr.variation_id IS NOT NULL) DESC, pr.updated_at DESC\r\n    LIMIT 1\r\n  )\r\n  SELECT\r\n    pri.warehouse_id,\r\n    pri.ingredient_product_id,\r\n    pri.ingredient_variation_id,\r\n    pri.measure_unit,\r\n    pri.qty_per_sale * coalesce(p_qty_units, 1)\r\n  FROM candidate c\r\n  JOIN public.product_recipe_ingredients pri ON pri.recipe_id = c.id;\r\n$function$\n",
            "returns": "TABLE(warehouse_id uuid, ingredient_product_id uuid, ingredient_variation_id uuid, measure_unit recipe_measure_unit, qty_to_deduct numeric)",
            "language": "sql",
            "arg_count": 3,
            "arguments": "p_product_id uuid, p_variation_id uuid, p_qty_units numeric",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_damage",
            "source": "CREATE OR REPLACE FUNCTION public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS TABLE(id uuid, warehouse_id uuid, product_id uuid, variation_id uuid, qty numeric, qty_cases numeric, package_contains numeric, note text, recorded_by uuid, recorded_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_note text := nullif(btrim(p_note), '');\r\n  v_item jsonb;\r\n  v_entry public.warehouse_stock_entries%ROWTYPE;\r\n  v_row public.damages%ROWTYPE;\r\n  v_qty numeric;\r\n  v_product uuid;\r\n  v_variation uuid;\r\n  v_item_note text;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_warehouse_id IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse_id is required';\r\n  END IF;\r\n  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'p_items must be a non-empty json array';\r\n  END IF;\r\n\r\n  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP\r\n    v_product := (v_item->>'product_id')::uuid;\r\n    v_variation := NULLIF(v_item->>'variation_id', '')::uuid;\r\n    v_qty := (v_item->>'qty')::numeric;\r\n    v_item_note := nullif(btrim(coalesce(v_item->>'note', v_note)), '');\r\n\r\n    IF v_product IS NULL THEN\r\n      RAISE EXCEPTION 'product_id is required for each item';\r\n    END IF;\r\n    IF v_qty IS NULL OR v_qty <= 0 THEN\r\n      RAISE EXCEPTION 'qty must be positive for each item';\r\n    END IF;\r\n\r\n    v_entry := public.record_stock_entry(\r\n      p_warehouse_id,\r\n      v_product,\r\n      'damage',\r\n      v_qty,\r\n      v_variation,\r\n      v_item_note,\r\n      'units',\r\n      NULL,\r\n      NULL,\r\n      NULL,\r\n      NULL\r\n    );\r\n\r\n    INSERT INTO public.damages(\r\n      warehouse_id,\r\n      product_id,\r\n      variation_id,\r\n      qty,\r\n      qty_cases,\r\n      package_contains,\r\n      note,\r\n      recorded_by,\r\n      source_entry_id\r\n    ) VALUES (\r\n      p_warehouse_id,\r\n      v_product,\r\n      v_variation,\r\n      v_qty,\r\n      v_entry.qty_cases,\r\n      v_entry.package_contains,\r\n      v_item_note,\r\n      coalesce(v_entry.recorded_by, v_uid),\r\n      v_entry.id\r\n    ) RETURNING * INTO v_row;\r\n\r\n    RETURN QUERY SELECT v_row.*;\r\n  END LOOP;\r\nEND;\r\n$function$\n",
            "returns": "TABLE(id uuid, warehouse_id uuid, product_id uuid, variation_id uuid, qty numeric, qty_cases numeric, package_contains numeric, note text, recorded_by uuid, recorded_at timestamp with time zone)",
            "language": "plpgsql",
            "arg_count": 3,
            "arguments": "p_warehouse_id uuid, p_items jsonb, p_note text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_outlet_stocktake",
            "source": "CREATE OR REPLACE FUNCTION public.record_outlet_stocktake(p_outlet_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_period_id uuid DEFAULT NULL::uuid, p_snapshot_kind text DEFAULT 'spot'::text, p_note text DEFAULT NULL::text, p_qty_input_mode text DEFAULT 'auto'::text)\n RETURNS outlet_stocktakes\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_pkg numeric := 1;\r\n  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));\r\n  v_qty_units numeric := coalesce(p_counted_qty, 0);\r\n  v_qty_cases numeric := NULL;\r\n  v_row public.outlet_stocktakes%ROWTYPE;\r\n  v_kind text := lower(coalesce(p_snapshot_kind, 'spot'));\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_outlet_id IS NULL OR p_product_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet_id and product_id are required';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to record outlet stocktake';\r\n  END IF;\r\n\r\n  SELECT coalesce(\r\n           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),\r\n           (SELECT package_contains FROM public.products WHERE id = p_product_id),\r\n           1\r\n         )\r\n    INTO v_pkg;\r\n\r\n  IF v_mode NOT IN ('auto','units','cases') THEN\r\n    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;\r\n  END IF;\r\n  IF v_mode = 'auto' THEN\r\n    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;\r\n  END IF;\r\n\r\n  IF v_mode = 'cases' THEN\r\n    v_qty_cases := coalesce(p_counted_qty, 0);\r\n    v_qty_units := v_qty_cases * v_pkg;\r\n  ELSE\r\n    v_qty_units := coalesce(p_counted_qty, 0);\r\n    v_qty_cases := CASE WHEN v_pkg > 0 THEN v_qty_units / v_pkg ELSE NULL END;\r\n  END IF;\r\n\r\n  IF v_kind NOT IN ('opening','closing','spot') THEN\r\n    RAISE EXCEPTION 'invalid snapshot_kind %', p_snapshot_kind;\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_stocktakes(\r\n    outlet_id,\r\n    period_id,\r\n    product_id,\r\n    variation_id,\r\n    counted_qty,\r\n    counted_cases,\r\n    package_contains,\r\n    snapshot_kind,\r\n    note,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_outlet_id,\r\n    p_period_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    v_qty_units,\r\n    v_qty_cases,\r\n    v_pkg,\r\n    v_kind,\r\n    p_note,\r\n    v_uid\r\n  ) RETURNING * INTO v_row;\r\n\r\n  IF p_period_id IS NOT NULL THEN\r\n    PERFORM public.refresh_outlet_stock_balances(p_period_id);\r\n  END IF;\r\n\r\n  RETURN v_row;\r\nEND;\r\n$function$\n",
            "returns": "outlet_stocktakes",
            "language": "plpgsql",
            "arg_count": 8,
            "arguments": "p_outlet_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid, p_period_id uuid, p_snapshot_kind text, p_note text, p_qty_input_mode text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_pos_sale",
            "source": "CREATE OR REPLACE FUNCTION public.record_pos_sale(p_outlet_id uuid, p_product_id uuid, p_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_sale_reference text DEFAULT NULL::text, p_sale_source text DEFAULT 'pos'::text, p_sold_at timestamp with time zone DEFAULT now(), p_qty_input_mode text DEFAULT 'auto'::text)\n RETURNS pos_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_pkg numeric := 1;\r\n  v_qty_units numeric := 0;\r\n  v_qty_cases numeric := NULL;\r\n  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));\r\n  v_sale public.pos_sales%ROWTYPE;\r\n  v_primary_wh uuid;\r\n  v_fallback_wh uuid;\r\n  v_deductions int := 0;\r\n  rec record;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_outlet_id IS NULL OR p_product_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet_id and product_id are required';\r\n  END IF;\r\n  IF p_qty IS NULL OR p_qty <= 0 THEN\r\n    RAISE EXCEPTION 'quantity must be positive';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to record POS sale for this outlet';\r\n  END IF;\r\n\r\n  SELECT coalesce(\r\n           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),\r\n           (SELECT package_contains FROM public.products WHERE id = p_product_id),\r\n           1\r\n         )\r\n    INTO v_pkg;\r\n\r\n  IF v_mode NOT IN ('auto','units','cases') THEN\r\n    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;\r\n  END IF;\r\n  IF v_mode = 'auto' THEN\r\n    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;\r\n  END IF;\r\n\r\n  IF v_mode = 'cases' THEN\r\n    v_qty_cases := p_qty;\r\n    v_qty_units := p_qty * v_pkg;\r\n  ELSE\r\n    v_qty_units := p_qty;\r\n    v_qty_cases := CASE WHEN v_pkg > 0 THEN p_qty / v_pkg ELSE NULL END;\r\n  END IF;\r\n\r\n  INSERT INTO public.pos_sales(\r\n    outlet_id,\r\n    product_id,\r\n    variation_id,\r\n    qty_units,\r\n    qty_cases,\r\n    package_contains,\r\n    sale_reference,\r\n    sale_source,\r\n    sold_at,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_outlet_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    v_qty_units,\r\n    v_qty_cases,\r\n    v_pkg,\r\n    nullif(btrim(p_sale_reference), ''),\r\n    nullif(btrim(coalesce(p_sale_source, 'pos')), ''),\r\n    coalesce(p_sold_at, now()),\r\n    v_uid\r\n  ) RETURNING * INTO v_sale;\r\n\r\n  FOR rec IN\r\n    SELECT *\r\n    FROM public.recipe_deductions_for_product(p_product_id, p_variation_id, v_qty_units)\r\n  LOOP\r\n    v_deductions := v_deductions + 1;\r\n    IF rec.warehouse_id IS NULL THEN\r\n      RAISE EXCEPTION 'recipe warehouse missing for ingredient %', rec.ingredient_product_id;\r\n    END IF;\r\n    INSERT INTO public.stock_ledger(\r\n      location_type,\r\n      location_id,\r\n      product_id,\r\n      variation_id,\r\n      qty_change,\r\n      reason,\r\n      ref_order_id,\r\n      note\r\n    ) VALUES (\r\n      'warehouse',\r\n      rec.warehouse_id,\r\n      rec.ingredient_product_id,\r\n      rec.ingredient_variation_id,\r\n      -rec.qty_to_deduct,\r\n      'pos_sale',\r\n      NULL,\r\n      format('POS sale %s (%s)', v_sale.id, coalesce(v_sale.sale_reference, 'n/a'))\r\n    );\r\n  END LOOP;\r\n\r\n  IF v_deductions = 0 THEN\r\n    SELECT warehouse_id INTO v_primary_wh\r\n    FROM public.outlet_primary_warehouse\r\n    WHERE outlet_id = p_outlet_id;\r\n\r\n    IF v_primary_wh IS NULL THEN\r\n      SELECT w.id INTO v_primary_wh\r\n      FROM public.warehouses w\r\n      WHERE w.outlet_id = p_outlet_id\r\n      LIMIT 1;\r\n    END IF;\r\n\r\n    SELECT coalesce(\r\n             (SELECT default_warehouse_id FROM public.product_variations WHERE id = p_variation_id),\r\n             (SELECT default_warehouse_id FROM public.products WHERE id = p_product_id),\r\n             v_primary_wh\r\n           ) INTO v_fallback_wh;\r\n\r\n    IF v_fallback_wh IS NULL THEN\r\n      RAISE EXCEPTION 'no warehouse available for POS sale %', v_sale.id;\r\n    END IF;\r\n\r\n    INSERT INTO public.stock_ledger(\r\n      location_type,\r\n      location_id,\r\n      product_id,\r\n      variation_id,\r\n      qty_change,\r\n      reason,\r\n      ref_order_id,\r\n      note\r\n    ) VALUES (\r\n      'warehouse',\r\n      v_fallback_wh,\r\n      p_product_id,\r\n      p_variation_id,\r\n      -v_qty_units,\r\n      'pos_sale',\r\n      NULL,\r\n      format('POS sale %s fallback deduction', v_sale.id)\r\n    );\r\n  END IF;\r\n\r\n  RETURN v_sale;\r\nEND;\r\n$function$\n",
            "returns": "pos_sales",
            "language": "plpgsql",
            "arg_count": 8,
            "arguments": "p_outlet_id uuid, p_product_id uuid, p_qty numeric, p_variation_id uuid, p_sale_reference text, p_sale_source text, p_sold_at timestamp with time zone, p_qty_input_mode text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_purchase_receipt",
            "source": "CREATE OR REPLACE FUNCTION public.record_purchase_receipt(p_warehouse_id uuid, p_supplier_id uuid, p_reference_code text, p_items jsonb, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT true)\n RETURNS warehouse_purchase_receipts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_receipt public.warehouse_purchase_receipts%ROWTYPE;\r\n  v_entry public.warehouse_stock_entries%ROWTYPE;\r\n  v_item RECORD;\r\n  v_outlet uuid;\r\n  v_reference text := nullif(btrim(p_reference_code), '');\r\n  v_total numeric := 0;\r\n  v_lines integer := 0;\r\n  v_items_count integer := 0;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_warehouse_id IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse_id is required';\r\n  END IF;\r\n  IF v_reference IS NULL THEN\r\n    RAISE EXCEPTION 'reference_code is required';\r\n  END IF;\r\n  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'p_items must be a non-empty json array';\r\n  END IF;\r\n\r\n  SELECT outlet_id INTO v_outlet\r\n  FROM public.warehouses\r\n  WHERE id = p_warehouse_id;\r\n\r\n  IF v_outlet IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse % not found', p_warehouse_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.outlet_auth_user_matches(v_outlet, v_uid)\r\n    OR public.has_role_any_outlet(v_uid, 'transfers', v_outlet)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized for this warehouse intake';\r\n  END IF;\r\n\r\n  v_items_count := jsonb_array_length(p_items);\r\n\r\n  INSERT INTO public.warehouse_purchase_receipts(\r\n    outlet_id,\r\n    warehouse_id,\r\n    supplier_id,\r\n    reference_code,\r\n    status,\r\n    note,\r\n    auto_whatsapp,\r\n    metadata,\r\n    recorded_by,\r\n    recorded_at\r\n  ) VALUES (\r\n    v_outlet,\r\n    p_warehouse_id,\r\n    p_supplier_id,\r\n    v_reference,\r\n    'received',\r\n    p_note,\r\n    COALESCE(p_auto_whatsapp, true),\r\n    jsonb_build_object('items_count', v_items_count),\r\n    v_uid,\r\n    now()\r\n  ) RETURNING * INTO v_receipt;\r\n\r\n  FOR v_item IN\r\n    SELECT\r\n      (value->>'product_id')::uuid AS product_id,\r\n      NULLIF(value->>'variation_id', '')::uuid AS variation_id,\r\n      COALESCE(NULLIF(value->>'qty', '')::numeric, 0) AS qty_value,\r\n      CASE\r\n        WHEN lower(NULLIF(value->>'qty_input_mode', '')) IN ('units','cases') THEN lower(NULLIF(value->>'qty_input_mode', ''))\r\n        ELSE 'auto'\r\n      END AS qty_mode,\r\n      NULLIF(btrim(value->>'note'), '') AS note,\r\n      NULLIF(value->>'unit_cost', '')::numeric AS unit_cost\r\n    FROM jsonb_array_elements(p_items) value\r\n  LOOP\r\n    IF v_item.product_id IS NULL THEN\r\n      RAISE EXCEPTION 'purchase item missing product_id';\r\n    END IF;\r\n    IF v_item.qty_value IS NULL OR v_item.qty_value <= 0 THEN\r\n      RAISE EXCEPTION 'purchase qty must be positive for %', v_item.product_id;\r\n    END IF;\r\n\r\n    v_entry := public.record_stock_entry(\r\n      p_warehouse_id := p_warehouse_id,\r\n      p_product_id := v_item.product_id,\r\n      p_entry_kind := 'purchase',\r\n      p_qty := v_item.qty_value,\r\n      p_variation_id := v_item.variation_id,\r\n      p_note := COALESCE(v_item.note, p_note, format('Purchase %s', v_reference)),\r\n      p_qty_input_mode := v_item.qty_mode,\r\n      p_supplier_id := p_supplier_id,\r\n      p_reference_code := v_reference,\r\n      p_unit_cost := v_item.unit_cost,\r\n      p_source_purchase_id := v_receipt.id\r\n    );\r\n\r\n    INSERT INTO public.warehouse_purchase_items(\r\n      receipt_id,\r\n      stock_entry_id,\r\n      product_id,\r\n      variation_id,\r\n      qty_units,\r\n      qty_cases,\r\n      package_contains,\r\n      unit_cost,\r\n      note,\r\n      created_by\r\n    ) VALUES (\r\n      v_receipt.id,\r\n      v_entry.id,\r\n      v_entry.product_id,\r\n      v_entry.variation_id,\r\n      v_entry.qty,\r\n      v_entry.qty_cases,\r\n      v_entry.package_contains,\r\n      v_item.unit_cost,\r\n      COALESCE(v_item.note, p_note),\r\n      v_uid\r\n    );\r\n\r\n    v_total := v_total + v_entry.qty;\r\n    v_lines := v_lines + 1;\r\n  END LOOP;\r\n\r\n  UPDATE public.warehouse_purchase_receipts\r\n  SET total_units = v_total,\r\n      total_lines = v_lines,\r\n      received_at = COALESCE(received_at, now())\r\n  WHERE id = v_receipt.id\r\n  RETURNING * INTO v_receipt;\r\n\r\n  RETURN v_receipt;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_purchase_receipts",
            "language": "plpgsql",
            "arg_count": 6,
            "arguments": "p_warehouse_id uuid, p_supplier_id uuid, p_reference_code text, p_items jsonb, p_note text, p_auto_whatsapp boolean",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_stock_entry",
            "source": "CREATE OR REPLACE FUNCTION public.record_stock_entry(p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_qty_input_mode text DEFAULT 'auto'::text, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_unit_cost numeric DEFAULT NULL::numeric, p_source_purchase_id uuid DEFAULT NULL::uuid)\n RETURNS warehouse_stock_entries\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_entry public.warehouse_stock_entries%ROWTYPE;\r\n  v_previous numeric := 0;\r\n  v_target numeric := 0;\r\n  v_pkg numeric := 1;\r\n  v_qty_units numeric := 0;\r\n  v_qty_cases numeric := NULL;\r\n  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));\r\n  v_reference text := NULL;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.has_role_any_outlet(v_uid, 'transfers')\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n  IF p_qty IS NULL OR p_qty <= 0 THEN\r\n    RAISE EXCEPTION 'quantity must be positive';\r\n  END IF;\r\n\r\n  v_reference := nullif(btrim(p_reference_code), '');\r\n\r\n  SELECT coalesce(\r\n           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),\r\n           (SELECT package_contains FROM public.products WHERE id = p_product_id),\r\n           1\r\n         )\r\n    INTO v_pkg;\r\n\r\n  IF v_mode NOT IN ('auto','units','cases') THEN\r\n    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;\r\n  END IF;\r\n  IF v_mode = 'auto' THEN\r\n    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;\r\n  END IF;\r\n\r\n  IF v_mode = 'cases' THEN\r\n    v_qty_cases := p_qty;\r\n    v_qty_units := p_qty * v_pkg;\r\n  ELSE\r\n    v_qty_units := p_qty;\r\n    v_qty_cases := CASE WHEN v_pkg > 0 THEN p_qty / v_pkg ELSE NULL END;\r\n  END IF;\r\n  v_target := v_qty_units;\r\n\r\n  SELECT coalesce(qty, 0)\r\n    INTO v_previous\r\n    FROM public.warehouse_stock_current\r\n   WHERE warehouse_id = p_warehouse_id\r\n     AND product_id = p_product_id\r\n     AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\n\r\n  IF p_entry_kind = 'purchase' THEN\r\n    v_target := v_previous + v_qty_units;\r\n  ELSIF p_entry_kind = 'damage' THEN\r\n    v_target := GREATEST(v_previous - v_qty_units, 0);\r\n  END IF;\r\n\r\n  INSERT INTO public.warehouse_stock_entries(\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    entry_kind,\r\n    qty,\r\n    qty_cases,\r\n    package_contains,\r\n    note,\r\n    recorded_by,\r\n    supplier_id,\r\n    reference_code,\r\n    unit_cost,\r\n    source_purchase_id,\r\n    previous_qty,\r\n    current_qty\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    p_entry_kind,\r\n    v_qty_units,\r\n    v_qty_cases,\r\n    v_pkg,\r\n    p_note,\r\n    v_uid,\r\n    p_supplier_id,\r\n    v_reference,\r\n    p_unit_cost,\r\n    p_source_purchase_id,\r\n    v_previous,\r\n    v_target\r\n  ) RETURNING * INTO v_entry;\r\n\r\n  PERFORM public.record_stocktake(\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    v_target,\r\n    p_variation_id,\r\n    coalesce(p_note, p_entry_kind::text),\r\n    'units'\r\n  );\r\n\r\n  RETURN v_entry;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_stock_entries",
            "language": "plpgsql",
            "arg_count": 11,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_qty numeric, p_variation_id uuid, p_note text, p_qty_input_mode text, p_supplier_id uuid, p_reference_code text, p_unit_cost numeric, p_source_purchase_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_stock_entry",
            "source": "CREATE OR REPLACE FUNCTION public.record_stock_entry(p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_qty_input_mode text DEFAULT 'auto'::text)\n RETURNS warehouse_stock_entries\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_entry public.warehouse_stock_entries%ROWTYPE;\r\n  v_current numeric := 0;\r\n  v_target numeric := 0;\r\n  v_pkg numeric := 1;\r\n  v_qty_units numeric := 0;\r\n  v_qty_cases numeric := NULL;\r\n  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.has_role_any_outlet(v_uid, 'transfers')\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n  IF p_qty IS NULL OR p_qty <= 0 THEN\r\n    RAISE EXCEPTION 'quantity must be positive';\r\n  END IF;\r\n\r\n  SELECT coalesce(\r\n           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),\r\n           (SELECT package_contains FROM public.products WHERE id = p_product_id),\r\n           1\r\n         )\r\n    INTO v_pkg;\r\n\r\n  IF v_mode NOT IN ('auto','units','cases') THEN\r\n    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;\r\n  END IF;\r\n  IF v_mode = 'auto' THEN\r\n    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;\r\n  END IF;\r\n\r\n  IF v_mode = 'cases' THEN\r\n    v_qty_cases := p_qty;\r\n    v_qty_units := p_qty * v_pkg;\r\n  ELSE\r\n    v_qty_units := p_qty;\r\n    v_qty_cases := CASE WHEN v_pkg > 0 THEN p_qty / v_pkg ELSE NULL END;\r\n  END IF;\r\n  v_target := v_qty_units;\r\n\r\n  INSERT INTO public.warehouse_stock_entries(\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    entry_kind,\r\n    qty,\r\n    qty_cases,\r\n    package_contains,\r\n    note,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    p_entry_kind,\r\n    v_qty_units,\r\n    v_qty_cases,\r\n    v_pkg,\r\n    p_note,\r\n    v_uid\r\n  ) RETURNING * INTO v_entry;\r\n\r\n  IF p_entry_kind = 'purchase' THEN\r\n    SELECT coalesce(qty, 0)\r\n      INTO v_current\r\n      FROM public.warehouse_stock_current\r\n     WHERE warehouse_id = p_warehouse_id\r\n       AND product_id = p_product_id\r\n       AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\n    v_target := v_current + v_qty_units;\r\n  END IF;\r\n\r\n  PERFORM public.record_stocktake(\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    v_target,\r\n    p_variation_id,\r\n    coalesce(p_note, p_entry_kind::text),\r\n    'units'\r\n  );\r\n\r\n  RETURN v_entry;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_stock_entries",
            "language": "plpgsql",
            "arg_count": 7,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_qty numeric, p_variation_id uuid, p_note text, p_qty_input_mode text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_stock_entry",
            "source": "CREATE OR REPLACE FUNCTION public.record_stock_entry(p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_units numeric, p_variation_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)\n RETURNS warehouse_stock_entries\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_entry public.warehouse_stock_entries%ROWTYPE;\r\n  v_current numeric := 0;\r\n  v_target numeric := p_units;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.has_role_any_outlet(v_uid, 'transfer_manager')\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n  IF p_units IS NULL OR p_units <= 0 THEN\r\n    RAISE EXCEPTION 'quantity must be positive';\r\n  END IF;\r\n\r\n  INSERT INTO public.warehouse_stock_entries(\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    entry_kind,\r\n    qty,\r\n    note,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    p_entry_kind,\r\n    p_units,\r\n    p_note,\r\n    v_uid\r\n  ) RETURNING * INTO v_entry;\r\n\r\n  IF p_entry_kind = 'purchase' THEN\r\n    SELECT coalesce(qty, 0)\r\n      INTO v_current\r\n      FROM public.warehouse_stock_current\r\n     WHERE warehouse_id = p_warehouse_id\r\n       AND product_id = p_product_id\r\n       AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\n    v_target := v_current + p_units;\r\n  ELSE\r\n    v_target := p_units;\r\n  END IF;\r\n\r\n  PERFORM public.record_stocktake(\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    v_target,\r\n    p_variation_id,\r\n    coalesce(p_note, p_entry_kind::text)\r\n  );\r\n\r\n  RETURN v_entry;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_stock_entries",
            "language": "plpgsql",
            "arg_count": 6,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_entry_kind stock_entry_kind, p_units numeric, p_variation_id uuid, p_note text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_stocktake",
            "source": "CREATE OR REPLACE FUNCTION public.record_stocktake(p_warehouse_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_qty_input_mode text DEFAULT 'auto'::text)\n RETURNS warehouse_stocktakes\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_current numeric := 0;\r\n  v_delta numeric := 0;\r\n  v_row public.warehouse_stocktakes%ROWTYPE;\r\n  v_pkg numeric := 1;\r\n  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));\r\n  v_qty_units numeric := coalesce(p_counted_qty, 0);\r\n  v_qty_cases numeric := NULL;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT coalesce(\r\n           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),\r\n           (SELECT package_contains FROM public.products WHERE id = p_product_id),\r\n           1\r\n         )\r\n    INTO v_pkg;\r\n\r\n  IF v_mode NOT IN ('auto','units','cases') THEN\r\n    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;\r\n  END IF;\r\n  IF v_mode = 'auto' THEN\r\n    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;\r\n  END IF;\r\n\r\n  IF v_mode = 'cases' THEN\r\n    v_qty_cases := coalesce(p_counted_qty, 0);\r\n    v_qty_units := v_qty_cases * v_pkg;\r\n  ELSE\r\n    v_qty_units := coalesce(p_counted_qty, 0);\r\n    v_qty_cases := CASE WHEN v_pkg > 0 THEN v_qty_units / v_pkg ELSE NULL END;\r\n  END IF;\r\n\r\n  SELECT coalesce(qty, 0)\r\n    INTO v_current\r\n    FROM public.warehouse_stock_current\r\n   WHERE warehouse_id = p_warehouse_id\r\n     AND product_id = p_product_id\r\n     AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\n\r\n  v_delta := v_qty_units - v_current;\r\n\r\n  INSERT INTO public.warehouse_stocktakes (\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    counted_qty,\r\n    counted_cases,\r\n    package_contains,\r\n    delta,\r\n    note,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    v_qty_units,\r\n    v_qty_cases,\r\n    v_pkg,\r\n    v_delta,\r\n    p_note,\r\n    v_uid\r\n  ) RETURNING * INTO v_row;\r\n\r\n  IF v_delta <> 0 THEN\r\n    INSERT INTO public.stock_ledger(\r\n      location_type,\r\n      location_id,\r\n      product_id,\r\n      variation_id,\r\n      qty_change,\r\n      reason,\r\n      ref_order_id,\r\n      note\r\n    ) VALUES (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      p_product_id,\r\n      p_variation_id,\r\n      v_delta,\r\n      'stocktake_adjustment',\r\n      NULL,\r\n      p_note\r\n    );\r\n  END IF;\r\n\r\n  RETURN v_row;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_stocktakes",
            "language": "plpgsql",
            "arg_count": 6,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid, p_note text, p_qty_input_mode text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "record_stocktake",
            "source": "CREATE OR REPLACE FUNCTION public.record_stocktake(p_warehouse_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)\n RETURNS warehouse_stocktakes\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_current numeric := 0;\r\n  v_delta numeric := 0;\r\n  v_row public.warehouse_stocktakes%ROWTYPE;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT coalesce(qty, 0)\r\n    INTO v_current\r\n    FROM public.warehouse_stock_current\r\n   WHERE warehouse_id = p_warehouse_id\r\n     AND product_id = p_product_id\r\n     AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\n\r\n  v_delta := coalesce(p_counted_qty, 0) - v_current;\r\n\r\n  INSERT INTO public.warehouse_stocktakes (\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    counted_qty,\r\n    delta,\r\n    note,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    coalesce(p_counted_qty, 0),\r\n    v_delta,\r\n    p_note,\r\n    v_uid\r\n  ) RETURNING * INTO v_row;\r\n\r\n  IF v_delta <> 0 THEN\r\n    INSERT INTO public.stock_ledger(\r\n      location_type,\r\n      location_id,\r\n      product_id,\r\n      variation_id,\r\n      qty_change,\r\n      reason,\r\n      ref_order_id,\r\n      note\r\n    ) VALUES (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      p_product_id,\r\n      p_variation_id,\r\n      v_delta,\r\n      'stocktake_adjustment',\r\n      NULL,\r\n      p_note\r\n    );\r\n  END IF;\r\n\r\n  RETURN v_row;\r\nEND;\r\n$function$\n",
            "returns": "warehouse_stocktakes",
            "language": "plpgsql",
            "arg_count": 5,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_counted_qty numeric, p_variation_id uuid, p_note text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "refresh_outlet_stock_balances",
            "source": "CREATE OR REPLACE FUNCTION public.refresh_outlet_stock_balances(p_period_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_period public.outlet_stock_periods%ROWTYPE;\r\n  v_period_end timestamptz;\r\nBEGIN\r\n  SELECT * INTO v_period\r\n  FROM public.outlet_stock_periods\r\n  WHERE id = p_period_id;\r\n\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'stock period % not found', p_period_id;\r\n  END IF;\r\n\r\n  v_period_end := coalesce(v_period.period_end, now());\r\n\r\n  DELETE FROM public.outlet_stock_balances\r\n  WHERE period_id = p_period_id;\r\n\r\n  WITH ordered AS (\r\n    SELECT\r\n      ps.product_id,\r\n      ps.variation_id,\r\n      SUM(ps.qty_units) AS ordered_qty\r\n    FROM public.products_sold ps\r\n    JOIN public.orders o ON o.id = ps.order_id\r\n    WHERE o.outlet_id = v_period.outlet_id\r\n      AND o.created_at >= v_period.period_start\r\n      AND o.created_at < v_period_end\r\n    GROUP BY ps.product_id, ps.variation_id\r\n  ),\r\n  sales AS (\r\n    SELECT\r\n      product_id,\r\n      variation_id,\r\n      SUM(qty_units) AS sales_qty\r\n    FROM public.pos_sales\r\n    WHERE outlet_id = v_period.outlet_id\r\n      AND sold_at >= v_period.period_start\r\n      AND sold_at < v_period_end\r\n    GROUP BY product_id, variation_id\r\n  ),\r\n  opening AS (\r\n    SELECT\r\n      product_id,\r\n      variation_id,\r\n      SUM(counted_qty) AS opening_qty\r\n    FROM public.outlet_stocktakes\r\n    WHERE outlet_id = v_period.outlet_id\r\n      AND period_id = v_period.id\r\n      AND snapshot_kind = 'opening'\r\n    GROUP BY product_id, variation_id\r\n  ),\r\n  closing AS (\r\n    SELECT\r\n      product_id,\r\n      variation_id,\r\n      SUM(counted_qty) AS actual_qty\r\n    FROM public.outlet_stocktakes\r\n    WHERE outlet_id = v_period.outlet_id\r\n      AND period_id = v_period.id\r\n      AND snapshot_kind = 'closing'\r\n    GROUP BY product_id, variation_id\r\n  ),\r\n  combos AS (\r\n    SELECT DISTINCT product_id, variation_id\r\n    FROM (\r\n      SELECT product_id, variation_id FROM ordered\r\n      UNION\r\n      SELECT product_id, variation_id FROM sales\r\n      UNION\r\n      SELECT product_id, variation_id FROM opening\r\n      UNION\r\n      SELECT product_id, variation_id FROM closing\r\n    ) AS unioned\r\n  )\r\n  INSERT INTO public.outlet_stock_balances(\r\n    id,\r\n    period_id,\r\n    outlet_id,\r\n    product_id,\r\n    variation_id,\r\n    opening_qty,\r\n    ordered_qty,\r\n    pos_sales_qty,\r\n    expected_qty,\r\n    actual_qty,\r\n    variance_qty,\r\n    closing_qty,\r\n    computed_at\r\n  )\r\n  SELECT\r\n    gen_random_uuid(),\r\n    v_period.id,\r\n    v_period.outlet_id,\r\n    c.product_id,\r\n    c.variation_id,\r\n    coalesce(op.opening_qty, 0),\r\n    coalesce(ord.ordered_qty, 0),\r\n    coalesce(s.sales_qty, 0),\r\n    coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0) AS expected_qty,\r\n    cl.actual_qty,\r\n    CASE\r\n      WHEN cl.actual_qty IS NULL THEN NULL\r\n      ELSE cl.actual_qty - (coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0))\r\n    END AS variance_qty,\r\n    coalesce(cl.actual_qty, coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0)),\r\n    now()\r\n  FROM combos c\r\n  LEFT JOIN ordered ord ON ord.product_id = c.product_id AND ord.variation_id IS NOT DISTINCT FROM c.variation_id\r\n  LEFT JOIN sales s ON s.product_id = c.product_id AND s.variation_id IS NOT DISTINCT FROM c.variation_id\r\n  LEFT JOIN opening op ON op.product_id = c.product_id AND op.variation_id IS NOT DISTINCT FROM c.variation_id\r\n  LEFT JOIN closing cl ON cl.product_id = c.product_id AND cl.variation_id IS NOT DISTINCT FROM c.variation_id;\r\n\r\nEND;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_period_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "report_pack_consumption",
            "source": "CREATE OR REPLACE FUNCTION public.report_pack_consumption(p_from timestamp with time zone, p_to timestamp with time zone, p_location uuid DEFAULT NULL::uuid, p_warehouse uuid DEFAULT NULL::uuid)\n RETURNS SETOF order_pack_consumption\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT *\r\n  FROM public.order_pack_consumption opc\r\n  WHERE (p_from IS NULL OR opc.created_at >= p_from)\r\n    AND (p_to IS NULL OR opc.created_at <= p_to)\r\n    AND (p_location IS NULL OR opc.outlet_id = p_location)\r\n    AND (p_warehouse IS NULL OR opc.warehouse_id = p_warehouse)\r\n    AND (\r\n      public.is_admin(auth.uid())\r\n      OR opc.outlet_id = ANY(public.member_outlet_ids(auth.uid()))\r\n    );\r\n$function$\n",
            "returns": "SETOF order_pack_consumption",
            "language": "sql",
            "arg_count": 4,
            "arguments": "p_from timestamp with time zone, p_to timestamp with time zone, p_location uuid, p_warehouse uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "report_stock_entry_balances",
            "source": "CREATE OR REPLACE FUNCTION public.report_stock_entry_balances(p_warehouse_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_variation_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)\n RETURNS TABLE(warehouse_id uuid, warehouse_name text, product_id uuid, product_name text, variation_id uuid, variation_name text, initial_qty numeric, purchase_qty numeric, closing_qty numeric, current_stock numeric)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_query text := coalesce(p_search, '');\r\nBEGIN\r\n  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n\r\n  RETURN QUERY\r\n  SELECT\r\n    e.warehouse_id,\r\n    w.name AS warehouse_name,\r\n    e.product_id,\r\n    p.name AS product_name,\r\n    e.variation_id,\r\n    pv.name AS variation_name,\r\n    SUM(CASE WHEN e.entry_kind = 'initial' THEN e.qty ELSE 0 END) AS initial_qty,\r\n    SUM(CASE WHEN e.entry_kind = 'purchase' THEN e.qty ELSE 0 END) AS purchase_qty,\r\n    SUM(CASE WHEN e.entry_kind = 'closing' THEN e.qty ELSE 0 END) AS closing_qty,\r\n    SUM(CASE WHEN e.entry_kind = 'initial' THEN e.qty ELSE 0 END)\r\n      + SUM(CASE WHEN e.entry_kind = 'purchase' THEN e.qty ELSE 0 END)\r\n      - SUM(CASE WHEN e.entry_kind = 'closing' THEN e.qty ELSE 0 END) AS current_stock\r\n  FROM public.warehouse_stock_entries e\r\n  JOIN public.warehouses w ON w.id = e.warehouse_id\r\n  JOIN public.products p ON p.id = e.product_id\r\n  LEFT JOIN public.product_variations pv ON pv.id = e.variation_id\r\n  WHERE (p_warehouse_id IS NULL OR e.warehouse_id = p_warehouse_id)\r\n    AND (p_product_id IS NULL OR e.product_id = p_product_id)\r\n    AND (p_variation_id IS NULL OR e.variation_id = p_variation_id)\r\n    AND (\r\n      v_query = ''\r\n      OR p.name ILIKE '%' || v_query || '%'\r\n      OR coalesce(pv.name, '') ILIKE '%' || v_query || '%'\r\n    )\r\n  GROUP BY e.warehouse_id, w.name, e.product_id, p.name, e.variation_id, pv.name\r\n  ORDER BY p.name, COALESCE(pv.name, ''), w.name;\r\nEND;\r\n$function$\n",
            "returns": "TABLE(warehouse_id uuid, warehouse_name text, product_id uuid, product_name text, variation_id uuid, variation_name text, initial_qty numeric, purchase_qty numeric, closing_qty numeric, current_stock numeric)",
            "language": "plpgsql",
            "arg_count": 4,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_variation_id uuid, p_search text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "reset_order_sequence",
            "source": "CREATE OR REPLACE FUNCTION public.reset_order_sequence(p_outlet_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\nbegin\r\n  -- TODO: Implement to match your next_order_number generator, e.g.:\r\n  -- update public.order_number_counters set next_val = 1 where outlet_id = p_outlet_id;\r\n  null;\r\nend;\r\n$function$\n",
            "returns": "void",
            "language": "plpgsql",
            "arg_count": 1,
            "arguments": "p_outlet_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "reset_order_sequence",
            "source": "CREATE OR REPLACE FUNCTION public.reset_order_sequence(p_outlet_id uuid, p_next_seq bigint DEFAULT 1)\n RETURNS bigint\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_temp'\nAS $function$\r\ndeclare\r\n  v_uid uuid := auth.uid();\r\n  v_next bigint;\r\nbegin\r\n  if v_uid is null then\r\n    raise exception 'not authenticated';\r\n  end if;\r\n  if not public.is_admin(v_uid) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  insert into public.outlet_sequences(outlet_id, next_seq)\r\n  values(p_outlet_id, p_next_seq)\r\n  on conflict (outlet_id)\r\n  do update set next_seq = excluded.next_seq;\r\n\r\n  select next_seq into v_next from public.outlet_sequences where outlet_id = p_outlet_id;\r\n  return v_next;\r\nend;\r\n$function$\n",
            "returns": "bigint",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_outlet_id uuid, p_next_seq bigint",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "set_product_suppliers",
            "source": "CREATE OR REPLACE FUNCTION public.set_product_suppliers(p_warehouse_id uuid, p_product_id uuid, p_supplier_ids uuid[], p_variation_id uuid DEFAULT NULL::uuid, p_active boolean DEFAULT true)\n RETURNS TABLE(supplier_id uuid, product_id uuid, variation_id uuid, warehouse_id uuid, active boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.has_role_any_outlet(v_uid, 'transfers')\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n\r\n  -- Normalize input (unique, non-null supplier IDs)\r\n  WITH normalized AS (\r\n    SELECT DISTINCT sid AS supplier_id\r\n    FROM unnest(coalesce(p_supplier_ids, '{}')) AS sid\r\n    WHERE sid IS NOT NULL\r\n  )\r\n  -- Remove links that are no longer selected\r\n  DELETE FROM public.product_supplier_links psl\r\n  WHERE psl.warehouse_id = p_warehouse_id\r\n    AND psl.product_id = p_product_id\r\n    AND (psl.variation_id IS NOT DISTINCT FROM p_variation_id)\r\n    AND NOT EXISTS (\r\n      SELECT 1 FROM normalized n WHERE n.supplier_id = psl.supplier_id\r\n    );\r\n\r\n  -- Upsert active links for the provided suppliers\r\n  INSERT INTO public.product_supplier_links(\r\n    warehouse_id,\r\n    product_id,\r\n    variation_id,\r\n    supplier_id,\r\n    active\r\n  )\r\n  SELECT\r\n    p_warehouse_id,\r\n    p_product_id,\r\n    p_variation_id,\r\n    n.supplier_id,\r\n    COALESCE(p_active, true)\r\n  FROM normalized n\r\n  ON CONFLICT ON CONSTRAINT ux_product_supplier_links_scope\r\n  DO UPDATE SET\r\n    active = EXCLUDED.active,\r\n    updated_at = now();\r\n\r\n  RETURN QUERY\r\n  SELECT\r\n    supplier_id,\r\n    product_id,\r\n    variation_id,\r\n    warehouse_id,\r\n    active\r\n  FROM public.product_supplier_links\r\n  WHERE warehouse_id = p_warehouse_id\r\n    AND product_id = p_product_id\r\n    AND (variation_id IS NOT DISTINCT FROM p_variation_id);\r\nEND;\r\n$function$\n",
            "returns": "TABLE(supplier_id uuid, product_id uuid, variation_id uuid, warehouse_id uuid, active boolean)",
            "language": "plpgsql",
            "arg_count": 5,
            "arguments": "p_warehouse_id uuid, p_product_id uuid, p_supplier_ids uuid[], p_variation_id uuid, p_active boolean",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "start_outlet_stock_period",
            "source": "CREATE OR REPLACE FUNCTION public.start_outlet_stock_period(p_outlet_id uuid, p_period_start timestamp with time zone DEFAULT now())\n RETURNS outlet_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_period public.outlet_stock_periods%ROWTYPE;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_outlet_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet_id is required';\r\n  END IF;\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to start stock period';\r\n  END IF;\r\n\r\n  PERFORM 1\r\n  FROM public.outlet_stock_periods\r\n  WHERE outlet_id = p_outlet_id\r\n    AND status = 'open';\r\n  IF FOUND THEN\r\n    RAISE EXCEPTION 'outlet % already has an open stock period', p_outlet_id;\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_stock_periods(\r\n    outlet_id,\r\n    period_start,\r\n    status,\r\n    created_by\r\n  ) VALUES (\r\n    p_outlet_id,\r\n    coalesce(p_period_start, now()),\r\n    'open',\r\n    v_uid\r\n  ) RETURNING * INTO v_period;\r\n\r\n  RETURN v_period;\r\nEND;\r\n$function$\n",
            "returns": "outlet_stock_periods",
            "language": "plpgsql",
            "arg_count": 2,
            "arguments": "p_outlet_id uuid, p_period_start timestamp with time zone",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "supervisor_approve_order",
            "source": "CREATE OR REPLACE FUNCTION public.supervisor_approve_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS orders\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%ROWTYPE;\r\n  v_name text := nullif(btrim(coalesce(p_supervisor_name,\r\n                     (current_setting('request.jwt.claims', true)::jsonb ->> 'name'))), '');\r\n  v_sig text := nullif(btrim(p_signature_path), '');\r\n  v_pdf text := nullif(btrim(p_pdf_path), '');\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)) THEN\r\n    RAISE EXCEPTION 'not authorized to approve this order';\r\n  END IF;\r\n\r\n  UPDATE public.orders o\r\n         SET status = CASE\r\n           WHEN lower(coalesce(o.status, '')) IN ('loaded', 'delivered') THEN o.status\r\n           ELSE 'Approved'\r\n         END,\r\n         locked = true,\r\n         lock_stage = 'supervisor'::public.order_lock_stage,\r\n         approved_at = coalesce(o.approved_at, now()),\r\n         approved_by = coalesce(o.approved_by, v_uid),\r\n         supervisor_signed_name = coalesce(v_name, o.supervisor_signed_name),\r\n         supervisor_signature_path = coalesce(v_sig, o.supervisor_signature_path),\r\n         supervisor_signed_at = CASE\r\n             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.supervisor_signed_at, now())\r\n             ELSE o.supervisor_signed_at\r\n         END,\r\n         pdf_path = coalesce(v_pdf, o.pdf_path),\r\n         approved_pdf_path = coalesce(v_pdf, o.approved_pdf_path)\r\n   WHERE o.id = p_order_id\r\n   RETURNING * INTO v_order;\r\n\r\n  PERFORM public.ensure_order_warehouse_deductions(p_order_id);\r\n\r\n  RETURN v_order;\r\nEND;\r\n$function$\n",
            "returns": "orders",
            "language": "plpgsql",
            "arg_count": 4,
            "arguments": "p_order_id uuid, p_supervisor_name text, p_signature_path text, p_pdf_path text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "suppliers_for_warehouse",
            "source": "CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)\n RETURNS TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    s.id,\r\n    s.name,\r\n    s.contact_name,\r\n    s.contact_phone,\r\n    s.contact_email,\r\n    s.active\r\n  FROM public.suppliers s\r\n  JOIN public.product_supplier_links psl ON psl.supplier_id = s.id\r\n  WHERE psl.warehouse_id = p_warehouse_id\r\n    AND psl.active\r\n    AND s.active\r\n  ORDER BY s.name;\r\n$function$\n",
            "returns": "TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_warehouse_id uuid",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "tg_order_items_amount",
            "source": "CREATE OR REPLACE FUNCTION public.tg_order_items_amount()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_temp'\nAS $function$\r\nbegin\r\n  new.amount := coalesce(new.qty, 0)::numeric * coalesce(new.cost, 0)::numeric;\r\n  return new;\r\nend;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "tg_order_items_supervisor_qty_only",
            "source": "CREATE OR REPLACE FUNCTION public.tg_order_items_supervisor_qty_only()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_temp'\nAS $function$\r\nDECLARE\r\n  v_role text := lower(coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''));\r\n  v_same_outlet boolean := false;\r\nBEGIN\r\n  IF v_role <> 'supervisor' THEN\r\n    RETURN NEW;\r\n  END IF;\r\n\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.orders o\r\n    JOIN public.user_roles ur ON ur.outlet_id = o.outlet_id\r\n    WHERE o.id = NEW.order_id\r\n      AND ur.user_id = auth.uid()\r\n      AND ur.active\r\n      AND lower(ur.role) = 'supervisor'\r\n  ) INTO v_same_outlet;\r\n\r\n  IF NOT v_same_outlet THEN\r\n    RAISE EXCEPTION 'not allowed: supervisor not linked to this outlet';\r\n  END IF;\r\n\r\n  IF (NEW.order_id       IS DISTINCT FROM OLD.order_id) OR\r\n     (NEW.product_id     IS DISTINCT FROM OLD.product_id) OR\r\n     (NEW.variation_id   IS DISTINCT FROM OLD.variation_id) OR\r\n     (NEW.name           IS DISTINCT FROM OLD.name) OR\r\n     (NEW.uom            IS DISTINCT FROM OLD.uom) OR\r\n     (NEW.cost           IS DISTINCT FROM OLD.cost) OR\r\n     (NEW.amount         IS DISTINCT FROM OLD.amount) THEN\r\n    RAISE EXCEPTION 'supervisors may only update qty';\r\n  END IF;\r\n\r\n  IF NEW.qty IS NULL THEN\r\n    RAISE EXCEPTION 'qty cannot be null';\r\n  END IF;\r\n\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "tm_for_outlet",
            "source": "CREATE OR REPLACE FUNCTION public.tm_for_outlet(p_outlet_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'auth'\nAS $function$\r\n  SELECT public.has_role('transfers', p_outlet_id);\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_outlet_id uuid",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "tm_for_warehouse",
            "source": "CREATE OR REPLACE FUNCTION public.tm_for_warehouse(p_warehouse_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'auth'\nAS $function$\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.warehouses w\r\n    WHERE w.id = p_warehouse_id\r\n      AND public.has_role('transfers', w.outlet_id)\r\n  );\r\n$function$\n",
            "returns": "boolean",
            "language": "sql",
            "arg_count": 1,
            "arguments": "p_warehouse_id uuid",
            "volatility": "s",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "touch_product_recipe",
            "source": "CREATE OR REPLACE FUNCTION public.touch_product_recipe()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  NEW.updated_at := now();\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "transfer_units_between_warehouses",
            "source": "CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_src_outlet uuid;\r\n  v_dest_outlet uuid;\r\n  v_mov_id uuid;\r\n  v_items jsonb := COALESCE(p_items, '[]'::jsonb);\r\n  v_item record;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RAISE EXCEPTION 'not authenticated';\r\n  END IF;\r\n  IF p_source IS NULL OR p_destination IS NULL OR p_source = p_destination THEN\r\n    RAISE EXCEPTION 'source and destination warehouses are required';\r\n  END IF;\r\n\r\n  SELECT outlet_id INTO v_src_outlet FROM public.warehouses WHERE id = p_source;\r\n  SELECT outlet_id INTO v_dest_outlet FROM public.warehouses WHERE id = p_destination;\r\n  IF v_src_outlet IS NULL OR v_dest_outlet IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse not found';\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR public.has_role(v_uid, 'transfers', v_src_outlet)\r\n    OR public.has_role(v_uid, 'transfers', v_dest_outlet)\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized';\r\n  END IF;\r\n\r\n  IF jsonb_array_length(v_items) = 0 THEN\r\n    RAISE EXCEPTION 'at least one line item is required';\r\n  END IF;\r\n\r\n  INSERT INTO public.stock_movements(\r\n    status,\r\n    source_location_type,\r\n    source_location_id,\r\n    dest_location_type,\r\n    dest_location_id,\r\n    note\r\n  ) VALUES (\r\n    'approved',\r\n    'warehouse',\r\n    p_source,\r\n    'warehouse',\r\n    p_destination,\r\n    p_note\r\n  ) RETURNING id INTO v_mov_id;\r\n\r\n  FOR v_item IN\r\n    SELECT\r\n      (item->>'product_id')::uuid AS product_id,\r\n      (item->>'variation_id')::uuid AS variation_id,\r\n      COALESCE((item->>'qty')::numeric, 0) AS qty\r\n    FROM jsonb_array_elements(v_items) AS item\r\n  LOOP\r\n    IF v_item.product_id IS NULL OR v_item.qty <= 0 THEN\r\n      RAISE EXCEPTION 'each item requires product_id and positive qty';\r\n    END IF;\r\n\r\n    INSERT INTO public.stock_movement_items(\r\n      movement_id,\r\n      product_id,\r\n      variation_id,\r\n      qty\r\n    ) VALUES (\r\n      v_mov_id,\r\n      v_item.product_id,\r\n      v_item.variation_id,\r\n      v_item.qty\r\n    );\r\n  END LOOP;\r\n\r\n  PERFORM public.complete_stock_movement(v_mov_id);\r\n  RETURN v_mov_id;\r\nEND;\r\n$function$\n",
            "returns": "uuid",
            "language": "plpgsql",
            "arg_count": 4,
            "arguments": "p_source uuid, p_destination uuid, p_items jsonb, p_note text",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "trg_order_items_qty_only",
            "source": "CREATE OR REPLACE FUNCTION public.trg_order_items_qty_only()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  -- Admin can do anything\r\n  if public.is_admin(auth.uid()) then\r\n    return NEW;\r\n  end if;\r\n  -- If user is supervisor, check only qty changed\r\n  if public.has_role(auth.uid(), 'supervisor') then\r\n    if (NEW.qty is distinct from OLD.qty)\r\n       and (coalesce(NEW.name, '') = coalesce(OLD.name, ''))\r\n       and (coalesce(NEW.uom, '') = coalesce(OLD.uom, ''))\r\n       and (coalesce(NEW.cost, 0) = coalesce(OLD.cost, 0))\r\n       and (coalesce(NEW.amount, 0) = coalesce(OLD.amount, 0))\r\n       and (coalesce(NEW.product_id::text, '') = coalesce(OLD.product_id::text, ''))\r\n       and (coalesce(NEW.variation_id::text, '') = coalesce(OLD.variation_id::text, ''))\r\n       and (coalesce(NEW.order_id::text, '') = coalesce(OLD.order_id::text, ''))\r\n       and (coalesce(NEW.outlet_id::text, '') = coalesce(OLD.outlet_id::text, '')) then\r\n      -- Optionally auto-recompute amount = cost*qty\r\n      NEW.amount := coalesce(NEW.cost, 0) * coalesce(NEW.qty, 0);\r\n      return NEW;\r\n    else\r\n      raise exception 'Only qty can be changed by supervisors';\r\n    end if;\r\n  end if;\r\n  -- Others (non-admin, non-supervisor) cannot update rows by policy anyway\r\n  return NEW;\r\nend;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "trg_order_items_supervisor_guard",
            "source": "CREATE OR REPLACE FUNCTION public.trg_order_items_supervisor_guard()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_temp'\nAS $function$\r\ndeclare\r\n  v_uid uuid := auth.uid();\r\n  v_outlet_id uuid;\r\n  v_is_admin boolean;\r\n  v_is_supervisor boolean;\r\n  v_name text;\r\nbegin\r\n  -- Admins bypass checks\r\n  v_is_admin := public.is_admin(v_uid);\r\n  if v_is_admin then\r\n    return NEW;\r\n  end if;\r\n\r\n  -- For unauthenticated, block\r\n  if v_uid is null then\r\n    raise exception 'not authenticated';\r\n  end if;\r\n\r\n  -- Determine outlet of the parent order\r\n  select o.outlet_id into v_outlet_id from public.orders o where o.id = NEW.order_id;\r\n  if v_outlet_id is null then\r\n    raise exception 'parent order not found for %', NEW.order_id;\r\n  end if;\r\n\r\n  v_is_supervisor := public.has_role(v_uid, 'supervisor', v_outlet_id);\r\n\r\n  if v_is_supervisor then\r\n    -- Permit only qty change. Recalculate amount server-side.\r\n    if (NEW.product_id is distinct from OLD.product_id)\r\n       or (NEW.variation_id is distinct from OLD.variation_id)\r\n       or (NEW.name is distinct from OLD.name)\r\n       or (NEW.uom is distinct from OLD.uom)\r\n       or (NEW.cost is distinct from OLD.cost)\r\n       or (NEW.amount is distinct from OLD.amount)\r\n    then\r\n      -- We manage amount separately; other fields cannot change for supervisor\r\n      NEW.product_id := OLD.product_id;\r\n      NEW.variation_id := OLD.variation_id;\r\n      NEW.name := OLD.name;\r\n      NEW.uom := OLD.uom;\r\n      NEW.cost := OLD.cost;\r\n    end if;\r\n\r\n    -- Only qty may differ; if not changing qty, just pass through\r\n    if NEW.qty is distinct from OLD.qty then\r\n      NEW.amount := coalesce(NEW.qty, 0) * coalesce(NEW.cost, 0);\r\n\r\n      v_name := nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'name'), '');\r\n      update public.orders o\r\n         set modified_by_supervisor = true,\r\n             modified_by_supervisor_name = coalesce(v_name, o.modified_by_supervisor_name)\r\n       where o.id = NEW.order_id;\r\n    end if;\r\n\r\n    return NEW;\r\n  end if;\r\n\r\n  -- Non-admin, non-supervisor must own the outlet of the order to update; typically disallowed by RLS anyway\r\n  raise exception 'not authorized';\r\nend;\r\n$function$\n",
            "returns": "trigger",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": false
        },
        {
            "kind": "f",
            "name": "whoami_outlet",
            "source": "CREATE OR REPLACE FUNCTION public.whoami_outlet()\n RETURNS TABLE(outlet_id uuid, outlet_name text)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public', 'auth'\nAS $function$\r\n  SELECT o.id, o.name\r\n  FROM public.outlets o\r\n  WHERE o.auth_user_id = auth.uid();\r\n$function$\n",
            "returns": "TABLE(outlet_id uuid, outlet_name text)",
            "language": "sql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": true
        },
        {
            "kind": "f",
            "name": "whoami_roles",
            "source": "CREATE OR REPLACE FUNCTION public.whoami_roles()\n RETURNS TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'auth'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_email text;\r\n  v_is_admin boolean := false;\r\n  v_roles text[] := '{}';\r\n  v_outlets jsonb := '[]'::jsonb;\r\n  v_role_catalog jsonb := '[]'::jsonb;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RETURN QUERY SELECT NULL::uuid, NULL::text, FALSE, ARRAY[]::text[], '[]'::jsonb;\r\n    RETURN;\r\n  END IF;\r\n\r\n  SELECT u.email INTO v_email\r\n  FROM auth.users u\r\n  WHERE u.id = v_uid;\r\n\r\n  SELECT EXISTS (\r\n    SELECT 1\r\n    FROM public.user_roles ur\r\n    WHERE ur.user_id = v_uid\r\n      AND ur.active\r\n      AND lower(ur.role) = 'admin'\r\n  ) INTO v_is_admin;\r\n\r\n  SELECT COALESCE(\r\n    ARRAY(\r\n      SELECT DISTINCT lower(ur.role)\r\n      FROM public.user_roles ur\r\n      WHERE ur.user_id = v_uid\r\n        AND ur.active\r\n      ORDER BY lower(ur.role)\r\n    ), '{}'\r\n  ) INTO v_roles;\r\n\r\n  SELECT COALESCE(\r\n    (\r\n      SELECT jsonb_agg(jsonb_build_object(\r\n        'outlet_id', o.id,\r\n        'outlet_name', o.name,\r\n        'roles', ARRAY(SELECT DISTINCT lower(ur_inner.role)\r\n                       FROM public.user_roles ur_inner\r\n                       WHERE ur_inner.user_id = v_uid\r\n                         AND ur_inner.active\r\n                         AND ur_inner.outlet_id = o.id\r\n                       ORDER BY lower(ur_inner.role)))\r\n      )\r\n      FROM public.outlets o\r\n      WHERE EXISTS (\r\n        SELECT 1\r\n        FROM public.user_roles ur\r\n        WHERE ur.user_id = v_uid\r\n          AND ur.active\r\n          AND ur.outlet_id = o.id\r\n      )\r\n    ), '[]'::jsonb\r\n  ) INTO v_outlets;\r\n\r\n  SELECT COALESCE(\r\n    (\r\n      SELECT jsonb_agg(jsonb_build_object(\r\n        'id', row_data.id,\r\n        'slug', row_data.slug,\r\n        'normalized_slug', row_data.slug_lower,\r\n        'display_name', row_data.display_name\r\n      ))\r\n      FROM (\r\n        SELECT DISTINCT r.id, r.slug, lower(r.slug) AS slug_lower, r.display_name\r\n        FROM public.roles r\r\n        JOIN public.user_roles ur\r\n          ON lower(ur.role) = lower(r.slug)\r\n        WHERE ur.user_id = v_uid\r\n          AND ur.active\r\n      ) AS row_data\r\n    ),\r\n    '[]'::jsonb\r\n  ) INTO v_role_catalog;\r\n\r\n  RETURN QUERY SELECT v_uid, v_email, COALESCE(v_is_admin, FALSE), COALESCE(v_roles, '{}'), COALESCE(v_outlets, '[]'::jsonb), COALESCE(v_role_catalog, '[]'::jsonb);\r\nEND;\r\n$function$\n",
            "returns": "TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)",
            "language": "plpgsql",
            "arg_count": 0,
            "arguments": "",
            "volatility": "v",
            "security_definer": true
        }
    ],
    "sequences": null,
    "constraints": [
        {
            "name": "2200_17551_1_not_null",
            "type": "CHECK",
            "table": "assets",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17551_2_not_null",
            "type": "CHECK",
            "table": "assets",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17551_3_not_null",
            "type": "CHECK",
            "table": "assets",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "assets_pkey",
            "type": "PRIMARY KEY",
            "table": "assets",
            "columns": [
                "key"
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_10_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_1_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_2_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_3_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_5_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61607_9_not_null",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "damages_qty_check",
            "type": "CHECK",
            "table": "damages",
            "columns": null,
            "check_definition": "CHECK ((qty > (0)::numeric))"
        },
        {
            "name": "damages_qty_check",
            "type": "CHECK",
            "table": "damages",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "damages_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "damages",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "damages_source_entry_id_fkey",
            "type": "FOREIGN KEY",
            "table": "damages",
            "columns": [
                "source_entry_id"
            ],
            "check_definition": null
        },
        {
            "name": "damages_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "damages",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "damages_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "damages",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "damages_pkey",
            "type": "PRIMARY KEY",
            "table": "damages",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22099_1_not_null",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22099_2_not_null",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22099_3_not_null",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22099_4_not_null",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22099_5_not_null",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_qty_check",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": null,
            "check_definition": "CHECK ((qty > (0)::numeric))"
        },
        {
            "name": "order_item_allocations_qty_check",
            "type": "CHECK",
            "table": "order_item_allocations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_order_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_item_allocations",
            "columns": [
                "order_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_order_item_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_item_allocations",
            "columns": [
                "order_item_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_item_allocations",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_pkey",
            "type": "PRIMARY KEY",
            "table": "order_item_allocations",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "order_item_allocations_order_item_id_warehouse_id_key",
            "type": "UNIQUE",
            "table": "order_item_allocations",
            "columns": [
                "order_item_id",
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_11_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_1_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_2_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_5_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_6_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_7_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_8_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17527_9_not_null",
            "type": "CHECK",
            "table": "order_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "order_items_order_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_items",
            "columns": [
                "order_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_items_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_items",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_items_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_items",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_items_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "order_items",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "order_items_pkey",
            "type": "PRIMARY KEY",
            "table": "order_items",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_10_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_1_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_2_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_3_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_4_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_5_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_6_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17510_9_not_null",
            "type": "CHECK",
            "table": "orders",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "orders_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "orders",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "orders_pkey",
            "type": "PRIMARY KEY",
            "table": "orders",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22020_1_not_null",
            "type": "CHECK",
            "table": "outlet_primary_warehouse",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22020_2_not_null",
            "type": "CHECK",
            "table": "outlet_primary_warehouse",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22020_3_not_null",
            "type": "CHECK",
            "table": "outlet_primary_warehouse",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_primary_warehouse_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_primary_warehouse",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_primary_warehouse_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_primary_warehouse",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_primary_warehouse_pkey",
            "type": "PRIMARY KEY",
            "table": "outlet_primary_warehouse",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17499_1_not_null",
            "type": "CHECK",
            "table": "outlet_sequences",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17499_2_not_null",
            "type": "CHECK",
            "table": "outlet_sequences",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_sequences_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_sequences",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_sequences_pkey",
            "type": "PRIMARY KEY",
            "table": "outlet_sequences",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_13_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_1_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_2_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_3_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_4_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_6_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_7_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_8_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49663_9_not_null",
            "type": "CHECK",
            "table": "outlet_stock_balances",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stock_balances",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_period_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stock_balances",
            "columns": [
                "period_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stock_balances",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stock_balances",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_pkey",
            "type": "PRIMARY KEY",
            "table": "outlet_stock_balances",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_balances_period_id_product_id_variation_id_key",
            "type": "UNIQUE",
            "table": "outlet_stock_balances",
            "columns": [
                "period_id",
                "product_id",
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49605_1_not_null",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49605_2_not_null",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49605_3_not_null",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49605_5_not_null",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49605_7_not_null",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_periods_status_check",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": null,
            "check_definition": "CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))"
        },
        {
            "name": "outlet_stock_periods_status_check",
            "type": "CHECK",
            "table": "outlet_stock_periods",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_periods_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stock_periods",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stock_periods_pkey",
            "type": "PRIMARY KEY",
            "table": "outlet_stock_periods",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_11_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_12_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_1_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_2_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_4_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_6_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_8_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49625_9_not_null",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_counted_qty_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_counted_qty_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": null,
            "check_definition": "CHECK ((counted_qty >= (0)::numeric))"
        },
        {
            "name": "outlet_stocktakes_package_contains_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": null,
            "check_definition": "CHECK ((package_contains > (0)::numeric))"
        },
        {
            "name": "outlet_stocktakes_package_contains_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_snapshot_kind_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_snapshot_kind_check",
            "type": "CHECK",
            "table": "outlet_stocktakes",
            "columns": null,
            "check_definition": "CHECK ((snapshot_kind = ANY (ARRAY['opening'::text, 'closing'::text, 'spot'::text])))"
        },
        {
            "name": "outlet_stocktakes_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stocktakes",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_period_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stocktakes",
            "columns": [
                "period_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stocktakes",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "outlet_stocktakes",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "outlet_stocktakes_pkey",
            "type": "PRIMARY KEY",
            "table": "outlet_stocktakes",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17459_1_not_null",
            "type": "CHECK",
            "table": "outlets",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17459_3_not_null",
            "type": "CHECK",
            "table": "outlets",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "outlets_pkey",
            "type": "PRIMARY KEY",
            "table": "outlets",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_10_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_11_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_12_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_1_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_2_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_3_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_5_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49569_7_not_null",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_package_contains_check",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": null,
            "check_definition": "CHECK ((package_contains > (0)::numeric))"
        },
        {
            "name": "pos_sales_package_contains_check",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_qty_units_check",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_qty_units_check",
            "type": "CHECK",
            "table": "pos_sales",
            "columns": null,
            "check_definition": "CHECK ((qty_units > (0)::numeric))"
        },
        {
            "name": "pos_sales_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "pos_sales",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "pos_sales",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "pos_sales",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "pos_sales_pkey",
            "type": "PRIMARY KEY",
            "table": "pos_sales",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_1_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_2_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_3_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_5_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_6_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_7_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49076_9_not_null",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_qty_per_sale_check",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_qty_per_sale_check",
            "type": "CHECK",
            "table": "product_recipe_ingredients",
            "columns": null,
            "check_definition": "CHECK ((qty_per_sale > (0)::numeric))"
        },
        {
            "name": "product_recipe_ingredients_ingredient_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipe_ingredients",
            "columns": [
                "ingredient_product_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_ingredient_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipe_ingredients",
            "columns": [
                "ingredient_variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_recipe_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipe_ingredients",
            "columns": [
                "recipe_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipe_ingredients",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipe_ingredients_pkey",
            "type": "PRIMARY KEY",
            "table": "product_recipe_ingredients",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_1_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_2_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_4_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_5_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_7_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_8_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_49051_9_not_null",
            "type": "CHECK",
            "table": "product_recipes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_recipes_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipes",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipes_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_recipes",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_recipes_pkey",
            "type": "PRIMARY KEY",
            "table": "product_recipes",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_1_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_2_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_4_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_5_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_6_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_7_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_61133_8_not_null",
            "type": "CHECK",
            "table": "product_supplier_links",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_supplier_links_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_supplier_links",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_supplier_links_supplier_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_supplier_links",
            "columns": [
                "supplier_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_supplier_links_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_supplier_links",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_supplier_links_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_supplier_links",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_supplier_links_pkey",
            "type": "PRIMARY KEY",
            "table": "product_supplier_links",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_10_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_1_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_2_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_3_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_5_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_6_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17483_7_not_null",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_variations_case_size_units_check",
            "type": "CHECK",
            "table": "product_variations",
            "columns": null,
            "check_definition": "CHECK ((package_contains > (0)::numeric))"
        },
        {
            "name": "product_variations_case_size_units_check",
            "type": "CHECK",
            "table": "product_variations",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "product_variations_default_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_variations",
            "columns": [
                "default_warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_variations_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "product_variations",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "product_variations_pkey",
            "type": "PRIMARY KEY",
            "table": "product_variations",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_11_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_1_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_3_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_5_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_6_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_7_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_17470_8_not_null",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "products_case_size_units_check",
            "type": "CHECK",
            "table": "products",
            "columns": null,
            "check_definition": "CHECK ((package_contains > (0)::numeric))"
        },
        {
            "name": "products_case_size_units_check",
            "type": "CHECK",
            "table": "products",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "products_default_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products",
            "columns": [
                "default_warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_pkey",
            "type": "PRIMARY KEY",
            "table": "products",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sku_key",
            "type": "UNIQUE",
            "table": "products",
            "columns": [
                "sku"
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_10_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_11_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_12_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_1_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_2_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_3_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_4_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_5_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_7_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_48975_9_not_null",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_package_contains_check",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_package_contains_check",
            "type": "CHECK",
            "table": "products_sold",
            "columns": null,
            "check_definition": "CHECK ((package_contains > (0)::numeric))"
        },
        {
            "name": "products_sold_qty_units_check",
            "type": "CHECK",
            "table": "products_sold",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_qty_units_check",
            "type": "CHECK",
            "table": "products_sold",
            "columns": null,
            "check_definition": "CHECK ((qty_units > (0)::numeric))"
        },
        {
            "name": "products_sold_order_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "order_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_order_item_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "order_item_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "products_sold",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_pkey",
            "type": "PRIMARY KEY",
            "table": "products_sold",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "products_sold_order_item_id_key",
            "type": "UNIQUE",
            "table": "products_sold",
            "columns": [
                "order_item_id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_53638_1_not_null",
            "type": "CHECK",
            "table": "roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_53638_2_not_null",
            "type": "CHECK",
            "table": "roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_53638_3_not_null",
            "type": "CHECK",
            "table": "roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_53638_5_not_null",
            "type": "CHECK",
            "table": "roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "roles_pkey",
            "type": "PRIMARY KEY",
            "table": "roles",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "roles_slug_key",
            "type": "UNIQUE",
            "table": "roles",
            "columns": [
                "slug"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_1_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_2_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_3_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_4_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_5_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_7_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22070_8_not_null",
            "type": "CHECK",
            "table": "stock_ledger",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "stock_ledger_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_ledger",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_ledger_ref_movement_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_ledger",
            "columns": [
                "ref_movement_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_ledger_ref_order_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_ledger",
            "columns": [
                "ref_order_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_ledger_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_ledger",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_ledger_pkey",
            "type": "PRIMARY KEY",
            "table": "stock_ledger",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22046_1_not_null",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22046_2_not_null",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22046_3_not_null",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22046_5_not_null",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "stock_movement_items_qty_check",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": null,
            "check_definition": "CHECK ((qty > (0)::numeric))"
        },
        {
            "name": "stock_movement_items_qty_check",
            "type": "CHECK",
            "table": "stock_movement_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "stock_movement_items_movement_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_movement_items",
            "columns": [
                "movement_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_movement_items_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_movement_items",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_movement_items_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "stock_movement_items",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "stock_movement_items_pkey",
            "type": "PRIMARY KEY",
            "table": "stock_movement_items",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22036_1_not_null",
            "type": "CHECK",
            "table": "stock_movements",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22036_2_not_null",
            "type": "CHECK",
            "table": "stock_movements",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22036_7_not_null",
            "type": "CHECK",
            "table": "stock_movements",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "stock_movements_pkey",
            "type": "PRIMARY KEY",
            "table": "stock_movements",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_59728_1_not_null",
            "type": "CHECK",
            "table": "suppliers",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59728_2_not_null",
            "type": "CHECK",
            "table": "suppliers",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59728_7_not_null",
            "type": "CHECK",
            "table": "suppliers",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59728_8_not_null",
            "type": "CHECK",
            "table": "suppliers",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59728_9_not_null",
            "type": "CHECK",
            "table": "suppliers",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "suppliers_pkey",
            "type": "PRIMARY KEY",
            "table": "suppliers",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22349_1_not_null",
            "type": "CHECK",
            "table": "user_roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22349_2_not_null",
            "type": "CHECK",
            "table": "user_roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22349_3_not_null",
            "type": "CHECK",
            "table": "user_roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22349_5_not_null",
            "type": "CHECK",
            "table": "user_roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22349_6_not_null",
            "type": "CHECK",
            "table": "user_roles",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "user_roles_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "user_roles",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "user_roles_role_slug_fkey",
            "type": "FOREIGN KEY",
            "table": "user_roles",
            "columns": [
                "role"
            ],
            "check_definition": null
        },
        {
            "name": "user_roles_user_id_fkey",
            "type": "FOREIGN KEY",
            "table": "user_roles",
            "columns": [
                "user_id"
            ],
            "check_definition": null
        },
        {
            "name": "user_roles_pkey",
            "type": "PRIMARY KEY",
            "table": "user_roles",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_11_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_12_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_1_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_2_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_3_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_4_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59786_6_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_qty_units_check",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_qty_units_check",
            "type": "CHECK",
            "table": "warehouse_purchase_items",
            "columns": null,
            "check_definition": "CHECK ((qty_units > (0)::numeric))"
        },
        {
            "name": "warehouse_purchase_items_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_items",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_receipt_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_items",
            "columns": [
                "receipt_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_stock_entry_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_items",
            "columns": [
                "stock_entry_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_items",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_items_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouse_purchase_items",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_10_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_11_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_13_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_14_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_1_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_2_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_3_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_5_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_6_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_8_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59751_9_not_null",
            "type": "CHECK",
            "table": "warehouse_purchase_receipts",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_receipts_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_receipts",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_receipts_supplier_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_receipts",
            "columns": [
                "supplier_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_receipts_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_purchase_receipts",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_purchase_receipts_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouse_purchase_receipts",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_1_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_2_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_3_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_5_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_6_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_8_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_47571_9_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_qty_check",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_qty_check",
            "type": "CHECK",
            "table": "warehouse_stock_entries",
            "columns": null,
            "check_definition": "CHECK ((qty > (0)::numeric))"
        },
        {
            "name": "warehouse_stock_entries_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_source_purchase_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "source_purchase_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_supplier_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "supplier_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entries_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouse_stock_entries",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_59824_1_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entry_events",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59824_2_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entry_events",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59824_3_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entry_events",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_59824_6_not_null",
            "type": "CHECK",
            "table": "warehouse_stock_entry_events",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entry_events_entry_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stock_entry_events",
            "columns": [
                "entry_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stock_entry_events_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouse_stock_entry_events",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_1_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_2_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_3_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_5_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_6_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_8_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_43349_9_not_null",
            "type": "CHECK",
            "table": "warehouse_stocktakes",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stocktakes_product_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stocktakes",
            "columns": [
                "product_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stocktakes_variation_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stocktakes",
            "columns": [
                "variation_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stocktakes_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouse_stocktakes",
            "columns": [
                "warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouse_stocktakes_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouse_stocktakes",
            "columns": [
                "id"
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_1_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_2_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_3_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_4_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_5_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "2200_22005_8_not_null",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouses_kind_check",
            "type": "CHECK",
            "table": "warehouses",
            "columns": null,
            "check_definition": "CHECK ((kind = ANY (ARRAY['main_coldroom'::text, 'child_coldroom'::text, 'selling_depot'::text, 'outlet_warehouse'::text])))"
        },
        {
            "name": "warehouses_kind_check",
            "type": "CHECK",
            "table": "warehouses",
            "columns": [
                null
            ],
            "check_definition": null
        },
        {
            "name": "warehouses_outlet_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouses",
            "columns": [
                "outlet_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouses_parent_warehouse_id_fkey",
            "type": "FOREIGN KEY",
            "table": "warehouses",
            "columns": [
                "parent_warehouse_id"
            ],
            "check_definition": null
        },
        {
            "name": "warehouses_pkey",
            "type": "PRIMARY KEY",
            "table": "warehouses",
            "columns": [
                "id"
            ],
            "check_definition": null
        }
    ],
    "foreign_keys": [
        {
            "name": "damages_product_id_fkey",
            "source_table": "damages",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "damages_source_entry_id_fkey",
            "source_table": "damages",
            "target_table": "warehouse_stock_entries",
            "source_columns": [
                "source_entry_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "damages_variation_id_fkey",
            "source_table": "damages",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "damages_warehouse_id_fkey",
            "source_table": "damages",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_item_allocations_order_id_fkey",
            "source_table": "order_item_allocations",
            "target_table": "orders",
            "source_columns": [
                "order_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_item_allocations_order_item_id_fkey",
            "source_table": "order_item_allocations",
            "target_table": "order_items",
            "source_columns": [
                "order_item_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_item_allocations_warehouse_id_fkey",
            "source_table": "order_item_allocations",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_items_order_id_fkey",
            "source_table": "order_items",
            "target_table": "orders",
            "source_columns": [
                "order_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_items_product_id_fkey",
            "source_table": "order_items",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_items_variation_id_fkey",
            "source_table": "order_items",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "order_items_warehouse_id_fkey",
            "source_table": "order_items",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "orders_outlet_id_fkey",
            "source_table": "orders",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_primary_warehouse_outlet_id_fkey",
            "source_table": "outlet_primary_warehouse",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_primary_warehouse_warehouse_id_fkey",
            "source_table": "outlet_primary_warehouse",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_sequences_outlet_id_fkey",
            "source_table": "outlet_sequences",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stock_balances_outlet_id_fkey",
            "source_table": "outlet_stock_balances",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stock_balances_period_id_fkey",
            "source_table": "outlet_stock_balances",
            "target_table": "outlet_stock_periods",
            "source_columns": [
                "period_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stock_balances_product_id_fkey",
            "source_table": "outlet_stock_balances",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stock_balances_variation_id_fkey",
            "source_table": "outlet_stock_balances",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stock_periods_outlet_id_fkey",
            "source_table": "outlet_stock_periods",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stocktakes_outlet_id_fkey",
            "source_table": "outlet_stocktakes",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stocktakes_period_id_fkey",
            "source_table": "outlet_stocktakes",
            "target_table": "outlet_stock_periods",
            "source_columns": [
                "period_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stocktakes_product_id_fkey",
            "source_table": "outlet_stocktakes",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "outlet_stocktakes_variation_id_fkey",
            "source_table": "outlet_stocktakes",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "pos_sales_outlet_id_fkey",
            "source_table": "pos_sales",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "pos_sales_product_id_fkey",
            "source_table": "pos_sales",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "pos_sales_variation_id_fkey",
            "source_table": "pos_sales",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipe_ingredients_ingredient_product_id_fkey",
            "source_table": "product_recipe_ingredients",
            "target_table": "products",
            "source_columns": [
                "ingredient_product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipe_ingredients_ingredient_variation_id_fkey",
            "source_table": "product_recipe_ingredients",
            "target_table": "product_variations",
            "source_columns": [
                "ingredient_variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipe_ingredients_recipe_id_fkey",
            "source_table": "product_recipe_ingredients",
            "target_table": "product_recipes",
            "source_columns": [
                "recipe_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipe_ingredients_warehouse_id_fkey",
            "source_table": "product_recipe_ingredients",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipes_product_id_fkey",
            "source_table": "product_recipes",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_recipes_variation_id_fkey",
            "source_table": "product_recipes",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_supplier_links_product_id_fkey",
            "source_table": "product_supplier_links",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_supplier_links_supplier_id_fkey",
            "source_table": "product_supplier_links",
            "target_table": "suppliers",
            "source_columns": [
                "supplier_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_supplier_links_variation_id_fkey",
            "source_table": "product_supplier_links",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_supplier_links_warehouse_id_fkey",
            "source_table": "product_supplier_links",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_variations_default_warehouse_id_fkey",
            "source_table": "product_variations",
            "target_table": "warehouses",
            "source_columns": [
                "default_warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "product_variations_product_id_fkey",
            "source_table": "product_variations",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_default_warehouse_id_fkey",
            "source_table": "products",
            "target_table": "warehouses",
            "source_columns": [
                "default_warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_order_id_fkey",
            "source_table": "products_sold",
            "target_table": "orders",
            "source_columns": [
                "order_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_order_item_id_fkey",
            "source_table": "products_sold",
            "target_table": "order_items",
            "source_columns": [
                "order_item_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_outlet_id_fkey",
            "source_table": "products_sold",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_product_id_fkey",
            "source_table": "products_sold",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_variation_id_fkey",
            "source_table": "products_sold",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "products_sold_warehouse_id_fkey",
            "source_table": "products_sold",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_ledger_product_id_fkey",
            "source_table": "stock_ledger",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_ledger_ref_movement_id_fkey",
            "source_table": "stock_ledger",
            "target_table": "stock_movements",
            "source_columns": [
                "ref_movement_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_ledger_ref_order_id_fkey",
            "source_table": "stock_ledger",
            "target_table": "orders",
            "source_columns": [
                "ref_order_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_ledger_variation_id_fkey",
            "source_table": "stock_ledger",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_movement_items_movement_id_fkey",
            "source_table": "stock_movement_items",
            "target_table": "stock_movements",
            "source_columns": [
                "movement_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_movement_items_product_id_fkey",
            "source_table": "stock_movement_items",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "stock_movement_items_variation_id_fkey",
            "source_table": "stock_movement_items",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "user_roles_outlet_id_fkey",
            "source_table": "user_roles",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "user_roles_role_slug_fkey",
            "source_table": "user_roles",
            "target_table": "roles",
            "source_columns": [
                "role"
            ],
            "target_columns": [
                "slug"
            ]
        },
        {
            "name": "warehouse_purchase_items_product_id_fkey",
            "source_table": "warehouse_purchase_items",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_items_receipt_id_fkey",
            "source_table": "warehouse_purchase_items",
            "target_table": "warehouse_purchase_receipts",
            "source_columns": [
                "receipt_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_items_stock_entry_id_fkey",
            "source_table": "warehouse_purchase_items",
            "target_table": "warehouse_stock_entries",
            "source_columns": [
                "stock_entry_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_items_variation_id_fkey",
            "source_table": "warehouse_purchase_items",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_receipts_outlet_id_fkey",
            "source_table": "warehouse_purchase_receipts",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_receipts_supplier_id_fkey",
            "source_table": "warehouse_purchase_receipts",
            "target_table": "suppliers",
            "source_columns": [
                "supplier_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_purchase_receipts_warehouse_id_fkey",
            "source_table": "warehouse_purchase_receipts",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entries_product_id_fkey",
            "source_table": "warehouse_stock_entries",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entries_source_purchase_id_fkey",
            "source_table": "warehouse_stock_entries",
            "target_table": "warehouse_purchase_receipts",
            "source_columns": [
                "source_purchase_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entries_supplier_id_fkey",
            "source_table": "warehouse_stock_entries",
            "target_table": "suppliers",
            "source_columns": [
                "supplier_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entries_variation_id_fkey",
            "source_table": "warehouse_stock_entries",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entries_warehouse_id_fkey",
            "source_table": "warehouse_stock_entries",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stock_entry_events_entry_id_fkey",
            "source_table": "warehouse_stock_entry_events",
            "target_table": "warehouse_stock_entries",
            "source_columns": [
                "entry_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stocktakes_product_id_fkey",
            "source_table": "warehouse_stocktakes",
            "target_table": "products",
            "source_columns": [
                "product_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stocktakes_variation_id_fkey",
            "source_table": "warehouse_stocktakes",
            "target_table": "product_variations",
            "source_columns": [
                "variation_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouse_stocktakes_warehouse_id_fkey",
            "source_table": "warehouse_stocktakes",
            "target_table": "warehouses",
            "source_columns": [
                "warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouses_outlet_id_fkey",
            "source_table": "warehouses",
            "target_table": "outlets",
            "source_columns": [
                "outlet_id"
            ],
            "target_columns": [
                "id"
            ]
        },
        {
            "name": "warehouses_parent_warehouse_id_fkey",
            "source_table": "warehouses",
            "target_table": "warehouses",
            "source_columns": [
                "parent_warehouse_id"
            ],
            "target_columns": [
                "id"
            ]
        }
    ],
    "rls_policies": [
        {
            "roles": [
                "public"
            ],
            "table": "assets",
            "policy": "assets_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE (o.auth_user_id = auth.uid())))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "damages",
            "policy": "damages_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "damages",
            "policy": "damages_insert",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))",
            "using_expression": null
        },
        {
            "roles": [
                "public"
            ],
            "table": "damages",
            "policy": "damages_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_item_allocations",
            "policy": "alloc_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM (orders o\n     JOIN outlets ot ON ((ot.id = o.outlet_id)))\n  WHERE ((o.id = order_item_allocations.order_id) AND (ot.auth_user_id = auth.uid()))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_item_allocations",
            "policy": "alloc_write",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(EXISTS ( SELECT 1\n   FROM (orders o\n     JOIN outlets ot ON ((ot.id = o.outlet_id)))\n  WHERE ((o.id = order_item_allocations.order_id) AND (ot.auth_user_id = auth.uid()))))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_items",
            "policy": "order_items_policy_delete",
            "command": "DELETE",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "is_admin(( SELECT auth.uid() AS uid))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_items",
            "policy": "order_items_policy_insert",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_items",
            "policy": "order_items_policy_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_items",
            "policy": "order_items_policy_update",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "order_items",
            "policy": "order_items_updates_unlocked_only",
            "command": "UPDATE",
            "permissive": "RESTRICTIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_items.order_id) AND ((NOT o.locked) OR is_admin(auth.uid()) OR has_role(auth.uid(), 'supervisor'::text, o.outlet_id)))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "orders",
            "policy": "orders_policy_delete",
            "command": "DELETE",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "is_admin(( SELECT auth.uid() AS uid))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "orders",
            "policy": "orders_policy_insert",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR (outlet_id = ANY (member_outlet_ids(auth.uid()))) OR outlet_auth_user_matches(outlet_id, auth.uid()))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "orders",
            "policy": "orders_policy_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR (outlet_id = ANY (member_outlet_ids(auth.uid()))) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "orders",
            "policy": "orders_policy_update",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(( SELECT auth.uid() AS uid))",
            "using_expression": "is_admin(( SELECT auth.uid() AS uid))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_sequences",
            "policy": "outlet_sequences_outlet_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_stock_balances",
            "policy": "outlet_stock_balances_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_stock_periods",
            "policy": "outlet_stock_periods_manage",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))",
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_stock_periods",
            "policy": "outlet_stock_periods_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_stocktakes",
            "policy": "outlet_stocktakes_manage",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))",
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlet_stocktakes",
            "policy": "outlet_stocktakes_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "outlets",
            "policy": "outlets_self_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "outlet_auth_user_matches(id, auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "pos_sales",
            "policy": "pos_sales_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "pos_sales",
            "policy": "pos_sales_write",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))",
            "using_expression": "(is_admin(auth.uid()) OR outlet_auth_user_matches(outlet_id, auth.uid()))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_recipe_ingredients",
            "policy": "recipe_ingredients_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_recipe_ingredients",
            "policy": "recipe_ingredients_transfer_ro",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_recipes",
            "policy": "product_recipes_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_recipes",
            "policy": "product_recipes_transfer_ro",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_supplier_links",
            "policy": "psl_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_supplier_links",
            "policy": "psl_select_any",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(auth.uid() IS NOT NULL)"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_variations",
            "policy": "product_variations_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "product_variations",
            "policy": "product_variations_outlet_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(((EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE (o.auth_user_id = auth.uid()))) OR has_role_any_outlet(auth.uid(), 'transfers'::text)) AND active)"
        },
        {
            "roles": [
                "public"
            ],
            "table": "products",
            "policy": "products_outlet_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(((EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE (o.auth_user_id = auth.uid()))) OR has_role_any_outlet(auth.uid(), 'transfers'::text)) AND active)"
        },
        {
            "roles": [
                "public"
            ],
            "table": "products_sold",
            "policy": "products_sold_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "products_sold",
            "policy": "products_sold_members_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR order_is_accessible(order_id, auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_ledger",
            "policy": "sl_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(((location_type = 'outlet'::stock_location_type) AND outlet_auth_user_matches(location_id, auth.uid())) OR ((location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_ledger.location_id) AND (o.auth_user_id = auth.uid()))))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movement_items",
            "policy": "smi_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM stock_movements sm\n  WHERE (sm.id = stock_movement_items.movement_id)))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movement_items",
            "policy": "smi_read_tm",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM stock_movements sm\n  WHERE ((sm.id = stock_movement_items.movement_id) AND (is_admin() OR ((sm.source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(sm.source_location_id)) OR ((sm.dest_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(sm.dest_location_id)) OR ((sm.dest_location_type = 'outlet'::stock_location_type) AND tm_for_outlet(sm.dest_location_id))))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movement_items",
            "policy": "smi_write",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(EXISTS ( SELECT 1\n   FROM stock_movements sm\n  WHERE (sm.id = stock_movement_items.movement_id)))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movement_items",
            "policy": "smi_write_tm",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(EXISTS ( SELECT 1\n   FROM stock_movements sm\n  WHERE ((sm.id = stock_movement_items.movement_id) AND (is_admin() OR ((sm.source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(sm.source_location_id))))))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(((source_location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_movements.source_location_id) AND (o.auth_user_id = auth.uid()))))) OR ((dest_location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_movements.dest_location_id) AND (o.auth_user_id = auth.uid()))))) OR ((dest_location_type = 'outlet'::stock_location_type) AND outlet_auth_user_matches(dest_location_id, auth.uid())))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_read_tm",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin() OR ((source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(source_location_id)) OR ((dest_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(dest_location_id)) OR ((dest_location_type = 'outlet'::stock_location_type) AND tm_for_outlet(dest_location_id)))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_update",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "((source_location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_movements.source_location_id) AND (o.auth_user_id = auth.uid())))))",
            "using_expression": "((source_location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_movements.source_location_id) AND (o.auth_user_id = auth.uid())))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_update_tm",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin() OR ((source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(source_location_id)))",
            "using_expression": "(is_admin() OR ((source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(source_location_id)))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_write",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "((source_location_type = 'warehouse'::stock_location_type) AND (EXISTS ( SELECT 1\n   FROM (warehouses w\n     JOIN outlets o ON ((o.id = w.outlet_id)))\n  WHERE ((w.id = stock_movements.source_location_id) AND (o.auth_user_id = auth.uid())))))",
            "using_expression": null
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "stock_movements",
            "policy": "sm_write_tm",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin() OR ((source_location_type = 'warehouse'::stock_location_type) AND tm_for_warehouse(source_location_id)))",
            "using_expression": null
        },
        {
            "roles": [
                "public"
            ],
            "table": "suppliers",
            "policy": "suppliers_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))",
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "user_roles",
            "policy": "user_roles_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(user_id = auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_purchase_items",
            "policy": "wpi_select_access",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (warehouse_purchase_receipts r\n     JOIN warehouses w ON ((w.id = r.warehouse_id)))\n  WHERE ((r.id = warehouse_purchase_items.receipt_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_purchase_items",
            "policy": "wpi_write_access",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (warehouse_purchase_receipts r\n     JOIN warehouses w ON ((w.id = r.warehouse_id)))\n  WHERE ((r.id = warehouse_purchase_items.receipt_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))",
            "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (warehouse_purchase_receipts r\n     JOIN warehouses w ON ((w.id = r.warehouse_id)))\n  WHERE ((r.id = warehouse_purchase_items.receipt_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_purchase_receipts",
            "policy": "wpr_select_access",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM warehouses w\n  WHERE ((w.id = warehouse_purchase_receipts.warehouse_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_purchase_receipts",
            "policy": "wpr_write_access",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM warehouses w\n  WHERE ((w.id = warehouse_purchase_receipts.warehouse_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))",
            "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM warehouses w\n  WHERE ((w.id = warehouse_purchase_receipts.warehouse_id) AND (has_role_any_outlet(auth.uid(), 'transfers'::text, w.outlet_id) OR outlet_auth_user_matches(w.outlet_id, auth.uid()))))))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stock_entries",
            "policy": "wse_select_admin",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stock_entries",
            "policy": "wse_update_admin",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stock_entries",
            "policy": "wse_write_admin",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "((recorded_by = auth.uid()) AND (is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text)))",
            "using_expression": null
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stock_entry_events",
            "policy": "wsee_insert",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))",
            "using_expression": null
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stock_entry_events",
            "policy": "wsee_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stocktakes",
            "policy": "warehouse_stocktakes_admin_rw",
            "command": "ALL",
            "permissive": "PERMISSIVE",
            "check_expression": "is_admin(auth.uid())",
            "using_expression": "is_admin(auth.uid())"
        },
        {
            "roles": [
                "public"
            ],
            "table": "warehouse_stocktakes",
            "policy": "warehouse_stocktakes_select",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(is_admin(auth.uid()) OR has_role_any_outlet(auth.uid(), 'transfers'::text))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "warehouses",
            "policy": "wh_read",
            "command": "SELECT",
            "permissive": "PERMISSIVE",
            "check_expression": null,
            "using_expression": "(EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE ((o.id = warehouses.outlet_id) AND (o.auth_user_id = auth.uid()))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "warehouses",
            "policy": "wh_update",
            "command": "UPDATE",
            "permissive": "PERMISSIVE",
            "check_expression": "(EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE ((o.id = warehouses.outlet_id) AND (o.auth_user_id = auth.uid()))))",
            "using_expression": "(EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE ((o.id = warehouses.outlet_id) AND (o.auth_user_id = auth.uid()))))"
        },
        {
            "roles": [
                "authenticated"
            ],
            "table": "warehouses",
            "policy": "wh_write",
            "command": "INSERT",
            "permissive": "PERMISSIVE",
            "check_expression": "(EXISTS ( SELECT 1\n   FROM outlets o\n  WHERE ((o.id = warehouses.outlet_id) AND (o.auth_user_id = auth.uid()))))",
            "using_expression": null
        }
    ],
    "orphan_sequences": null,
    "materialized_views": null
}