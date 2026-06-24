[
  {
    "schema_export": {
      "views": [
        {
          "view_name": "v_outlet_warehouses",
          "definition": " SELECT o.id AS outlet_id,\n    o.name AS outlet_name,\n    o.code AS outlet_code,\n    w.id AS warehouse_id,\n    w.name AS warehouse_name,\n    w.warehouse_scope,\n    ow.show_in_stocktake\n   FROM ((outlets o\n     JOIN outlet_warehouses ow ON ((ow.outlet_id = o.id)))\n     JOIN warehouses w ON ((w.id = ow.warehouse_id)))\n  WHERE (COALESCE(o.active, true) AND COALESCE(w.active, true));",
          "view_schema": "public"
        }
      ],
      "tables": [
        {
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "table_name": "catalog_menu_groups",
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
          "table_name": "middleware_catalog_schedule",
          "table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
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
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public"
        },
        {
          "table_name": "outlet_sales",
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
          "table_name": "pos_inventory_consumed",
          "table_schema": "public"
        },
        {
          "table_name": "pos_sync_failures",
          "table_schema": "public"
        },
        {
          "table_name": "stg_mintpos_menuitem",
          "table_schema": "public"
        },
        {
          "table_name": "stg_mintpos_modifierflavour",
          "table_schema": "public"
        },
        {
          "table_name": "suppliers",
          "table_schema": "public"
        },
        {
          "table_name": "warehouses",
          "table_schema": "public"
        }
      ],
      "columns": [
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
          "data_type": "uuid",
          "table_name": "catalog_items",
          "column_name": "menu_group_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 36
        },
        {
          "data_type": "uuid",
          "table_name": "catalog_menu_groups",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "catalog_menu_groups",
          "column_name": "name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "integer",
          "table_name": "catalog_menu_groups",
          "column_name": "pos_menu_group_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "boolean",
          "table_name": "catalog_menu_groups",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 4
        },
        {
          "data_type": "integer",
          "table_name": "catalog_menu_groups",
          "column_name": "sort_order",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "0",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_menu_groups",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "catalog_menu_groups",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
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
          "table_name": "middleware_update_drafts",
          "column_name": "id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "gen_random_uuid()",
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "middleware_update_drafts",
          "column_name": "entity_type",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "middleware_update_drafts",
          "column_name": "entity_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "jsonb",
          "table_name": "middleware_update_drafts",
          "column_name": "payload",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "middleware_update_drafts",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "middleware_update_drafts",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
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
          "ordinal_position": 4
        },
        {
          "data_type": "boolean",
          "table_name": "outlet_sales",
          "column_name": "is_production",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 5
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 6
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_sales",
          "column_name": "sold_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "outlet_sales",
          "column_name": "created_by",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "jsonb",
          "table_name": "outlet_sales",
          "column_name": "context",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'{}'::jsonb",
          "ordinal_position": 9
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "outlet_sales",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 10
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "variant_key",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": "'base'::text",
          "ordinal_position": 11
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "sale_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 12
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "vat_exc_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 13
        },
        {
          "data_type": "numeric",
          "table_name": "outlet_sales",
          "column_name": "flavour_price",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 14
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "flavour_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "text",
          "table_name": "outlet_sales",
          "column_name": "modifier_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 16
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
          "data_type": "boolean",
          "table_name": "outlet_warehouses",
          "column_name": "show_in_stocktake",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 3
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
          "table_name": "outlets",
          "column_name": "default_sales_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 15
        },
        {
          "data_type": "uuid",
          "table_name": "outlets",
          "column_name": "default_receiving_warehouse_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 16
        },
        {
          "data_type": "text",
          "table_name": "outlets",
          "column_name": "middleware_sales_api_profile",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 17
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
          "data_type": "bigint",
          "table_name": "stg_mintpos_menuitem",
          "column_name": "menuitem_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "text",
          "table_name": "stg_mintpos_menuitem",
          "column_name": "item_sku",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "stg_mintpos_menuitem",
          "column_name": "item_name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "bigint",
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": "flavour_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 1
        },
        {
          "data_type": "bigint",
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": "menuitem_id",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 2
        },
        {
          "data_type": "text",
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": "variant_name",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 3
        },
        {
          "data_type": "text",
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": "variant_sku",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 4
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
          "ordinal_position": 4
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouses",
          "column_name": "created_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 5
        },
        {
          "data_type": "timestamp with time zone",
          "table_name": "warehouses",
          "column_name": "updated_at",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "now()",
          "ordinal_position": 6
        },
        {
          "data_type": "boolean",
          "table_name": "warehouses",
          "column_name": "active",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "true",
          "ordinal_position": 7
        },
        {
          "data_type": "uuid",
          "table_name": "warehouses",
          "column_name": "outlet_id",
          "is_nullable": "YES",
          "table_schema": "public",
          "column_default": null,
          "ordinal_position": 8
        },
        {
          "data_type": "boolean",
          "table_name": "warehouses",
          "column_name": "auto_open_stock_period",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "false",
          "ordinal_position": 9
        },
        {
          "data_type": "text",
          "table_name": "warehouses",
          "column_name": "warehouse_scope",
          "is_nullable": "NO",
          "table_schema": "public",
          "column_default": "'outlet'::text",
          "ordinal_position": 10
        }
      ],
      "indexes": [
        {
          "indexdef": "CREATE UNIQUE INDEX catalog_items_pkey ON public.catalog_items USING btree (id)",
          "indexname": "catalog_items_pkey",
          "table_name": "catalog_items",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_catalog_items_menu_group_id ON public.catalog_items USING btree (menu_group_id)",
          "indexname": "idx_catalog_items_menu_group_id",
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
          "indexdef": "CREATE UNIQUE INDEX catalog_menu_groups_pkey ON public.catalog_menu_groups USING btree (id)",
          "indexname": "catalog_menu_groups_pkey",
          "table_name": "catalog_menu_groups",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX ux_catalog_menu_groups_name_lower ON public.catalog_menu_groups USING btree (lower(btrim(name)))",
          "indexname": "ux_catalog_menu_groups_name_lower",
          "table_name": "catalog_menu_groups",
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
          "indexdef": "CREATE UNIQUE INDEX middleware_catalog_schedule_pkey ON public.middleware_catalog_schedule USING btree (id)",
          "indexname": "middleware_catalog_schedule_pkey",
          "table_name": "middleware_catalog_schedule",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX middleware_update_drafts_entity_type_entity_id_key ON public.middleware_update_drafts USING btree (entity_type, entity_id)",
          "indexname": "middleware_update_drafts_entity_type_entity_id_key",
          "table_name": "middleware_update_drafts",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX middleware_update_drafts_pkey ON public.middleware_update_drafts USING btree (id)",
          "indexname": "middleware_update_drafts_pkey",
          "table_name": "middleware_update_drafts",
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
          "indexdef": "CREATE UNIQUE INDEX outlet_pos_heartbeats_pkey ON public.outlet_pos_heartbeats USING btree (outlet_id)",
          "indexname": "outlet_pos_heartbeats_pkey",
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_sales_outlet ON public.outlet_sales USING btree (outlet_id, sold_at DESC)",
          "indexname": "idx_outlet_sales_outlet",
          "table_name": "outlet_sales",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_outlet_sales_source_event ON public.outlet_sales USING btree (((context ->> 'source_event_id'::text)))",
          "indexname": "idx_outlet_sales_source_event",
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
          "indexdef": "CREATE INDEX idx_outlet_warehouses_warehouse ON public.outlet_warehouses USING btree (warehouse_id)",
          "indexname": "idx_outlet_warehouses_warehouse",
          "table_name": "outlet_warehouses",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE UNIQUE INDEX outlet_warehouses_pkey ON public.outlet_warehouses USING btree (outlet_id, warehouse_id)",
          "indexname": "outlet_warehouses_pkey",
          "table_name": "outlet_warehouses",
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
          "indexdef": "CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)",
          "indexname": "suppliers_pkey",
          "table_name": "suppliers",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_warehouses_outlet_id ON public.warehouses USING btree (outlet_id)",
          "indexname": "idx_warehouses_outlet_id",
          "table_name": "warehouses",
          "table_schema": "public"
        },
        {
          "indexdef": "CREATE INDEX idx_warehouses_scope ON public.warehouses USING btree (warehouse_scope)",
          "indexname": "idx_warehouses_scope",
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
            "authenticated"
          ],
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "outlet_sales",
          "policy_name": "outlet_sales_authenticated_select",
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
          "command": "SELECT",
          "permissive": "PERMISSIVE",
          "table_name": "suppliers",
          "policy_name": "suppliers_authenticated_select",
          "table_schema": "public",
          "using_expression": "true",
          "with_check_expression": null
        }
      ],
      "triggers": [
        {
          "table_name": "catalog_variants",
          "trigger_def": "CREATE TRIGGER trg_refresh_catalog_has_variations AFTER INSERT OR DELETE OR UPDATE ON catalog_variants FOR EACH ROW EXECUTE FUNCTION refresh_catalog_has_variations_trigger()",
          "table_schema": "public",
          "trigger_name": "trg_refresh_catalog_has_variations"
        },
        {
          "table_name": "order_items",
          "trigger_def": "CREATE TRIGGER trg_order_items_lock BEFORE INSERT OR DELETE OR UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION assert_order_item_editable()",
          "table_schema": "public",
          "trigger_name": "trg_order_items_lock"
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
          "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
          "definition": "CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_order public.orders%rowtype;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to complete order %', p_order_id;\r\n  END IF;\r\n\r\n  IF v_order.source_event_id IS NOT NULL THEN\r\n    RAISE EXCEPTION 'not a warehouse app order';\r\n  END IF;\r\n\r\n  IF lower(COALESCE(v_order.status, '')) <> 'loaded' THEN\r\n    RAISE EXCEPTION 'order must be loaded before complete (current: %)', v_order.status;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'completed',\r\n      locked = true,\r\n      delivery_driver_name = COALESCE(NULLIF(p_driver_name, ''), delivery_driver_name),\r\n      delivery_driver_signature_path = NULLIF(p_signature_path, ''),\r\n      delivery_driver_signed_at = now(),\r\n      offloader_signed_name = COALESCE(NULLIF(p_driver_name, ''), offloader_signed_name),\r\n      offloader_signature_path = COALESCE(NULLIF(p_signature_path, ''), offloader_signature_path),\r\n      offloader_signed_at = now(),\r\n      completed_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), completed_pdf_path),\r\n      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),\r\n      offloaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), offloaded_pdf_path),\r\n      completed_at = now(),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
          "function_name": "complete_order",
          "function_schema": "public"
        },
        {
          "arguments": "p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[]",
          "definition": "CREATE OR REPLACE FUNCTION public.console_locked_warehouses(p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[])\n RETURNS TABLE(id uuid, name text, parent_warehouse_id uuid, kind text, active boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  ids uuid[] := array(select distinct unnest(coalesce(p_locked_ids, array[]::uuid[])));\r\nbegin\r\n  return query\r\n  select\r\n    w.id,\r\n    w.name,\r\n    w.parent_warehouse_id,\r\n    w.warehouse_scope::text as kind,\r\n    w.active\r\n  from public.warehouses w\r\n  where p_include_inactive\r\n     or w.active\r\n     or (array_length(ids, 1) is not null and w.id = any (ids));\r\nend;\r\n$function$\n",
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
          "arguments": "",
          "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids()\n RETURNS SETOF uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));\r\n$function$\n",
          "function_name": "member_outlet_ids",
          "function_schema": "public"
        },
        {
          "arguments": "p_user_id uuid",
          "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT COALESCE(\r\n    CASE\r\n      WHEN p_user_id IS NULL THEN NULL\r\n      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)\r\n      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)\r\n    END,\r\n    '{}'\r\n  );\r\n$function$\n",
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
          "definition": "CREATE OR REPLACE FUNCTION public.sync_opening_stock_to_ledger()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_item_id uuid;\r\n  v_variant text;\r\n  v_period_id uuid;\r\n  v_warehouse_id uuid;\r\n  v_desired numeric := 0;\r\n  v_current numeric := 0;\r\n  v_delta numeric := 0;\r\n  v_kind text;\r\nbegin\r\n  if tg_op = 'DELETE' then\r\n    return old;\r\n  end if;\r\n\r\n  v_kind := lower(coalesce(new.kind, ''));\r\n  if v_kind not in ('opening', 'closing') then\r\n    return new;\r\n  end if;\r\n\r\n  v_item_id := new.item_id;\r\n  v_variant := public.normalize_variant_key(new.variant_key);\r\n  v_period_id := new.period_id;\r\n  v_desired := coalesce(new.counted_qty, 0);\r\n\r\n  select wsp.warehouse_id\r\n    into v_warehouse_id\r\n  from public.warehouse_stock_periods wsp\r\n  where wsp.id = v_period_id\r\n  limit 1;\r\n\r\n  if v_warehouse_id is null then\r\n    return new;\r\n  end if;\r\n\r\n  select coalesce(sum(sl.delta_units), 0)\r\n    into v_current\r\n  from public.stock_ledger sl\r\n  where sl.location_type = 'warehouse'\r\n    and sl.warehouse_id = v_warehouse_id\r\n    and sl.item_id = v_item_id\r\n    and public.normalize_variant_key(sl.variant_key) = v_variant;\r\n\r\n  v_delta := v_desired - coalesce(v_current, 0);\r\n  if v_delta = 0 then\r\n    return new;\r\n  end if;\r\n\r\n  insert into public.stock_ledger(\r\n    location_type,\r\n    warehouse_id,\r\n    item_id,\r\n    variant_key,\r\n    delta_units,\r\n    reason,\r\n    context,\r\n    occurred_at\r\n  ) values (\r\n    'warehouse',\r\n    v_warehouse_id,\r\n    v_item_id,\r\n    v_variant,\r\n    v_delta,\r\n    'opening_stock',\r\n    jsonb_build_object('period_id', v_period_id::text, 'source', 'stock_count', 'kind', v_kind),\r\n    now()\r\n  );\r\n\r\n  return new;\r\nend;\r\n$function$\n",
          "function_name": "sync_opening_stock_to_ledger",
          "function_schema": "public"
        },
        {
          "arguments": "p_rows jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_pos_catalog_from_middleware(p_rows jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_items_updated int := 0;\r\n  v_variants_updated int := 0;\r\nbegin\r\n  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then\r\n    raise exception 'p_rows must be a JSON array';\r\n  end if;\r\n\r\n  with src as (\r\n    select\r\n      nullif(trim(item_sku), '') as item_sku,\r\n      nullif(trim(item_name), '') as item_name,\r\n      nullif(trim(variant_name), '') as variant_name,\r\n      nullif(trim(variant_sku), '') as variant_sku\r\n    from jsonb_to_recordset(p_rows) as r(\r\n      item_sku text,\r\n      item_name text,\r\n      variant_name text,\r\n      variant_sku text\r\n    )\r\n  ),\r\n  upd as (\r\n    update public.catalog_items ci\r\n    set\r\n      name = coalesce(src.item_name, ci.name),\r\n      updated_at = now()\r\n    from src\r\n    where ci.item_kind = 'finished'\r\n      and ci.sku = src.item_sku\r\n      and src.item_sku is not null\r\n      and src.item_name is not null\r\n    returning 1\r\n  )\r\n  select count(*) into v_items_updated from upd;\r\n\r\n  with src as (\r\n    select\r\n      nullif(trim(item_sku), '') as item_sku,\r\n      nullif(trim(variant_name), '') as variant_name,\r\n      nullif(trim(variant_sku), '') as variant_sku\r\n    from jsonb_to_recordset(p_rows) as r(\r\n      item_sku text,\r\n      item_name text,\r\n      variant_name text,\r\n      variant_sku text\r\n    )\r\n  ),\r\n  upd as (\r\n    update public.catalog_variants cv\r\n    set\r\n      name = src.variant_name,\r\n      sku = coalesce(src.variant_sku, cv.sku),\r\n      updated_at = now()\r\n    from src, public.catalog_items ci\r\n    where ci.item_kind = 'finished'\r\n      and cv.item_id = ci.id\r\n      and ci.sku = src.item_sku\r\n      and src.item_sku is not null\r\n      and src.variant_name is not null\r\n      and lower(trim(cv.name)) = lower(trim(src.variant_name))\r\n    returning 1\r\n  )\r\n  select count(*) into v_variants_updated from upd;\r\n\r\n  return jsonb_build_object(\r\n    'ok', true,\r\n    'items_updated', v_items_updated,\r\n    'variants_updated', v_variants_updated\r\n  );\r\nend;\r\n$function$\n",
          "function_name": "sync_pos_catalog_from_middleware",
          "function_schema": "public"
        },
        {
          "arguments": "p_rows jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_pos_menu_groups_from_middleware(p_rows jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_groups_upserted int := 0;\r\n  v_items_linked int := 0;\r\nbegin\r\n  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then\r\n    raise exception 'p_rows must be a JSON array';\r\n  end if;\r\n\r\n  with src as (\r\n    select distinct\r\n      nullif(trim(grp_row ->> 'group_name'), '') as group_name,\r\n      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id\r\n    from jsonb_array_elements(p_rows) as grp_row\r\n    where nullif(trim(grp_row ->> 'group_name'), '') is not null\r\n  ),\r\n  updated as (\r\n    update public.catalog_menu_groups g\r\n    set\r\n      pos_menu_group_id = coalesce(src.pos_menu_group_id, g.pos_menu_group_id),\r\n      updated_at = now()\r\n    from src\r\n    where lower(trim(g.name)) = lower(trim(src.group_name))\r\n    returning g.id\r\n  ),\r\n  inserted as (\r\n    insert into public.catalog_menu_groups (name, pos_menu_group_id, updated_at)\r\n    select src.group_name, src.pos_menu_group_id, now()\r\n    from src\r\n    where not exists (\r\n      select 1\r\n      from public.catalog_menu_groups g\r\n      where lower(trim(g.name)) = lower(trim(src.group_name))\r\n    )\r\n    returning id\r\n  )\r\n  select (select count(*) from updated) + (select count(*) from inserted) into v_groups_upserted;\r\n\r\n  with src as (\r\n    select\r\n      nullif(trim(grp_row ->> 'item_sku'), '') as item_sku,\r\n      nullif(trim(grp_row ->> 'group_name'), '') as group_name,\r\n      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id\r\n    from jsonb_array_elements(p_rows) as grp_row\r\n  ),\r\n  grp as (\r\n    select\r\n      src.item_sku,\r\n      coalesce(\r\n        g_by_id.id,\r\n        g_by_name.id\r\n      ) as menu_group_id\r\n    from src\r\n    left join public.catalog_menu_groups g_by_id\r\n      on g_by_id.pos_menu_group_id = src.pos_menu_group_id\r\n    left join public.catalog_menu_groups g_by_name\r\n      on lower(trim(g_by_name.name)) = lower(trim(src.group_name))\r\n    where src.item_sku is not null\r\n      and (src.group_name is not null or src.pos_menu_group_id is not null)\r\n  ),\r\n  upd as (\r\n    update public.catalog_items ci\r\n    set\r\n      menu_group_id = grp.menu_group_id,\r\n      updated_at = now()\r\n    from grp\r\n    where ci.item_kind = 'finished'\r\n      and ci.sku = grp.item_sku\r\n      and grp.menu_group_id is not null\r\n    returning 1\r\n  )\r\n  select count(*) into v_items_linked from upd;\r\n\r\n  return jsonb_build_object(\r\n    'ok', true,\r\n    'groups_upserted', v_groups_upserted,\r\n    'items_linked', v_items_linked\r\n  );\r\nend;\r\n$function$\n",
          "function_name": "sync_pos_menu_groups_from_middleware",
          "function_schema": "public"
        },
        {
          "arguments": "payload jsonb",
          "definition": "CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_outlet uuid := (payload->>'outlet_id')::uuid;\r\n  v_source text := payload->>'source_event_id';\r\n  v_order_id uuid;\r\n  v_item jsonb;\r\n  v_resolved record;\r\n  v_qty numeric;\r\n  v_qty_text text;\r\n  v_branch integer := nullif(payload->>'branch_id', '')::integer;\r\n  v_outlet_name text;\r\n  v_item_sku text;\r\n  v_variant_sku text;\r\n  v_ctx jsonb;\r\n  v_sold_at timestamptz;\r\nbegin\r\n  if v_outlet is null or v_source is null then\r\n    raise exception 'outlet_id and source_event_id are required';\r\n  end if;\r\n\r\n  select id into v_order_id from public.orders where source_event_id = v_source;\r\n  if found then return; end if;\r\n\r\n  v_sold_at := coalesce(nullif(payload->>'occurred_at', '')::timestamptz, now());\r\n  select name into v_outlet_name from public.outlets where id = v_outlet;\r\n\r\n  insert into public.orders (\r\n    outlet_id, source_event_id, pos_sale_id, status, locked, branch_id, pos_branch_id,\r\n    order_type, bill_type, total_discount, total_discount_amount, total_gst,\r\n    service_charges, delivery_charges, tip, pos_fee, price_type,\r\n    customer_name, customer_phone, customer_email, raw_payload\r\n  )\r\n  values (\r\n    v_outlet, v_source, nullif(payload->>'sale_id', ''),\r\n    'synced', true, v_branch, v_branch,\r\n    payload->>'order_type', payload->>'bill_type',\r\n    nullif(payload->>'total_discount', '')::numeric,\r\n    nullif(payload->>'total_discount_amount', '')::numeric,\r\n    nullif(payload->>'total_gst', '')::numeric,\r\n    nullif(payload->>'service_charges', '')::numeric,\r\n    nullif(payload->>'delivery_charges', '')::numeric,\r\n    nullif(payload->>'tip', '')::numeric,\r\n    nullif(payload->>'pos_fee', '')::numeric,\r\n    payload->>'price_type',\r\n    payload->'customer'->>'name',\r\n    payload->'customer'->>'phone',\r\n    payload->'customer'->>'email',\r\n    payload\r\n  )\r\n  returning id into v_order_id;\r\n\r\n  for v_item in select * from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))\r\n  loop\r\n    v_item_sku := nullif(trim(coalesce(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');\r\n    v_variant_sku := nullif(trim(coalesce(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');\r\n    if v_item_sku is null then continue; end if;\r\n\r\n    select * into v_resolved from public.resolve_catalog_by_sku(v_item_sku, v_variant_sku) limit 1;\r\n    if not found then continue; end if;\r\n\r\n    v_qty_text := nullif(v_item->>'quantity', '');\r\n    v_qty := coalesce(v_qty_text::numeric, 0);\r\n    if v_qty <= 0 then continue; end if;\r\n\r\n    v_ctx := jsonb_build_object(\r\n      'outlet_name', v_outlet_name,\r\n      'outlet_id', v_outlet,\r\n      'catalog_item_id', v_resolved.catalog_item_id,\r\n      'catalog_item_name', v_resolved.catalog_item_name,\r\n      'catalog_item_sku', v_resolved.catalog_item_sku,\r\n      'variant_key', v_resolved.variant_key,\r\n      'variant_name', v_resolved.variant_name,\r\n      'variant_sku', v_resolved.variant_sku,\r\n      'pos_item_id', v_item->>'pos_item_id',\r\n      'source_event_id', v_source,\r\n      'order_id', v_order_id\r\n    );\r\n\r\n    insert into public.outlet_sales (\r\n      outlet_id, item_id, qty_units, variant_key, sold_at, sale_price,\r\n      vat_exc_price, flavour_price, flavour_id, context\r\n    )\r\n    values (\r\n      v_outlet, v_resolved.catalog_item_id, v_qty, v_resolved.variant_key, v_sold_at,\r\n      nullif(v_item->>'sale_price', '')::numeric,\r\n      nullif(v_item->>'vat_exc_price', '')::numeric,\r\n      nullif(v_item->>'flavour_price', '')::numeric,\r\n      v_item->>'flavour_id',\r\n      v_ctx\r\n    );\r\n  end loop;\r\nend;\r\n$function$\n",
          "function_name": "sync_pos_order",
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
        }
      ],
      "constraints": [
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
          "column_name": "menu_group_id",
          "table_schema": "public",
          "constraint_name": "catalog_items_menu_group_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "catalog_menu_groups",
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
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155903_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "catalog_menu_groups",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "catalog_menu_groups_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "catalog_menu_groups",
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
          "foreign_column_name": "id",
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
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155922_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_entity_type_check",
          "constraint_type": "CHECK",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "entity_type",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": "id",
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_pkey",
          "constraint_type": "PRIMARY KEY",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": "entity_type",
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_entity_type_entity_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "entity_type",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": "entity_type",
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_entity_type_entity_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "entity_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": "entity_id",
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_entity_type_entity_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "entity_id",
          "foreign_table_schema": "public"
        },
        {
          "table_name": "middleware_update_drafts",
          "column_name": "entity_id",
          "table_schema": "public",
          "constraint_name": "middleware_update_drafts_entity_type_entity_id_key",
          "constraint_type": "UNIQUE",
          "foreign_table_name": "middleware_update_drafts",
          "foreign_column_name": "entity_type",
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
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_4_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_sales",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156557_9_not_null",
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
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156616_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156616_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "outlet_warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156616_3_not_null",
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
          "foreign_column_name": "outlet_id",
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
          "column_name": "warehouse_id",
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
          "column_name": "default_receiving_warehouse_id",
          "table_schema": "public",
          "constraint_name": "outlets_default_receiving_warehouse_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "warehouses",
          "foreign_column_name": "id",
          "foreign_table_schema": "public"
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
          "table_name": "stg_mintpos_menuitem",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155734_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stg_mintpos_menuitem",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155734_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stg_mintpos_menuitem",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155734_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155739_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155739_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "stg_mintpos_modifierflavour",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_155739_3_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156658_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156658_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156658_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156658_8_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "suppliers",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156658_9_not_null",
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
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_10_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_1_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_2_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_5_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_6_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_7_not_null",
          "constraint_type": "CHECK",
          "foreign_table_name": null,
          "foreign_column_name": null,
          "foreign_table_schema": null
        },
        {
          "table_name": "warehouses",
          "column_name": null,
          "table_schema": "public",
          "constraint_name": "2200_156590_9_not_null",
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
          "column_name": "outlet_id",
          "table_schema": "public",
          "constraint_name": "warehouses_outlet_id_fkey",
          "constraint_type": "FOREIGN KEY",
          "foreign_table_name": "outlets",
          "foreign_column_name": "id",
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
          "constraint_def": "FOREIGN KEY (menu_group_id) REFERENCES catalog_menu_groups(id) ON DELETE SET NULL",
          "constraint_name": "catalog_items_menu_group_id_fkey"
        },
        {
          "table_name": "catalog_variants",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
          "constraint_name": "catalog_variants_item_id_fkey"
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
          "table_name": "outlet_pos_heartbeats",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
          "constraint_name": "outlet_pos_heartbeats_outlet_id_fkey"
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
          "constraint_def": "FOREIGN KEY (default_receiving_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "outlets_default_receiving_warehouse_id_fkey"
        },
        {
          "table_name": "outlets",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (default_sales_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
          "constraint_name": "outlets_default_sales_warehouse_id_fkey"
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
          "table_name": "warehouses",
          "table_schema": "public",
          "constraint_def": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL",
          "constraint_name": "warehouses_outlet_id_fkey"
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