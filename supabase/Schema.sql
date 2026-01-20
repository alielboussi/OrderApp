{
    "views": [
        {
            "view_name": "outlet_stock_summary",
            "definition": " SELECT osb.outlet_id,\n    osb.item_id,\n    ci.name AS item_name,\n    osb.variant_key,\n    osb.sent_units,\n    osb.consumed_units,\n    osb.on_hand_units\n   FROM outlet_stock_balances osb\n     LEFT JOIN catalog_items ci ON ci.id = osb.item_id;"
        },
        {
            "view_name": "warehouse_layer_stock",
            "definition": " SELECT w.id AS warehouse_id,\n    w.stock_layer,\n    sl.item_id,\n    ci.name AS item_name,\n    sl.variant_key,\n    sum(sl.delta_units) AS net_units\n   FROM stock_ledger sl\n     JOIN warehouses w ON w.id = sl.warehouse_id\n     LEFT JOIN catalog_items ci ON ci.id = sl.item_id\n  WHERE sl.location_type = 'warehouse'::text\n  GROUP BY w.id, w.stock_layer, sl.item_id, ci.name, sl.variant_key;"
        },
        {
            "view_name": "warehouse_stock_items",
            "definition": " WITH base AS (\n         SELECT w.id AS warehouse_id,\n            ci.id AS item_id,\n            ci.name AS item_name,\n            COALESCE(normalize_variant_key(sl.variant_key), 'base'::text) AS variant_key,\n            sum(sl.delta_units) AS net_units,\n            ci.cost AS unit_cost,\n            ci.item_kind,\n            ci.image_url\n           FROM stock_ledger sl\n             JOIN warehouses w ON w.id = sl.warehouse_id\n             JOIN catalog_items ci ON ci.id = sl.item_id\n          WHERE sl.location_type = 'warehouse'::text\n          GROUP BY w.id, ci.id, ci.name, ci.cost, ci.item_kind, ci.image_url, (normalize_variant_key(sl.variant_key))\n        )\n SELECT warehouse_id,\n    item_id,\n    item_name,\n    variant_key,\n    net_units,\n    unit_cost,\n    item_kind,\n    image_url\n   FROM base b;"
        },
        {
            "view_name": "warehouse_stock_variances",
            "definition": " WITH opening AS (\n         SELECT warehouse_stock_counts.period_id,\n            warehouse_stock_counts.item_id,\n            normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,\n            max(warehouse_stock_counts.counted_qty) AS opening_qty\n           FROM warehouse_stock_counts\n          WHERE warehouse_stock_counts.kind = 'opening'::text\n          GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, (normalize_variant_key(warehouse_stock_counts.variant_key))\n        ), closing AS (\n         SELECT warehouse_stock_counts.period_id,\n            warehouse_stock_counts.item_id,\n            normalize_variant_key(warehouse_stock_counts.variant_key) AS variant_key,\n            max(warehouse_stock_counts.counted_qty) AS closing_qty\n           FROM warehouse_stock_counts\n          WHERE warehouse_stock_counts.kind = 'closing'::text\n          GROUP BY warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, (normalize_variant_key(warehouse_stock_counts.variant_key))\n        ), movement AS (\n         SELECT wsp_1.id AS period_id,\n            sl.item_id,\n            normalize_variant_key(sl.variant_key) AS variant_key,\n            sum(sl.delta_units) AS movement_qty\n           FROM warehouse_stock_periods wsp_1\n             LEFT JOIN stock_ledger sl ON sl.warehouse_id = wsp_1.warehouse_id AND sl.location_type = 'warehouse'::text AND sl.item_id IS NOT NULL AND sl.occurred_at >= wsp_1.opened_at AND (wsp_1.closed_at IS NULL OR sl.occurred_at <= COALESCE(wsp_1.closed_at, now()))\n          GROUP BY wsp_1.id, sl.item_id, (normalize_variant_key(sl.variant_key))\n        ), keys AS (\n         SELECT opening.period_id,\n            opening.item_id,\n            opening.variant_key\n           FROM opening\n        UNION\n         SELECT closing.period_id,\n            closing.item_id,\n            closing.variant_key\n           FROM closing\n        UNION\n         SELECT movement.period_id,\n            movement.item_id,\n            movement.variant_key\n           FROM movement\n        )\n SELECT k.period_id,\n    wsp.warehouse_id,\n    wsp.outlet_id,\n    k.item_id,\n    k.variant_key,\n    COALESCE(o.opening_qty, 0::numeric) AS opening_qty,\n    COALESCE(m.movement_qty, 0::numeric) AS movement_qty,\n    COALESCE(c.closing_qty, 0::numeric) AS closing_qty,\n    COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric) AS expected_qty,\n    COALESCE(c.closing_qty, 0::numeric) - (COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric)) AS variance_qty,\n    ci.name AS item_name,\n    COALESCE(ci.cost, 0::numeric) AS unit_cost,\n    (COALESCE(c.closing_qty, 0::numeric) - (COALESCE(o.opening_qty, 0::numeric) + COALESCE(m.movement_qty, 0::numeric))) * COALESCE(ci.cost, 0::numeric) AS variance_cost\n   FROM keys k\n     JOIN warehouse_stock_periods wsp ON wsp.id = k.period_id\n     LEFT JOIN opening o ON o.period_id = k.period_id AND o.item_id = k.item_id AND o.variant_key = k.variant_key\n     LEFT JOIN closing c ON c.period_id = k.period_id AND c.item_id = k.item_id AND c.variant_key = k.variant_key\n     LEFT JOIN movement m ON m.period_id = k.period_id AND m.item_id = k.item_id AND m.variant_key = k.variant_key\n     LEFT JOIN catalog_items ci ON ci.id = k.item_id;"
        }
    ],
    "tables": [
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "name",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "sku",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "USER-DEFINED",
                    "column_name": "item_kind",
                    "is_nullable": "NO"
                },
                {
                    "default": "'each'::qty_unit",
                    "data_type": "USER-DEFINED",
                    "column_name": "base_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": "1",
                    "data_type": "numeric",
                    "column_name": "units_per_purchase_pack",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "consumption_uom",
                    "is_nullable": "NO"
                },
                {
                    "default": "0",
                    "data_type": "numeric",
                    "column_name": "cost",
                    "is_nullable": "NO"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "has_variations",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "image_url",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "default_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "purchase_pack_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "purchase_unit_mass",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "USER-DEFINED",
                    "column_name": "purchase_unit_mass_uom",
                    "is_nullable": "YES"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "transfer_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": "1",
                    "data_type": "numeric",
                    "column_name": "transfer_quantity",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "outlet_order_visible",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "locked_from_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "'[]'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "variants",
                    "is_nullable": "YES"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "has_recipe",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "consumption_unit_mass",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "consumption_unit_mass_uom",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "consumption_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "consumption_qty_per_base",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "storage_unit",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "storage_weight",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX catalog_items_pkey ON public.catalog_items USING btree (id)",
                    "index_name": "catalog_items_pkey"
                },
                {
                    "definition": "CREATE INDEX idx_catalog_items_locked_from ON public.catalog_items USING btree (locked_from_warehouse_id)",
                    "index_name": "idx_catalog_items_locked_from"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_catalog_items_name_unique ON public.catalog_items USING btree (lower(name))",
                    "index_name": "idx_catalog_items_name_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_catalog_items_sku_unique ON public.catalog_items USING btree (lower(sku)) WHERE (sku IS NOT NULL)",
                    "index_name": "idx_catalog_items_sku_unique"
                }
            ],
            "table_name": "catalog_items",
            "constraints": [
                {
                    "definition": "CHECK (consumption_qty_per_base IS NULL OR consumption_qty_per_base > 0::numeric)",
                    "constraint_name": "catalog_items_consumption_qty_positive",
                    "constraint_type": "c"
                },
                {
                    "definition": "CHECK (cost >= 0::numeric)",
                    "constraint_name": "catalog_items_cost_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "catalog_items_default_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (locked_from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "catalog_items_locked_from_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (units_per_purchase_pack > 0::numeric)",
                    "constraint_name": "catalog_items_package_contains_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "catalog_items_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0::numeric)",
                    "constraint_name": "catalog_items_purchase_unit_mass_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "CHECK (transfer_quantity > 0::numeric)",
                    "constraint_name": "catalog_items_transfer_quantity_check",
                    "constraint_type": "c"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "counter_key",
                    "is_nullable": "NO"
                },
                {
                    "default": "'00000000-0000-0000-0000-000000000000'::uuid",
                    "data_type": "uuid",
                    "column_name": "scope_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "0",
                    "data_type": "bigint",
                    "column_name": "last_value",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX counter_values_pkey ON public.counter_values USING btree (counter_key, scope_id)",
                    "index_name": "counter_values_pkey"
                }
            ],
            "table_name": "counter_values",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (counter_key, scope_id)",
                    "constraint_name": "counter_values_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "from_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "to_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "transfer_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "transfer_quantity",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_item_transfer_profile_from ON public.item_transfer_profiles USING btree (from_warehouse_id)",
                    "index_name": "idx_item_transfer_profile_from"
                },
                {
                    "definition": "CREATE INDEX idx_item_transfer_profile_to ON public.item_transfer_profiles USING btree (to_warehouse_id)",
                    "index_name": "idx_item_transfer_profile_to"
                },
                {
                    "definition": "CREATE UNIQUE INDEX item_transfer_profiles_pkey ON public.item_transfer_profiles USING btree (id)",
                    "index_name": "item_transfer_profiles_pkey"
                }
            ],
            "table_name": "item_transfer_profiles",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "item_transfer_profiles_from_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "item_transfer_profiles_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "item_transfer_profiles_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "item_transfer_profiles_to_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (transfer_quantity > 0::numeric)",
                    "constraint_name": "item_transfer_profiles_transfer_quantity_check",
                    "constraint_type": "c"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "deduction_uom",
                    "is_nullable": "NO"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "recipe_source",
                    "is_nullable": "NO"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "damage_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_item_warehouse_policy_deduction_unit ON public.item_warehouse_handling_policies USING btree (deduction_uom)",
                    "index_name": "idx_item_warehouse_policy_deduction_unit"
                },
                {
                    "definition": "CREATE UNIQUE INDEX item_warehouse_handling_policies_pkey ON public.item_warehouse_handling_policies USING btree (id)",
                    "index_name": "item_warehouse_handling_policies_pkey"
                }
            ],
            "table_name": "item_warehouse_handling_policies",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "item_warehouse_handling_policies_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "item_warehouse_handling_policies_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "item_warehouse_handling_policies_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "order_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "product_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "name",
                    "is_nullable": "YES"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "consumption_uom",
                    "is_nullable": "NO"
                },
                {
                    "default": "0",
                    "data_type": "numeric",
                    "column_name": "cost",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "receiving_contains",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_cases",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "amount",
                    "is_nullable": "YES"
                },
                {
                    "default": "'each'::text",
                    "data_type": "text",
                    "column_name": "receiving_uom",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variation_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id)",
                    "index_name": "idx_order_items_order"
                },
                {
                    "definition": "CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)",
                    "index_name": "order_items_pkey"
                }
            ],
            "table_name": "order_items",
            "constraints": [
                {
                    "definition": "CHECK (cost >= 0::numeric)",
                    "constraint_name": "order_items_cost_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE",
                    "constraint_name": "order_items_order_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "order_items_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (product_id) REFERENCES catalog_items(id) ON DELETE RESTRICT",
                    "constraint_name": "order_items_product_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (qty > 0::numeric)",
                    "constraint_name": "order_items_qty_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "order_items_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'draft'::text",
                    "data_type": "text",
                    "column_name": "status",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "approved_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "approved_by",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "created_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "order_number",
                    "is_nullable": "YES"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "locked",
                    "is_nullable": "NO"
                },
                {
                    "default": "'UTC'::text",
                    "data_type": "text",
                    "column_name": "tz",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "pdf_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "approved_pdf_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "loaded_pdf_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "offloaded_pdf_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "employee_signed_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "employee_signature_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "employee_signed_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "supervisor_signed_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "supervisor_signature_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "supervisor_signed_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "driver_signed_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "driver_signature_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "driver_signed_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "offloader_signed_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "offloader_signature_path",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "offloader_signed_at",
                    "is_nullable": "YES"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "modified_by_supervisor",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "modified_by_supervisor_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "source_event_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "integer",
                    "column_name": "branch_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "order_type",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "bill_type",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "total_discount",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "total_discount_amount",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "total_gst",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "service_charges",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "delivery_charges",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "tip",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "pos_fee",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "price_type",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "customer_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "customer_phone",
                    "is_nullable": "YES"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "raw_payload",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "jsonb",
                    "column_name": "payments",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "integer",
                    "column_name": "pos_branch_id",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_orders_outlet ON public.orders USING btree (outlet_id, status)",
                    "index_name": "idx_orders_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)",
                    "index_name": "orders_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_orders_order_number ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL)",
                    "index_name": "ux_orders_order_number"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_orders_source_event ON public.orders USING btree (source_event_id) WHERE (source_event_id IS NOT NULL)",
                    "index_name": "ux_orders_source_event"
                }
            ],
            "table_name": "orders",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "orders_approved_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "orders_created_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT",
                    "constraint_name": "orders_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "orders_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "target_outlet_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "boolean",
                    "column_name": "deduct_enabled",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "normalized_variant_key",
                    "is_nullable": "NO"
                },
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX idx_outlet_item_routes_global_unique ON public.outlet_item_routes USING btree (item_id, normalized_variant_key) WHERE (outlet_id IS NULL)",
                    "index_name": "idx_outlet_item_routes_global_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_outlet_item_routes_local_unique ON public.outlet_item_routes USING btree (outlet_id, item_id, normalized_variant_key) WHERE (outlet_id IS NOT NULL)",
                    "index_name": "idx_outlet_item_routes_local_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_item_routes_pkey ON public.outlet_item_routes USING btree (outlet_id, item_id, normalized_variant_key)",
                    "index_name": "outlet_item_routes_pkey"
                }
            ],
            "table_name": "outlet_item_routes",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_item_routes_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_item_routes_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id, item_id, normalized_variant_key)",
                    "constraint_name": "outlet_item_routes_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (target_outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_item_routes_target_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_item_routes_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "enabled",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "display_name",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX outlet_products_pkey ON public.outlet_products USING btree (outlet_id, item_id, variant_key)",
                    "index_name": "outlet_products_pkey"
                }
            ],
            "table_name": "outlet_products",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_products_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_products_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id, item_id, variant_key)",
                    "constraint_name": "outlet_products_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_units",
                    "is_nullable": "NO"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "is_production",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "sold_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "created_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "sale_price",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "vat_exc_price",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "flavour_price",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "flavour_id",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_sales_outlet ON public.outlet_sales USING btree (outlet_id, sold_at DESC)",
                    "index_name": "idx_outlet_sales_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_sales_pkey ON public.outlet_sales USING btree (id)",
                    "index_name": "outlet_sales_pkey"
                }
            ],
            "table_name": "outlet_sales",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_sales_created_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_sales_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_sales_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "outlet_sales_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (qty_units > 0::numeric)",
                    "constraint_name": "outlet_sales_qty_units_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_sales_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "0",
                    "data_type": "numeric",
                    "column_name": "sent_units",
                    "is_nullable": "NO"
                },
                {
                    "default": "0",
                    "data_type": "numeric",
                    "column_name": "consumed_units",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "on_hand_units",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX idx_outlet_stock_balances_key ON public.outlet_stock_balances USING btree (outlet_id, item_id, variant_key)",
                    "index_name": "idx_outlet_stock_balances_key"
                },
                {
                    "definition": "CREATE INDEX idx_outlet_stock_balances_outlet ON public.outlet_stock_balances USING btree (outlet_id)",
                    "index_name": "idx_outlet_stock_balances_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_stock_balances_pkey ON public.outlet_stock_balances USING btree (outlet_id, item_id, variant_key)",
                    "index_name": "outlet_stock_balances_pkey"
                }
            ],
            "table_name": "outlet_stock_balances",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stock_balances_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stock_balances_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id, item_id, variant_key)",
                    "constraint_name": "outlet_stock_balances_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "on_hand_at_snapshot",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "counted_qty",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "variance",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "counted_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "counted_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_stocktakes_outlet ON public.outlet_stocktakes USING btree (outlet_id, counted_at DESC)",
                    "index_name": "idx_outlet_stocktakes_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_stocktakes_pkey ON public.outlet_stocktakes USING btree (id)",
                    "index_name": "outlet_stocktakes_pkey"
                }
            ],
            "table_name": "outlet_stocktakes",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (counted_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_stocktakes_counted_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stocktakes_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stocktakes_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "outlet_stocktakes_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "default_sales_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "default_receiving_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX outlet_warehouse_defaults_pkey ON public.outlet_warehouse_defaults USING btree (outlet_id)",
                    "index_name": "outlet_warehouse_defaults_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_outlet_warehouse_defaults_outlet_variant ON public.outlet_warehouse_defaults USING btree (outlet_id, variant_key)",
                    "index_name": "ux_outlet_warehouse_defaults_outlet_variant"
                }
            ],
            "table_name": "outlet_warehouse_defaults",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (default_receiving_warehouse_id) REFERENCES warehouses(id)",
                    "constraint_name": "outlet_warehouse_defaults_default_receiving_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (default_sales_warehouse_id) REFERENCES warehouses(id)",
                    "constraint_name": "outlet_warehouse_defaults_default_sales_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_warehouse_defaults_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id)",
                    "constraint_name": "outlet_warehouse_defaults_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "primary_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "secondary_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "deduct_warehouse_id",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX outlet_warehouse_routing_pkey ON public.outlet_warehouse_routing USING btree (outlet_id)",
                    "index_name": "outlet_warehouse_routing_pkey"
                }
            ],
            "table_name": "outlet_warehouse_routing",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (deduct_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_warehouse_routing_deduct_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_warehouse_routing_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id)",
                    "constraint_name": "outlet_warehouse_routing_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (primary_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_warehouse_routing_primary_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (secondary_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_warehouse_routing_secondary_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX outlet_warehouses_pkey ON public.outlet_warehouses USING btree (outlet_id, warehouse_id)",
                    "index_name": "outlet_warehouses_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_warehouses_unique ON public.outlet_warehouses USING btree (outlet_id, warehouse_id)",
                    "index_name": "outlet_warehouses_unique"
                }
            ],
            "table_name": "outlet_warehouses",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_warehouses_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id, warehouse_id)",
                    "constraint_name": "outlet_warehouses_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_warehouses_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "name",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "code",
                    "is_nullable": "YES"
                },
                {
                    "default": "'selling'::text",
                    "data_type": "text",
                    "column_name": "channel",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "auth_user_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "deduct_on_pos_sale",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX outlets_auth_user_id_key ON public.outlets USING btree (auth_user_id)",
                    "index_name": "outlets_auth_user_id_key"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlets_pkey ON public.outlets USING btree (id)",
                    "index_name": "outlets_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_outlets_code ON public.outlets USING btree (lower(code)) WHERE (code IS NOT NULL)",
                    "index_name": "ux_outlets_code"
                }
            ],
            "table_name": "outlets",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "outlets_auth_user_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "UNIQUE (auth_user_id)",
                    "constraint_name": "outlets_auth_user_id_key",
                    "constraint_type": "u"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "outlets_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "user_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "granted_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX platform_admins_pkey ON public.platform_admins USING btree (user_id)",
                    "index_name": "platform_admins_pkey"
                }
            ],
            "table_name": "platform_admins",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (user_id)",
                    "constraint_name": "platform_admins_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
                    "constraint_name": "platform_admins_user_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "nextval('pos_inventory_consumed_id_seq'::regclass)",
                    "data_type": "bigint",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "source_event_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "order_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "raw_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "quantity_consumed",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "remaining_quantity",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "occurred_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "date",
                    "column_name": "pos_date",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "kdsid",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "typec",
                    "is_nullable": "YES"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "unassigned_branch_note",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_pos_inventory_consumed_outlet ON public.pos_inventory_consumed USING btree (outlet_id)",
                    "index_name": "idx_pos_inventory_consumed_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_pos_inventory_consumed_source ON public.pos_inventory_consumed USING btree (source_event_id)",
                    "index_name": "idx_pos_inventory_consumed_source"
                },
                {
                    "definition": "CREATE UNIQUE INDEX pos_inventory_consumed_pkey ON public.pos_inventory_consumed USING btree (id)",
                    "index_name": "pos_inventory_consumed_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX pos_inventory_consumed_source_event_id_key ON public.pos_inventory_consumed USING btree (source_event_id)",
                    "index_name": "pos_inventory_consumed_source_event_id_key"
                }
            ],
            "table_name": "pos_inventory_consumed",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL",
                    "constraint_name": "pos_inventory_consumed_order_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "pos_inventory_consumed_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "pos_inventory_consumed_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "UNIQUE (source_event_id)",
                    "constraint_name": "pos_inventory_consumed_source_event_id_key",
                    "constraint_type": "u"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "pos_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "catalog_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "catalog_variant_key",
                    "is_nullable": "YES"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "normalized_variant_key",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "pos_flavour_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "pos_item_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "pos_flavour_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "catalog_item_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "catalog_variant_name",
                    "is_nullable": "YES"
                },
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX pos_item_map_pkey ON public.pos_item_map USING btree (id)",
                    "index_name": "pos_item_map_pkey"
                }
            ],
            "table_name": "pos_item_map",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id)",
                    "constraint_name": "pos_item_map_catalog_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "pos_item_map_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "pos_item_map_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "supplier_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "preferred",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "notes",
                    "is_nullable": "YES"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_product_supplier_links_item ON public.product_supplier_links USING btree (item_id)",
                    "index_name": "idx_product_supplier_links_item"
                },
                {
                    "definition": "CREATE INDEX idx_product_supplier_links_supplier ON public.product_supplier_links USING btree (supplier_id)",
                    "index_name": "idx_product_supplier_links_supplier"
                },
                {
                    "definition": "CREATE INDEX idx_product_supplier_links_warehouse ON public.product_supplier_links USING btree (warehouse_id)",
                    "index_name": "idx_product_supplier_links_warehouse"
                },
                {
                    "definition": "CREATE UNIQUE INDEX product_supplier_links_pkey ON public.product_supplier_links USING btree (id)",
                    "index_name": "product_supplier_links_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_supplier_item_vkey_wh ON public.product_supplier_links USING btree (supplier_id, item_id, variant_key, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))",
                    "index_name": "ux_supplier_item_vkey_wh"
                }
            ],
            "table_name": "product_supplier_links",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "product_supplier_links_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "product_supplier_links_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE",
                    "constraint_name": "product_supplier_links_supplier_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "product_supplier_links_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "finished_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "ingredient_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_per_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "USER-DEFINED",
                    "column_name": "qty_unit",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "source_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "1",
                    "data_type": "numeric",
                    "column_name": "yield_qty_units",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "finished_variant_key",
                    "is_nullable": "YES"
                },
                {
                    "default": "'finished'::item_kind",
                    "data_type": "USER-DEFINED",
                    "column_name": "recipe_for_kind",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_recipes_ingredient ON public.recipes USING btree (ingredient_item_id)",
                    "index_name": "idx_recipes_ingredient"
                },
                {
                    "definition": "CREATE INDEX idx_recipes_source_warehouse ON public.recipes USING btree (source_warehouse_id)",
                    "index_name": "idx_recipes_source_warehouse"
                },
                {
                    "definition": "CREATE UNIQUE INDEX item_ingredient_recipes_pkey ON public.recipes USING btree (id)",
                    "index_name": "item_ingredient_recipes_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_recipes_finished_variant_kind_ing_active ON public.recipes USING btree (finished_item_id, recipe_for_kind, COALESCE(finished_variant_key, 'base'::text), ingredient_item_id) WHERE active",
                    "index_name": "ux_recipes_finished_variant_kind_ing_active"
                }
            ],
            "table_name": "recipes",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (finished_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "item_ingredient_recipes_finished_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (ingredient_item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT",
                    "constraint_name": "item_ingredient_recipes_ingredient_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "item_ingredient_recipes_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (qty_per_unit > 0::numeric)",
                    "constraint_name": "item_ingredient_recipes_qty_per_unit_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "item_ingredient_recipes_source_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (yield_qty_units > 0::numeric)",
                    "constraint_name": "item_ingredient_recipes_yield_qty_units_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "CHECK (recipe_for_kind = ANY (ARRAY['ingredient'::item_kind, 'finished'::item_kind]))",
                    "constraint_name": "recipes_recipe_for_kind_chk",
                    "constraint_type": "c"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "slug",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "normalized_slug",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "display_name",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "description",
                    "is_nullable": "YES"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_roles_normalized_slug ON public.roles USING btree (normalized_slug)",
                    "index_name": "idx_roles_normalized_slug"
                },
                {
                    "definition": "CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)",
                    "index_name": "roles_pkey"
                }
            ],
            "table_name": "roles",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "roles_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "location_type",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "delta_units",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "USER-DEFINED",
                    "column_name": "reason",
                    "is_nullable": "NO"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "occurred_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX stock_ledger_pkey ON public.stock_ledger USING btree (id)",
                    "index_name": "stock_ledger_pkey"
                }
            ],
            "table_name": "stock_ledger",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "stock_ledger_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (location_type = ANY (ARRAY['warehouse'::text, 'outlet'::text]))",
                    "constraint_name": "stock_ledger_location_type_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL",
                    "constraint_name": "stock_ledger_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "stock_ledger_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "stock_ledger_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "name",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "contact_name",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "contact_phone",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "contact_email",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "whatsapp_number",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "notes",
                    "is_nullable": "YES"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX idx_suppliers_name_unique ON public.suppliers USING btree (lower(name))",
                    "index_name": "idx_suppliers_name_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)",
                    "index_name": "suppliers_pkey"
                }
            ],
            "table_name": "suppliers",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "suppliers_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": false
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "user_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "role_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "display_name",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_user_roles_outlet ON public.user_roles USING btree (outlet_id)",
                    "index_name": "idx_user_roles_outlet"
                },
                {
                    "definition": "CREATE INDEX idx_user_roles_user ON public.user_roles USING btree (user_id)",
                    "index_name": "idx_user_roles_user"
                },
                {
                    "definition": "CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)",
                    "index_name": "user_roles_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX user_roles_user_id_role_id_outlet_id_key ON public.user_roles USING btree (user_id, role_id, outlet_id)",
                    "index_name": "user_roles_user_id_role_id_outlet_id_key"
                }
            ],
            "table_name": "user_roles",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "user_roles_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "user_roles_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE",
                    "constraint_name": "user_roles_role_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
                    "constraint_name": "user_roles_user_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "UNIQUE (user_id, role_id, outlet_id)",
                    "constraint_name": "user_roles_user_id_role_id_outlet_id_key",
                    "constraint_type": "u"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "note",
                    "is_nullable": "YES"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "created_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_warehouse_damages_warehouse ON public.warehouse_damages USING btree (warehouse_id)",
                    "index_name": "idx_warehouse_damages_warehouse"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_damages_pkey ON public.warehouse_damages USING btree (id)",
                    "index_name": "warehouse_damages_pkey"
                }
            ],
            "table_name": "warehouse_damages",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "warehouse_damages_created_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_damages_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_damages_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "receipt_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_units",
                    "is_nullable": "NO"
                },
                {
                    "default": "'units'::text",
                    "data_type": "text",
                    "column_name": "qty_input_mode",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "unit_cost",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_purchase_items_receipt ON public.warehouse_purchase_items USING btree (receipt_id)",
                    "index_name": "idx_purchase_items_receipt"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_purchase_items_pkey ON public.warehouse_purchase_items USING btree (id)",
                    "index_name": "warehouse_purchase_items_pkey"
                }
            ],
            "table_name": "warehouse_purchase_items",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_purchase_items_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_purchase_items_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (qty_units > 0::numeric)",
                    "constraint_name": "warehouse_purchase_items_qty_units_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (receipt_id) REFERENCES warehouse_purchase_receipts(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_purchase_items_receipt_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "supplier_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "reference_code",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "note",
                    "is_nullable": "YES"
                },
                {
                    "default": "false",
                    "data_type": "boolean",
                    "column_name": "auto_whatsapp",
                    "is_nullable": "NO"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "recorded_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "recorded_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "received_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_purchase_receipts_supplier ON public.warehouse_purchase_receipts USING btree (supplier_id)",
                    "index_name": "idx_purchase_receipts_supplier"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_purchase_receipts_reference_per_warehouse ON public.warehouse_purchase_receipts USING btree (warehouse_id, reference_code)",
                    "index_name": "ux_purchase_receipts_reference_per_warehouse"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_purchase_receipts_pkey ON public.warehouse_purchase_receipts USING btree (id)",
                    "index_name": "warehouse_purchase_receipts_pkey"
                }
            ],
            "table_name": "warehouse_purchase_receipts",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_purchase_receipts_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "warehouse_purchase_receipts_recorded_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL",
                    "constraint_name": "warehouse_purchase_receipts_supplier_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_purchase_receipts_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "period_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "counted_qty",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "kind",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "counted_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "counted_by",
                    "is_nullable": "NO"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX idx_wsc_unique_kind ON public.warehouse_stock_counts USING btree (period_id, item_id, variant_key, kind)",
                    "index_name": "idx_wsc_unique_kind"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_stock_counts_pkey ON public.warehouse_stock_counts USING btree (id)",
                    "index_name": "warehouse_stock_counts_pkey"
                }
            ],
            "table_name": "warehouse_stock_counts",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (counted_by) REFERENCES auth.users(id)",
                    "constraint_name": "warehouse_stock_counts_counted_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (counted_qty >= 0::numeric)",
                    "constraint_name": "warehouse_stock_counts_counted_qty_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id)",
                    "constraint_name": "warehouse_stock_counts_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (kind = ANY (ARRAY['opening'::text, 'closing'::text]))",
                    "constraint_name": "warehouse_stock_counts_kind_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (period_id) REFERENCES warehouse_stock_periods(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_stock_counts_period_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_stock_counts_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "outlet_id",
                    "is_nullable": "NO"
                },
                {
                    "default": "'open'::text",
                    "data_type": "text",
                    "column_name": "status",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "opened_at",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "opened_by",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "timestamp with time zone",
                    "column_name": "closed_at",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "closed_by",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "note",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "jsonb",
                    "column_name": "opening_snapshot",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "jsonb",
                    "column_name": "closing_snapshot",
                    "is_nullable": "YES"
                },
                {
                    "default": "next_stocktake_number()",
                    "data_type": "text",
                    "column_name": "stocktake_number",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX idx_wsp_open_unique ON public.warehouse_stock_periods USING btree (warehouse_id) WHERE (status = 'open'::text)",
                    "index_name": "idx_wsp_open_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_stock_periods_pkey ON public.warehouse_stock_periods USING btree (id)",
                    "index_name": "warehouse_stock_periods_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_stock_periods_stocktake_number_key ON public.warehouse_stock_periods USING btree (stocktake_number)",
                    "index_name": "warehouse_stock_periods_stocktake_number_key"
                }
            ],
            "table_name": "warehouse_stock_periods",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (closed_by) REFERENCES auth.users(id)",
                    "constraint_name": "warehouse_stock_periods_closed_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (opened_by) REFERENCES auth.users(id)",
                    "constraint_name": "warehouse_stock_periods_opened_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_stock_periods_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_stock_periods_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]))",
                    "constraint_name": "warehouse_stock_periods_status_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "UNIQUE (stocktake_number)",
                    "constraint_name": "warehouse_stock_periods_stocktake_number_key",
                    "constraint_type": "u"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_stock_periods_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "transfer_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_units",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "'base'::text",
                    "data_type": "text",
                    "column_name": "variant_key",
                    "is_nullable": "YES"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_transfer_items_transfer ON public.warehouse_transfer_items USING btree (transfer_id)",
                    "index_name": "idx_transfer_items_transfer"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_transfer_items_pkey ON public.warehouse_transfer_items USING btree (id)",
                    "index_name": "warehouse_transfer_items_pkey"
                }
            ],
            "table_name": "warehouse_transfer_items",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_transfer_items_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_transfer_items_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (qty_units > 0::numeric)",
                    "constraint_name": "warehouse_transfer_items_qty_units_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (transfer_id) REFERENCES warehouse_transfers(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_transfer_items_transfer_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "reference_code",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "source_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "destination_warehouse_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "note",
                    "is_nullable": "YES"
                },
                {
                    "default": "'{}'::jsonb",
                    "data_type": "jsonb",
                    "column_name": "context",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "created_by",
                    "is_nullable": "YES"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_warehouse_transfers_destination ON public.warehouse_transfers USING btree (destination_warehouse_id)",
                    "index_name": "idx_warehouse_transfers_destination"
                },
                {
                    "definition": "CREATE INDEX idx_warehouse_transfers_source ON public.warehouse_transfers USING btree (source_warehouse_id)",
                    "index_name": "idx_warehouse_transfers_source"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_warehouse_transfers_reference ON public.warehouse_transfers USING btree (reference_code)",
                    "index_name": "ux_warehouse_transfers_reference"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_transfers_pkey ON public.warehouse_transfers USING btree (id)",
                    "index_name": "warehouse_transfers_pkey"
                }
            ],
            "table_name": "warehouse_transfers",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
                    "constraint_name": "warehouse_transfers_created_by_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_transfers_destination_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_transfers_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_transfers_source_warehouse_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "gen_random_uuid()",
                    "data_type": "uuid",
                    "column_name": "id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "name",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "code",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "kind",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "parent_warehouse_id",
                    "is_nullable": "YES"
                },
                {
                    "default": "'selling'::stock_layer",
                    "data_type": "USER-DEFINED",
                    "column_name": "stock_layer",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "created_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "now()",
                    "data_type": "timestamp with time zone",
                    "column_name": "updated_at",
                    "is_nullable": "NO"
                },
                {
                    "default": "true",
                    "data_type": "boolean",
                    "column_name": "active",
                    "is_nullable": "NO"
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX ux_warehouses_code ON public.warehouses USING btree (lower(code)) WHERE (code IS NOT NULL)",
                    "index_name": "ux_warehouses_code"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouses_pkey ON public.warehouses USING btree (id)",
                    "index_name": "warehouses_pkey"
                }
            ],
            "table_name": "warehouses",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (parent_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "warehouses_parent_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouses_pkey",
                    "constraint_type": "p"
                }
            ],
            "row_security": true
        }
    ],
    "policies": [
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "catalog_items",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "catalog_items_admin_rw"
        },
        {
            "cmd": "UPDATE",
            "qual": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))",
            "roles": [
                "public"
            ],
            "table_name": "catalog_items",
            "with_check": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))",
            "policy_name": "catalog_items_image_update_stocktake"
        },
        {
            "cmd": "SELECT",
            "qual": "(active = true)",
            "roles": [
                "anon"
            ],
            "table_name": "catalog_items",
            "with_check": null,
            "policy_name": "catalog_items_read_kiosk_anon"
        },
        {
            "cmd": "SELECT",
            "qual": "((auth.uid() IS NOT NULL) AND active)",
            "roles": [
                "authenticated"
            ],
            "table_name": "catalog_items",
            "with_check": null,
            "policy_name": "catalog_items_select_active"
        },
        {
            "cmd": "SELECT",
            "qual": "true",
            "roles": [
                "authenticated"
            ],
            "table_name": "catalog_items",
            "with_check": null,
            "policy_name": "catalog_items_select_any_auth"
        },
        {
            "cmd": "ALL",
            "qual": "(auth.role() = 'service_role'::text)",
            "roles": [
                "public"
            ],
            "table_name": "counter_values",
            "with_check": "(auth.role() = 'service_role'::text)",
            "policy_name": "counter_values_service_all"
        },
        {
            "cmd": "DELETE",
            "qual": "is_admin(( SELECT auth.uid() AS uid))",
            "roles": [
                "authenticated"
            ],
            "table_name": "order_items",
            "with_check": null,
            "policy_name": "order_items_policy_delete"
        },
        {
            "cmd": "INSERT",
            "qual": null,
            "roles": [
                "authenticated"
            ],
            "table_name": "order_items",
            "with_check": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "policy_name": "order_items_policy_insert"
        },
        {
            "cmd": "SELECT",
            "qual": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "roles": [
                "authenticated"
            ],
            "table_name": "order_items",
            "with_check": null,
            "policy_name": "order_items_policy_select"
        },
        {
            "cmd": "UPDATE",
            "qual": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "roles": [
                "authenticated"
            ],
            "table_name": "order_items",
            "with_check": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
            "policy_name": "order_items_policy_update"
        },
        {
            "cmd": "DELETE",
            "qual": "is_admin(( SELECT auth.uid() AS uid))",
            "roles": [
                "authenticated"
            ],
            "table_name": "orders",
            "with_check": null,
            "policy_name": "orders_policy_delete"
        },
        {
            "cmd": "INSERT",
            "qual": null,
            "roles": [
                "authenticated"
            ],
            "table_name": "orders",
            "with_check": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))",
            "policy_name": "orders_policy_insert"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))",
            "roles": [
                "authenticated"
            ],
            "table_name": "orders",
            "with_check": null,
            "policy_name": "orders_policy_select"
        },
        {
            "cmd": "UPDATE",
            "qual": "is_admin(( SELECT auth.uid() AS uid))",
            "roles": [
                "authenticated"
            ],
            "table_name": "orders",
            "with_check": "is_admin(( SELECT auth.uid() AS uid))",
            "policy_name": "orders_policy_update"
        },
        {
            "cmd": "ALL",
            "qual": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_stock_balances",
            "with_check": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "policy_name": "outlet_balances_scoped"
        },
        {
            "cmd": "SELECT",
            "qual": "((auth.role() = 'service_role'::text) OR (outlet_id = ANY (COALESCE(member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
            "roles": [
                "public"
            ],
            "table_name": "outlet_item_routes",
            "with_check": null,
            "policy_name": "outlet_item_routes_select"
        },
        {
            "cmd": "ALL",
            "qual": "(auth.role() = 'service_role'::text)",
            "roles": [
                "public"
            ],
            "table_name": "outlet_item_routes",
            "with_check": "(auth.role() = 'service_role'::text)",
            "policy_name": "outlet_item_routes_write"
        },
        {
            "cmd": "SELECT",
            "qual": "(auth.uid() IS NOT NULL)",
            "roles": [
                "public"
            ],
            "table_name": "outlet_products",
            "with_check": null,
            "policy_name": "outlet_products_read_stocktake"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_products",
            "with_check": null,
            "policy_name": "outlet_products_write_admin"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_sales",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_sales_admin_rw"
        },
        {
            "cmd": "INSERT",
            "qual": null,
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_sales",
            "with_check": "(auth.uid() IS NOT NULL)",
            "policy_name": "outlet_sales_insert_ops"
        },
        {
            "cmd": "ALL",
            "qual": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_sales",
            "with_check": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "policy_name": "outlet_sales_scoped"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_stock_balances",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_stock_balances_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "true",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_stock_balances",
            "with_check": null,
            "policy_name": "outlet_stock_balances_ro"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_stocktakes",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_stocktakes_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "true",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_stocktakes",
            "with_check": null,
            "policy_name": "outlet_stocktakes_ro"
        },
        {
            "cmd": "ALL",
            "qual": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_stocktakes",
            "with_check": "outlet_auth_user_matches(outlet_id, auth.uid())",
            "policy_name": "outlet_stocktakes_scoped"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_warehouse_defaults",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_warehouse_defaults_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(auth.uid()) OR (outlet_id = ANY (COALESCE(member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
            "roles": [
                "public"
            ],
            "table_name": "outlet_warehouse_defaults",
            "with_check": null,
            "policy_name": "outlet_warehouse_defaults_read_auth"
        },
        {
            "cmd": "SELECT",
            "qual": "(auth.uid() IS NOT NULL)",
            "roles": [
                "public"
            ],
            "table_name": "outlet_warehouse_routing",
            "with_check": null,
            "policy_name": "outlet_warehouse_routing_read_stocktake"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_warehouse_routing",
            "with_check": null,
            "policy_name": "outlet_warehouse_routing_write_admin"
        },
        {
            "cmd": "SELECT",
            "qual": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_warehouses",
            "with_check": null,
            "policy_name": "outlet_warehouses_select_stocktake"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlets",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlets_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlets",
            "with_check": null,
            "policy_name": "outlets_select_stocktake"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "platform_admins",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "platform_admins_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
            "roles": [
                "authenticated"
            ],
            "table_name": "platform_admins",
            "with_check": null,
            "policy_name": "platform_admins_self_select"
        },
        {
            "cmd": "SELECT",
            "qual": "true",
            "roles": [
                "authenticated"
            ],
            "table_name": "pos_item_map",
            "with_check": null,
            "policy_name": "pos_item_map_select_any_auth"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "recipes",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "recipes_admin_rw"
        },
        {
            "cmd": "INSERT",
            "qual": null,
            "roles": [
                "public"
            ],
            "table_name": "recipes",
            "with_check": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
            "policy_name": "recipes_edit_admin_or_transfer_mgr"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
            "roles": [
                "authenticated"
            ],
            "table_name": "recipes",
            "with_check": null,
            "policy_name": "recipes_read_admin_or_transfer_mgr"
        },
        {
            "cmd": "SELECT",
            "qual": "(active = true)",
            "roles": [
                "authenticated"
            ],
            "table_name": "recipes",
            "with_check": null,
            "policy_name": "recipes_read_kiosk"
        },
        {
            "cmd": "SELECT",
            "qual": "(active = true)",
            "roles": [
                "anon"
            ],
            "table_name": "recipes",
            "with_check": null,
            "policy_name": "recipes_read_kiosk_anon"
        },
        {
            "cmd": "SELECT",
            "qual": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
            "roles": [
                "anon"
            ],
            "table_name": "recipes",
            "with_check": null,
            "policy_name": "recipes_read_kiosk_anon_wh"
        },
        {
            "cmd": "SELECT",
            "qual": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
            "roles": [
                "authenticated"
            ],
            "table_name": "recipes",
            "with_check": null,
            "policy_name": "recipes_read_kiosk_wh"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "roles",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "roles_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "true",
            "roles": [
                "authenticated"
            ],
            "table_name": "roles",
            "with_check": null,
            "policy_name": "roles_select_all"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "stock_ledger",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "stock_ledger_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_stocktake_user(auth.uid()) AND (location_type = 'warehouse'::text))",
            "roles": [
                "authenticated"
            ],
            "table_name": "stock_ledger",
            "with_check": null,
            "policy_name": "stock_ledger_stocktake_read"
        },
        {
            "cmd": "ALL",
            "qual": "(auth.role() = 'service_role'::text)",
            "roles": [
                "public"
            ],
            "table_name": "warehouse_stock_counts",
            "with_check": "true",
            "policy_name": "stocktake_counts_admin"
        },
        {
            "cmd": "ALL",
            "qual": "is_stocktake_user(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "warehouse_stock_counts",
            "with_check": "is_stocktake_user(auth.uid())",
            "policy_name": "stocktake_counts_stocktakers"
        },
        {
            "cmd": "ALL",
            "qual": "(auth.role() = 'service_role'::text)",
            "roles": [
                "public"
            ],
            "table_name": "warehouse_stock_periods",
            "with_check": "true",
            "policy_name": "stocktake_periods_admin"
        },
        {
            "cmd": "ALL",
            "qual": "is_stocktake_user(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "warehouse_stock_periods",
            "with_check": "is_stocktake_user(auth.uid())",
            "policy_name": "stocktake_periods_stocktakers"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "user_roles",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "user_roles_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
            "roles": [
                "authenticated"
            ],
            "table_name": "user_roles",
            "with_check": null,
            "policy_name": "user_roles_self_select"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouse_damages",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_damages_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouse_purchase_items",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_purchase_items_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouse_purchase_receipts",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_purchase_receipts_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouse_transfer_items",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_transfer_items_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouse_transfers",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_transfers_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouses",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouses_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouses",
            "with_check": null,
            "policy_name": "warehouses_select_stocktake"
        }
    ],
    "triggers": [
        {
            "timing": "BEFORE",
            "condition": null,
            "statement": "EXECUTE FUNCTION assert_order_item_editable()",
            "manipulation": "INSERT",
            "trigger_name": "trg_order_items_lock"
        },
        {
            "timing": "BEFORE",
            "condition": null,
            "statement": "EXECUTE FUNCTION assert_order_item_editable()",
            "manipulation": "DELETE",
            "trigger_name": "trg_order_items_lock"
        },
        {
            "timing": "BEFORE",
            "condition": null,
            "statement": "EXECUTE FUNCTION assert_order_item_editable()",
            "manipulation": "UPDATE",
            "trigger_name": "trg_order_items_lock"
        },
        {
            "timing": "AFTER",
            "condition": "((new.status = ANY (ARRAY['approved'::text, 'loaded'::text, 'delivered'::text])) AND (NOT COALESCE(new.locked, false)))",
            "statement": "EXECUTE FUNCTION ensure_order_locked_and_allocated()",
            "manipulation": "UPDATE",
            "trigger_name": "trg_orders_lock_allocate"
        },
        {
            "timing": "AFTER",
            "condition": "((new.location_type = 'warehouse'::text) AND (new.delta_units > (0)::numeric))",
            "statement": "EXECUTE FUNCTION rollup_on_raw_insert()",
            "manipulation": "INSERT",
            "trigger_name": "trg_rollup_on_raw_add"
        },
        {
            "timing": "BEFORE",
            "condition": null,
            "statement": "EXECUTE FUNCTION stock_ledger_set_occurred_at()",
            "manipulation": "INSERT",
            "trigger_name": "trg_stock_ledger_set_occurred_at"
        }
    ],
    "functions": [
        {
            "arguments": "p_item_id uuid, p_qty_units numeric, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text, p_context jsonb DEFAULT '{}'::jsonb, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[]",
            "definition": "CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(p_item_id uuid, p_qty_units numeric, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text, p_context jsonb DEFAULT '{}'::jsonb, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[])\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  comp record;\r\n  v_yield numeric := 1;\r\n  v_has_recipe boolean := false;\r\n  v_effective_qty numeric;\r\n  v_variant_key text := public.normalize_variant_key(p_variant_key);\r\n  v_item_kind item_kind;\r\nbegin\r\n  if p_item_id is null or p_qty_units is null or p_qty_units <= 0 then\r\n    raise exception 'item + qty required for recipe deductions';\r\n  end if;\r\n\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse required for recipe deductions';\r\n  end if;\r\n\r\n  if p_depth > 8 or p_item_id = any(p_seen) then\r\n    raise exception 'recipe recursion detected for item %', p_item_id;\r\n  end if;\r\n\r\n  select ci.item_kind\r\n  into v_item_kind\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  if v_item_kind is null then\r\n    raise exception 'catalog item % not found for recipe deductions', p_item_id;\r\n  end if;\r\n\r\n  select true, coalesce(min(r.yield_qty_units), 1)\r\n  into v_has_recipe, v_yield\r\n  from public.recipes r\r\n  where r.active\r\n    and r.finished_item_id = p_item_id\r\n    and r.recipe_for_kind = v_item_kind\r\n    and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key;\r\n\r\n  if not v_has_recipe then\r\n    insert into public.stock_ledger(\r\n      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context\r\n    ) values (\r\n      'warehouse', p_warehouse_id, p_item_id, v_variant_key,\r\n      -1 * p_qty_units, 'recipe_consumption',\r\n      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units) || coalesce(p_context, '{}')\r\n    );\r\n    return;\r\n  end if;\r\n\r\n  for comp in\r\n    select r.ingredient_item_id as item_id,\r\n           r.qty_per_unit as qty_units,\r\n           ci.item_kind as component_kind\r\n    from public.recipes r\r\n    join public.catalog_items ci on ci.id = r.ingredient_item_id\r\n    where r.active\r\n      and r.finished_item_id = p_item_id\r\n      and r.recipe_for_kind = v_item_kind\r\n      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key\r\n  loop\r\n    v_effective_qty := (p_qty_units / v_yield) * comp.qty_units;\r\n\r\n    if comp.component_kind = 'ingredient' then\r\n      perform public.apply_recipe_deductions(\r\n        comp.item_id,\r\n        v_effective_qty,\r\n        p_warehouse_id,\r\n        'base',\r\n        coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id),\r\n        p_depth + 1,\r\n        array_append(p_seen, p_item_id)\r\n      );\r\n    else\r\n      insert into public.stock_ledger(\r\n        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context\r\n      ) values (\r\n        'warehouse', p_warehouse_id, comp.item_id, 'base',\r\n        -1 * v_effective_qty, 'recipe_consumption',\r\n        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', comp.qty_units) || coalesce(p_context, '{}')\r\n      );\r\n    end if;\r\n  end loop;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "apply_recipe_deductions"
        },
        {
            "arguments": "p_order_id uuid, p_strict boolean DEFAULT true",
            "definition": "CREATE OR REPLACE FUNCTION public.approve_lock_and_allocate_order(p_order_id uuid, p_strict boolean DEFAULT true)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := (SELECT auth.uid());\r\n  v_order public.orders%ROWTYPE;\r\n  v_needs_allocation boolean := false;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to allocate order %', p_order_id;\r\n  END IF;\r\n\r\n  v_needs_allocation := NOT COALESCE(v_order.locked, false);\r\n\r\n  IF v_needs_allocation THEN\r\n    UPDATE public.orders\r\n    SET status = COALESCE(NULLIF(v_order.status, ''), 'approved'),\r\n        locked = true,\r\n        approved_at = COALESCE(v_order.approved_at, now()),\r\n        approved_by = COALESCE(v_order.approved_by, v_uid),\r\n        updated_at = now()\r\n    WHERE id = p_order_id;\r\n\r\n    PERFORM public.record_order_fulfillment(p_order_id);\r\n  ELSIF NOT p_strict THEN\r\n    PERFORM public.record_order_fulfillment(p_order_id);\r\n  END IF;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "approve_lock_and_allocate_order"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.assert_order_item_editable()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_order public.orders%ROWTYPE;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order not found for item';\r\n  END IF;\r\n\r\n  IF COALESCE(v_order.locked, false)\r\n     OR lower(COALESCE(v_order.status, '')) IN ('approved', 'loaded', 'offloaded', 'delivered') THEN\r\n    RAISE EXCEPTION 'order % is locked; items cannot be modified', v_order.id;\r\n  END IF;\r\n\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "return_type": "trigger",
            "function_name": "assert_order_item_editable"
        },
        {
            "arguments": "p_finished_item_id uuid, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text",
            "definition": "CREATE OR REPLACE FUNCTION public.available_servings(p_finished_item_id uuid, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text)\n RETURNS TABLE(finished_item_id uuid, warehouse_id uuid, variant_key text, max_servings numeric, bottleneck_ingredient uuid, bottleneck_needed numeric, bottleneck_available numeric)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  with normalized as (\r\n    select public.normalize_variant_key(coalesce(p_variant_key, 'base')) as vkey\r\n  ),\r\n  req as (\r\n    select\r\n      r.ingredient_item_id as ingredient_id,\r\n      r.qty_per_unit as qty_per_unit,\r\n      coalesce(r.yield_qty_units, 1) as yield_units\r\n    from public.recipes r\r\n    join normalized n on true\r\n    where r.active\r\n      and r.finished_item_id = p_finished_item_id\r\n      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = n.vkey\r\n  ),\r\n  stock as (\r\n    select\r\n      s.item_id,\r\n      s.variant_key,\r\n      coalesce(s.net_units, 0) as on_hand\r\n    from public.warehouse_layer_stock s\r\n    where s.warehouse_id = p_warehouse_id\r\n  ),\r\n  per_component as (\r\n    select\r\n      req.ingredient_id,\r\n      req.qty_per_unit,\r\n      req.yield_units,\r\n      coalesce(st.on_hand, 0) as on_hand,\r\n      /* how many finished units this ingredient can support */\r\n      floor(\r\n        case\r\n          when req.qty_per_unit <= 0 then 0\r\n          else (coalesce(st.on_hand, 0) * req.yield_units) / req.qty_per_unit\r\n        end\r\n      ) as max_by_component\r\n    from req\r\n    left join stock st on st.item_id = req.ingredient_id and st.variant_key = 'base'\r\n  ),\r\n  agg as (\r\n    select\r\n      min(max_by_component) as max_servings,\r\n      /* pick the bottleneck ingredient (smallest capacity) */\r\n      (array_agg(ingredient_id order by max_by_component asc nulls first))[1] as bottleneck_ingredient,\r\n      (array_agg(qty_per_unit order by max_by_component asc nulls first))[1] as bottleneck_needed,\r\n      (array_agg(on_hand order by max_by_component asc nulls first))[1] as bottleneck_available\r\n    from per_component\r\n  )\r\n  select\r\n    p_finished_item_id,\r\n    p_warehouse_id,\r\n    (select vkey from normalized) as variant_key,\r\n    coalesce(agg.max_servings, 0) as max_servings,\r\n    agg.bottleneck_ingredient,\r\n    agg.bottleneck_needed,\r\n    agg.bottleneck_available\r\n  from agg;\r\n$function$\n",
            "return_type": "TABLE(finished_item_id uuid, warehouse_id uuid, variant_key text, max_servings numeric, bottleneck_ingredient uuid, bottleneck_needed numeric, bottleneck_available numeric)",
            "function_name": "available_servings"
        },
        {
            "arguments": "p_period_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.close_stock_period(p_period_id uuid)\n RETURNS warehouse_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_row public.warehouse_stock_periods%rowtype;\r\nbegin\r\n  if not public.is_stocktake_user(auth.uid()) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  update public.warehouse_stock_periods\r\n  set status = 'closed',\r\n      closed_at = now(),\r\n      closed_by = auth.uid()\r\n  where id = p_period_id and status = 'open'\r\n  returning * into v_row;\r\n\r\n  if not found then\r\n    raise exception 'period not found or already closed';\r\n  end if;\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
            "return_type": "warehouse_stock_periods",
            "function_name": "close_stock_period"
        },
        {
            "arguments": "p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[]",
            "definition": "CREATE OR REPLACE FUNCTION public.console_locked_warehouses(p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[])\n RETURNS TABLE(id uuid, name text, parent_warehouse_id uuid, kind text, active boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  ids uuid[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_locked_ids, ARRAY[]::uuid[])));\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT w.id, w.name, w.parent_warehouse_id, w.kind, w.active\r\n  FROM public.warehouses w\r\n  WHERE p_include_inactive\r\n        OR w.active\r\n        OR (array_length(ids, 1) IS NOT NULL AND w.id = ANY(ids));\r\nEND;\r\n$function$\n",
            "return_type": "TABLE(id uuid, name text, parent_warehouse_id uuid, kind text, active boolean)",
            "function_name": "console_locked_warehouses"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.console_operator_directory()\n RETURNS TABLE(id uuid, display_name text, name text, email text, auth_user_id uuid)\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    u.id,\r\n    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS display_name,\r\n    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS name,\r\n    u.email,\r\n    u.id AS auth_user_id\r\n  FROM public.user_roles ur\r\n  JOIN auth.users u ON u.id = ur.user_id\r\n  WHERE ur.role_id = 'eef421e0-ce06-4518-93c4-6bb6525f6742'\r\n    AND (u.is_anonymous IS NULL OR u.is_anonymous = false)\r\n    AND u.email IS NOT NULL;\r\n$function$\n",
            "return_type": "TABLE(id uuid, display_name text, name text, email text, auth_user_id uuid)",
            "function_name": "console_operator_directory"
        },
        {
            "arguments": "p_user uuid DEFAULT NULL::uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL::uuid)\n RETURNS uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];\r\n$function$\n",
            "return_type": "uuid",
            "function_name": "default_outlet_id"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.ensure_order_locked_and_allocated()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF NEW.status IN ('approved','loaded','delivered') AND NOT COALESCE(NEW.locked, false) THEN\r\n    PERFORM public.record_order_fulfillment(NEW.id);\r\n    UPDATE public.orders\r\n    SET locked = true,\r\n        updated_at = now()\r\n    WHERE id = NEW.id AND locked = false;\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "return_type": "trigger",
            "function_name": "ensure_order_locked_and_allocated"
        },
        {
            "arguments": "p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.has_stocktake_role(p_user_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\nAS $function$\r\n  select exists (\r\n    select 1\r\n    from public.user_roles ur  -- change to your mapping table\r\n    where ur.user_id = p_user_id\r\n      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'\r\n  );\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "has_stocktake_role"
        },
        {
            "arguments": "p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n  RETURN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_user_id);\r\nEND;\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "is_admin"
        },
        {
            "arguments": "p_user uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.is_stocktake_user(p_user uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\nAS $function$\r\n  select exists (\r\n    select 1 from public.user_roles ur\r\n    where ur.user_id = p_user\r\n      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'\r\n  );\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "is_stocktake_user"
        },
        {
            "arguments": "p_warehouse_id uuid, p_outlet_id uuid, p_search text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.list_warehouse_items(p_warehouse_id uuid, p_outlet_id uuid, p_search text DEFAULT NULL::text)\n RETURNS SETOF warehouse_stock_items\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  select *\r\n  from warehouse_stock_items b\r\n  where b.warehouse_id = p_warehouse_id\r\n    and exists (\r\n      select 1\r\n      from outlet_products op\r\n      where op.outlet_id = p_outlet_id\r\n        and op.item_id = b.item_id\r\n        and op.variant_key = coalesce(b.variant_key, 'base')\r\n        and op.enabled\r\n    )\r\n    and (\r\n      p_search is null\r\n      or b.item_name ilike '%' || replace(p_search, '*', '%') || '%'\r\n      or b.item_id::text ilike '%' || replace(p_search, '*', '%') || '%'\r\n    );\r\n$function$\n",
            "return_type": "SETOF warehouse_stock_items",
            "function_name": "list_warehouse_items"
        },
        {
            "arguments": "p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.mark_order_loaded(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := (SELECT auth.uid());\r\n  v_order public.orders%ROWTYPE;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to mark order % as loaded', p_order_id;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'loaded',\r\n      locked = true,\r\n      driver_signed_name = COALESCE(NULLIF(p_driver_name, ''), driver_signed_name),\r\n      driver_signature_path = COALESCE(NULLIF(p_signature_path, ''), driver_signature_path),\r\n      driver_signed_at = now(),\r\n      loaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), loaded_pdf_path),\r\n      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "mark_order_loaded"
        },
        {
            "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.mark_order_modified(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  UPDATE public.orders\r\n  SET modified_by_supervisor = true,\r\n      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "mark_order_modified"
        },
        {
            "arguments": "p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.mark_order_offloaded(p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := (SELECT auth.uid());\r\n  v_order public.orders%ROWTYPE;\r\n  v_was_locked boolean;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  v_was_locked := COALESCE(v_order.locked, false);\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized to complete order %', p_order_id;\r\n  END IF;\r\n\r\n  UPDATE public.orders\r\n  SET status = 'delivered',\r\n      locked = true,\r\n      offloader_signed_name = COALESCE(NULLIF(p_offloader_name, ''), offloader_signed_name),\r\n      offloader_signature_path = COALESCE(NULLIF(p_signature_path, ''), offloader_signature_path),\r\n      offloader_signed_at = now(),\r\n      offloaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), offloaded_pdf_path),\r\n      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\n\r\n  -- If stock was not allocated earlier, do it once here\r\n  IF NOT v_was_locked THEN\r\n    PERFORM public.record_order_fulfillment(p_order_id);\r\n  END IF;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "mark_order_offloaded"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids()\n RETURNS SETOF uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));\r\n$function$\n",
            "return_type": "SETOF uuid",
            "function_name": "member_outlet_ids"
        },
        {
            "arguments": "p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT COALESCE(\r\n    CASE\r\n      WHEN p_user_id IS NULL THEN NULL\r\n      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)\r\n      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)\r\n    END,\r\n    '{}'\r\n  );\r\n$function$\n",
            "return_type": "uuid[]",
            "function_name": "member_outlet_ids"
        },
        {
            "arguments": "p_outlet_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_prefix text;\r\n  v_next bigint;\r\n  v_scope uuid := coalesce(p_outlet_id, '00000000-0000-0000-0000-000000000000');\r\nbegin\r\n  if p_outlet_id is null then\r\n    raise exception 'outlet id required for numbering';\r\n  end if;\r\n\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('order_number', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  select coalesce(nullif(o.code, ''), substr(o.id::text, 1, 4)) into v_prefix\r\n  from public.outlets o\r\n  where o.id = p_outlet_id;\r\n\r\n  v_prefix := coalesce(v_prefix, 'OUT');\r\n  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));\r\n  return v_prefix || '-' || lpad(v_next::text, 4, '0');\r\nend;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_order_number"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.next_purchase_receipt_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('purchase_receipt', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'PR-' || lpad(v_next::text, 6, '0');\r\nend;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_purchase_receipt_reference"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.next_stocktake_number()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('stocktake_number', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'AT' || lpad(v_next::text, 10, '0');\r\nend;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_stocktake_number"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.next_transfer_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_next bigint;\r\n  v_scope uuid := '00000000-0000-0000-0000-000000000000';\r\nbegin\r\n  insert into public.counter_values(counter_key, scope_id, last_value)\r\n  values ('transfer', v_scope, 1)\r\n  on conflict (counter_key, scope_id)\r\n  do update set last_value = public.counter_values.last_value + 1,\r\n                updated_at = now()\r\n  returning last_value into v_next;\r\n\r\n  return 'WT-' || lpad(v_next::text, 6, '0');\r\nend;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_transfer_reference"
        },
        {
            "arguments": "p_variant_key text",
            "definition": "CREATE OR REPLACE FUNCTION public.normalize_variant_key(p_variant_key text)\n RETURNS text\n LANGUAGE sql\nAS $function$\r\n  select coalesce(nullif($1, ''), 'base');\r\n$function$\n",
            "return_type": "text",
            "function_name": "normalize_variant_key"
        },
        {
            "arguments": "p_order_id uuid, p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  target_outlet uuid;\r\nBEGIN\r\n  IF p_order_id IS NULL OR p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;\r\n  IF target_outlet IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  IF public.is_admin(p_user_id) THEN\r\n    RETURN true;\r\n  END IF;\r\n\r\n  RETURN (\r\n    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))\r\n    OR public.outlet_auth_user_matches(target_outlet, p_user_id)\r\n  );\r\nEND;\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "order_is_accessible"
        },
        {
            "arguments": "p_outlet_id uuid, p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(p_outlet_id uuid, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n\r\n  IF public.is_admin(p_user_id) THEN\r\n    RETURN true;\r\n  END IF;\r\n\r\n  RETURN EXISTS (\r\n    SELECT 1 FROM public.outlets o\r\n    WHERE o.id = p_outlet_id AND o.auth_user_id = p_user_id AND o.active\r\n  );\r\nEND;\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "outlet_auth_user_matches"
        },
        {
            "arguments": "p_outlet_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.outlet_default_warehouses(p_outlet_id uuid)\n RETURNS TABLE(default_sales_warehouse_id uuid, default_receiving_warehouse_id uuid)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  select owd.default_sales_warehouse_id, owd.default_receiving_warehouse_id\r\n  from public.outlet_warehouse_defaults owd\r\n  where owd.outlet_id = p_outlet_id;\r\n$function$\n",
            "return_type": "TABLE(default_sales_warehouse_id uuid, default_receiving_warehouse_id uuid)",
            "function_name": "outlet_default_warehouses"
        },
        {
            "arguments": "p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.place_order(p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS TABLE(order_id uuid, order_number text, created_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := (SELECT auth.uid());\r\n  v_now timestamptz := now();\r\n  v_order public.orders%ROWTYPE;\r\n  v_item jsonb;\r\n  v_qty numeric;\r\n  v_qty_cases numeric;\r\n  v_receiving_contains numeric;\r\nBEGIN\r\n  IF p_outlet_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet id required';\r\n  END IF;\r\n\r\n  IF NOT (\r\n    public.is_admin(v_uid)\r\n    OR p_outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))\r\n  ) THEN\r\n    RAISE EXCEPTION 'not authorized for outlet %', p_outlet_id;\r\n  END IF;\r\n\r\n  INSERT INTO public.orders(\r\n    outlet_id,\r\n    order_number,\r\n    status,\r\n    locked,\r\n    created_by,\r\n    tz,\r\n    pdf_path,\r\n    employee_signed_name,\r\n    employee_signature_path,\r\n    employee_signed_at,\r\n    updated_at,\r\n    created_at\r\n  ) VALUES (\r\n    p_outlet_id,\r\n    public.next_order_number(p_outlet_id),\r\n    'placed',\r\n    false,\r\n    v_uid,\r\n    COALESCE(current_setting('TIMEZONE', true), 'UTC'),\r\n    p_pdf_path,\r\n    COALESCE(NULLIF(p_employee_name, ''), p_employee_name),\r\n    NULLIF(p_signature_path, ''),\r\n    v_now,\r\n    v_now,\r\n    v_now\r\n  ) RETURNING * INTO v_order;\r\n\r\n  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP\r\n    IF (v_item ->> 'product_id') IS NULL THEN\r\n      RAISE EXCEPTION 'product_id is required for each line item';\r\n    END IF;\r\n\r\n    v_receiving_contains := NULLIF(v_item ->> 'receiving_contains', '')::numeric;\r\n    v_qty := COALESCE((v_item ->> 'qty')::numeric, 0);\r\n    v_qty_cases := COALESCE((v_item ->> 'qty_cases')::numeric, NULL);\r\n    IF v_qty_cases IS NULL AND v_receiving_contains IS NOT NULL AND v_receiving_contains > 0 THEN\r\n      v_qty_cases := v_qty / v_receiving_contains;\r\n    END IF;\r\n\r\n    INSERT INTO public.order_items(\r\n      order_id,\r\n      product_id,\r\n      variation_id,\r\n      warehouse_id,\r\n      name,\r\n      receiving_uom,\r\n      consumption_uom,\r\n      cost,\r\n      qty,\r\n      qty_cases,\r\n      receiving_contains,\r\n      amount\r\n    ) VALUES (\r\n      v_order.id,\r\n      (v_item ->> 'product_id')::uuid,\r\n      NULLIF(v_item ->> 'variation_id', '')::uuid,\r\n      NULLIF(v_item ->> 'warehouse_id', '')::uuid,\r\n      COALESCE(NULLIF(v_item ->> 'name', ''), 'Item'),\r\n      COALESCE(NULLIF(v_item ->> 'receiving_uom', ''), 'each'),\r\n      COALESCE(NULLIF(v_item ->> 'consumption_uom', ''), 'each'),\r\n      COALESCE((v_item ->> 'cost')::numeric, 0),\r\n      v_qty,\r\n      v_qty_cases,\r\n      v_receiving_contains,\r\n      COALESCE((v_item ->> 'cost')::numeric, 0) * v_qty\r\n    );\r\n  END LOOP;\r\n\r\n  order_id := v_order.id;\r\n  order_number := v_order.order_number;\r\n  created_at := v_order.created_at;\r\n  RETURN NEXT;\r\nEND;\r\n$function$\n",
            "return_type": "TABLE(order_id uuid, order_number text, created_at timestamp with time zone)",
            "function_name": "place_order"
        },
        {
            "arguments": "p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_damage_id uuid;\r\n  v_variant_key text;\r\nbegin\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse_id is required';\r\n  end if;\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one damage line is required';\r\n  end if;\r\n\r\n  insert into public.warehouse_damages(warehouse_id, note, context, created_by)\r\n  values (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())\r\n  returning id into v_damage_id;\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units,\r\n      nullif(elem->>'note', '') as line_note\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each damage line needs product_id and qty > 0';\r\n    end if;\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)\r\n    values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      public.normalize_variant_key(rec.variant_key),\r\n      -1 * rec.qty_units,\r\n      'damage',\r\n      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))\r\n    );\r\n  end loop;\r\n\r\n  return v_damage_id;\r\nend;\r\n$function$\n",
            "return_type": "uuid",
            "function_name": "record_damage"
        },
        {
            "arguments": "p_order_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.record_order_fulfillment(p_order_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_order public.orders%rowtype;\r\n  v_sales_wh uuid;\r\n  v_recv_wh uuid;\r\n  v_sources uuid[];\r\n  v_source uuid;\r\n  v_items jsonb;\r\nbegin\r\n  select * into v_order from public.orders where id = p_order_id;\r\n  if not found then\r\n    raise exception 'order % not found', p_order_id;\r\n  end if;\r\n\r\n  select default_sales_warehouse_id, default_receiving_warehouse_id\r\n    into v_sales_wh, v_recv_wh\r\n  from public.outlet_default_warehouses(v_order.outlet_id);\r\n\r\n  if v_recv_wh is null then\r\n    raise exception 'receiving warehouse not set for outlet %', v_order.outlet_id;\r\n  end if;\r\n\r\n  -- collect distinct source warehouses (line.warehouse_id else outlet default sales)\r\n  select array_agg(distinct coalesce(oi.warehouse_id, v_sales_wh))\r\n    into v_sources\r\n  from public.order_items oi\r\n  where oi.order_id = p_order_id;\r\n\r\n  if v_sources is null or array_length(v_sources,1) = 0 then\r\n    return; -- nothing to move\r\n  end if;\r\n\r\n  foreach v_source in array v_sources loop\r\n    if v_source is null then\r\n      raise exception 'source warehouse not set for order %', p_order_id;\r\n    end if;\r\n\r\n    -- build items for this source\r\n    select jsonb_agg(jsonb_build_object(\r\n             'product_id', oi.product_id,\r\n             'variant_key', public.normalize_variant_key(coalesce(nullif(oi.receiving_uom, ''), 'base')),\r\n             'qty', oi.qty\r\n           ))\r\n    into v_items\r\n    from public.order_items oi\r\n    where oi.order_id = p_order_id\r\n      and coalesce(oi.warehouse_id, v_sales_wh) = v_source\r\n      and oi.qty is not null\r\n      and oi.qty <> 0;\r\n\r\n    if v_items is null or jsonb_array_length(v_items) = 0 then\r\n      continue;\r\n    end if;\r\n\r\n    perform public.transfer_units_between_warehouses(\r\n      v_source,\r\n      v_recv_wh,\r\n      v_items,\r\n      'Auto-transfer on approval for order ' || coalesce(v_order.order_number, p_order_id::text)\r\n    );\r\n  end loop;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "record_order_fulfillment"
        },
        {
            "arguments": "p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_sale_price numeric DEFAULT NULL::numeric, p_vat_exc_price numeric DEFAULT NULL::numeric, p_flavour_price numeric DEFAULT NULL::numeric, p_flavour_id text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_sale_price numeric DEFAULT NULL::numeric, p_vat_exc_price numeric DEFAULT NULL::numeric, p_flavour_price numeric DEFAULT NULL::numeric, p_flavour_id text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS outlet_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_sale public.outlet_sales%rowtype;\r\n  v_route record;\r\n  v_deduct_outlet uuid;\r\n  v_deduct_wh uuid;\r\n  v_default_wh uuid;\r\n  v_deduct_enabled boolean;\r\n  v_variant_key text := public.normalize_variant_key(p_variant_key);\r\n  v_consumption_per_base numeric := 1;\r\n  v_consumption_unit text;\r\n  v_base_unit text;\r\n  v_effective_qty numeric;\r\nbegin\r\n  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then\r\n    raise exception 'outlet, item, qty required';\r\n  end if;\r\n\r\n  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled\r\n  from public.outlets where id = p_outlet_id;\r\n\r\n  select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled\r\n  into v_route\r\n  from public.outlet_item_routes\r\n  where outlet_id = p_outlet_id\r\n    and item_id = p_item_id\r\n    and normalized_variant_key = v_variant_key\r\n  limit 1;\r\n\r\n  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);\r\n\r\n  if v_deduct_enabled = false then\r\n    insert into public.outlet_sales(\r\n      outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,\r\n      is_production, flavour_id, warehouse_id, sold_at, created_by, context\r\n    ) values (\r\n      p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,\r\n      coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),\r\n      p_flavour_id, p_warehouse_id, p_sold_at, auth.uid(), p_context\r\n    ) returning * into v_sale;\r\n    return v_sale;\r\n  end if;\r\n\r\n  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);\r\n\r\n  select ow.warehouse_id\r\n  into v_default_wh\r\n  from public.outlet_warehouses ow\r\n  join public.warehouses w on w.id = ow.warehouse_id\r\n  where ow.outlet_id = v_deduct_outlet\r\n    and coalesce(w.active, true)\r\n  order by coalesce(w.name, ''), ow.warehouse_id\r\n  limit 1;\r\n\r\n  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);\r\n\r\n  if v_deduct_wh is null then\r\n    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;\r\n  end if;\r\n\r\n  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit, ci.base_unit\r\n  into v_consumption_per_base, v_consumption_unit, v_base_unit\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);\r\n\r\n  insert into public.outlet_sales(\r\n    outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,\r\n    is_production, flavour_id, warehouse_id, sold_at, created_by, context\r\n  ) values (\r\n    p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,\r\n    coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),\r\n    p_flavour_id, v_deduct_wh, p_sold_at, auth.uid(), p_context\r\n  ) returning * into v_sale;\r\n\r\n  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)\r\n  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)\r\n  on conflict (outlet_id, item_id, variant_key)\r\n  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,\r\n                updated_at = now();\r\n\r\n  insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n  values (\r\n    'warehouse',\r\n    v_deduct_wh,\r\n    p_item_id,\r\n    v_variant_key,\r\n    -1 * v_effective_qty,\r\n    'outlet_sale',\r\n    jsonb_build_object(\r\n      'sale_id', v_sale.id,\r\n      'outlet_id', p_outlet_id,\r\n      'sale_price', p_sale_price,\r\n      'vat_exc_price', p_vat_exc_price,\r\n      'flavour_id', p_flavour_id,\r\n      'uom_used', coalesce(v_consumption_unit, v_base_unit, 'each'),\r\n      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),\r\n      'source_qty_units', p_qty_units,\r\n      'sold_at', p_sold_at\r\n    ) || coalesce(p_context, '{}'),\r\n    p_sold_at\r\n  );\r\n\r\n  perform public.apply_recipe_deductions(\r\n    p_item_id,\r\n    p_qty_units,\r\n    v_deduct_wh,\r\n    v_variant_key,\r\n    jsonb_build_object(\r\n      'source','outlet_sale',\r\n      'outlet_id',p_outlet_id,\r\n      'deduct_outlet_id',v_deduct_outlet,\r\n      'warehouse_id',v_deduct_wh,\r\n      'sale_id',v_sale.id\r\n    ) || coalesce(p_context,'{}'),\r\n    0,\r\n    array[]::uuid[]\r\n  );\r\n\r\n  return v_sale;\r\nend;\r\n$function$\n",
            "return_type": "outlet_sales",
            "function_name": "record_outlet_sale"
        },
        {
            "arguments": "p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS outlet_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_sale public.outlet_sales%rowtype;\r\n  v_route record;\r\n  v_deduct_outlet uuid;\r\n  v_deduct_wh uuid;\r\n  v_default_wh uuid;\r\n  v_deduct_enabled boolean;\r\n  v_variant_key text := public.normalize_variant_key(p_variant_key);\r\n  v_consumption_per_base numeric := 1;\r\n  v_consumption_unit text;\r\n  v_base_unit text;\r\n  v_effective_qty numeric;\r\nbegin\r\n  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then\r\n    raise exception 'outlet, item, qty required';\r\n  end if;\r\n\r\n  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled\r\n  from public.outlets where id = p_outlet_id;\r\n\r\n  select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled\r\n  into v_route\r\n  from public.outlet_item_routes\r\n  where outlet_id = p_outlet_id\r\n    and item_id = p_item_id\r\n    and normalized_variant_key = v_variant_key\r\n  limit 1;\r\n\r\n  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);\r\n\r\n  if v_deduct_enabled = false then\r\n    insert into public.outlet_sales(\r\n      outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context\r\n    ) values (\r\n      p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),\r\n      p_warehouse_id, p_sold_at, auth.uid(), p_context\r\n    ) returning * into v_sale;\r\n    return v_sale;\r\n  end if;\r\n\r\n  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);\r\n\r\n  select ow.warehouse_id\r\n  into v_default_wh\r\n  from public.outlet_warehouses ow\r\n  join public.warehouses w on w.id = ow.warehouse_id\r\n  where ow.outlet_id = v_deduct_outlet\r\n    and coalesce(w.active, true)\r\n  order by coalesce(w.name, ''), ow.warehouse_id\r\n  limit 1;\r\n\r\n  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);\r\n\r\n  if v_deduct_wh is null then\r\n    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;\r\n  end if;\r\n\r\n  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit, ci.base_unit\r\n  into v_consumption_per_base, v_consumption_unit, v_base_unit\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);\r\n\r\n  insert into public.outlet_sales(\r\n    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context\r\n  ) values (\r\n    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),\r\n    v_deduct_wh, p_sold_at, auth.uid(), p_context\r\n  ) returning * into v_sale;\r\n\r\n  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)\r\n  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)\r\n  on conflict (outlet_id, item_id, variant_key)\r\n  do update set\r\n    consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,\r\n    updated_at = now();\r\n\r\n  insert into public.stock_ledger(\r\n    location_type,\r\n    warehouse_id,\r\n    item_id,\r\n    variant_key,\r\n    delta_units,\r\n    reason,\r\n    context,\r\n    occurred_at\r\n  ) values (\r\n    'warehouse',\r\n    v_deduct_wh,\r\n    p_item_id,\r\n    v_variant_key,\r\n    -1 * v_effective_qty,\r\n    'outlet_sale',\r\n    jsonb_build_object(\r\n      'sale_id', v_sale.id,\r\n      'outlet_id', p_outlet_id,\r\n      'uom_used', coalesce(v_consumption_unit, v_base_unit, 'each'),\r\n      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),\r\n      'source_qty_units', p_qty_units,\r\n      'sold_at', p_sold_at\r\n    ) || coalesce(p_context, '{}'),\r\n    p_sold_at\r\n  );\r\n\r\n  perform public.apply_recipe_deductions(\r\n    p_item_id,\r\n    p_qty_units,\r\n    v_deduct_wh,\r\n    v_variant_key,\r\n    jsonb_build_object(\r\n      'source','outlet_sale',\r\n      'outlet_id',p_outlet_id,\r\n      'deduct_outlet_id',v_deduct_outlet,\r\n      'warehouse_id',v_deduct_wh,\r\n      'sale_id',v_sale.id\r\n    ) || coalesce(p_context,'{}'),\r\n    0,\r\n    array[]::uuid[]\r\n  );\r\n\r\n  return v_sale;\r\nend;\r\n$function$\n",
            "return_type": "outlet_sales",
            "function_name": "record_outlet_sale"
        },
        {
            "arguments": "p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false",
            "definition": "CREATE OR REPLACE FUNCTION public.record_purchase_receipt(p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false)\n RETURNS warehouse_purchase_receipts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_receipt public.warehouse_purchase_receipts%rowtype;\r\n  v_reference text;\r\n  v_variant_key text;\r\n  v_occurred_at timestamptz;\r\nbegin\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse_id is required';\r\n  end if;\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one purchase item is required';\r\n  end if;\r\n\r\n  v_reference := coalesce(nullif(p_reference_code, ''), public.next_purchase_receipt_reference());\r\n\r\n  insert into public.warehouse_purchase_receipts(\r\n    warehouse_id,\r\n    supplier_id,\r\n    reference_code,\r\n    note,\r\n    auto_whatsapp,\r\n    context,\r\n    recorded_by\r\n  ) values (\r\n    p_warehouse_id,\r\n    p_supplier_id,\r\n    v_reference,\r\n    p_note,\r\n    coalesce(p_auto_whatsapp, false),\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) returning * into v_receipt;\r\n\r\n  v_occurred_at := coalesce(v_receipt.created_at, now());\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units,\r\n      coalesce(nullif(elem->>'qty_input_mode', ''), 'units') as qty_input_mode,\r\n      nullif(elem->>'unit_cost', '')::numeric as unit_cost\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each purchase line needs product_id and qty > 0';\r\n    end if;\r\n\r\n    v_variant_key := public.normalize_variant_key(rec.variant_key);\r\n\r\n    insert into public.warehouse_purchase_items(\r\n      receipt_id,\r\n      item_id,\r\n      variant_key,\r\n      qty_units,\r\n      qty_input_mode,\r\n      unit_cost\r\n    ) values (\r\n      v_receipt.id,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      rec.qty_input_mode,\r\n      rec.unit_cost\r\n    );\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      'purchase_receipt',\r\n      jsonb_build_object('receipt_id', v_receipt.id, 'reference_code', v_receipt.reference_code, 'supplier_id', p_supplier_id, 'receipt_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n  end loop;\r\n\r\n  return v_receipt;\r\nend;\r\n$function$\n",
            "return_type": "warehouse_purchase_receipts",
            "function_name": "record_purchase_receipt"
        },
        {
            "arguments": "p_period_id uuid, p_item_id uuid, p_qty numeric, p_variant_key text DEFAULT 'base'::text, p_kind text DEFAULT 'closing'::text, p_context jsonb DEFAULT '{}'::jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.record_stock_count(p_period_id uuid, p_item_id uuid, p_qty numeric, p_variant_key text DEFAULT 'base'::text, p_kind text DEFAULT 'closing'::text, p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS warehouse_stock_counts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_period public.warehouse_stock_periods%rowtype;\r\n  v_row public.warehouse_stock_counts%rowtype;\r\n  v_item_kind item_kind;\r\n  v_has_recipe boolean := false;\r\n  v_variant text := public.normalize_variant_key(p_variant_key);\r\nbegin\r\n  if not public.is_stocktake_user(auth.uid()) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_qty is null or p_qty < 0 then\r\n    raise exception 'qty must be >= 0';\r\n  end if;\r\n\r\n  select ci.item_kind,\r\n         exists (\r\n           select 1 from public.recipes r\r\n           where r.active and r.finished_item_id = p_item_id\r\n         )\r\n  into v_item_kind, v_has_recipe\r\n  from public.catalog_items ci\r\n  where ci.id = p_item_id;\r\n\r\n  if v_item_kind is null then\r\n    raise exception 'catalog item % not found for stock count', p_item_id;\r\n  end if;\r\n\r\n  if v_item_kind <> 'ingredient' and v_has_recipe then\r\n    raise exception 'stock counts are restricted to ingredient items or non-recipe items';\r\n  end if;\r\n\r\n  select * into v_period from public.warehouse_stock_periods where id = p_period_id;\r\n  if not found then\r\n    raise exception 'stock period not found';\r\n  end if;\r\n  if v_period.status <> 'open' then\r\n    raise exception 'stock period is not open';\r\n  end if;\r\n\r\n  if lower(coalesce(p_kind, '')) = 'opening' then\r\n    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))\r\n    on conflict (period_id, item_id, variant_key, kind)\r\n    do update set\r\n      counted_qty = excluded.counted_qty,\r\n      counted_by = excluded.counted_by,\r\n      counted_at = now(),\r\n      context = excluded.context\r\n    returning * into v_row;\r\n    return v_row;\r\n  end if;\r\n\r\n  -- Seed opening once if missing so expected_qty has a baseline\r\n  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n  values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}') || jsonb_build_object('seeded_opening', true))\r\n  on conflict (period_id, item_id, variant_key, kind) do nothing;\r\n\r\n  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n  values (p_period_id, p_item_id, v_variant, p_qty, p_kind, auth.uid(), coalesce(p_context, '{}'))\r\n  on conflict (period_id, item_id, variant_key, kind)\r\n  do update set\r\n    counted_qty = excluded.counted_qty,\r\n    counted_by = excluded.counted_by,\r\n    counted_at = now(),\r\n    context = excluded.context\r\n  returning * into v_row;\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
            "return_type": "warehouse_stock_counts",
            "function_name": "record_stock_count"
        },
        {
            "arguments": "p_item_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations(p_item_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  if p_item_id is null then\r\n    return;\r\n  end if;\r\n  update public.catalog_items ci\r\n  set has_variations = false,\r\n      updated_at = now()\r\n  where ci.id = p_item_id;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "refresh_catalog_has_variations"
        },
        {
            "arguments": "p_warehouse_id uuid, p_component_id uuid, p_variant_key text, p_delta_units numeric, p_source_ledger_id uuid, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[]",
            "definition": "CREATE OR REPLACE FUNCTION public.rollup_from_component(p_warehouse_id uuid, p_component_id uuid, p_variant_key text, p_delta_units numeric, p_source_ledger_id uuid, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[])\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_variant text := public.normalize_variant_key(coalesce(p_variant_key, 'base'));\r\n  v_produced numeric;\r\nbegin\r\n  if p_delta_units <= 0 then\r\n    return;\r\n  end if;\r\n  if p_depth > 6 then\r\n    return; -- safety guard\r\n  end if;\r\n  if p_component_id = any (p_seen) then\r\n    return; -- avoid cycles\r\n  end if;\r\n\r\n  for rec in\r\n    select\r\n      r.finished_item_id      as parent_item_id,\r\n      public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) as parent_variant,\r\n      r.qty_per_unit,\r\n      coalesce(r.yield_qty_units, 1) as yield_units,\r\n      ci.item_kind            as parent_kind\r\n    from public.recipes r\r\n    join public.catalog_items ci on ci.id = r.finished_item_id\r\n    where r.active\r\n      and r.ingredient_item_id = p_component_id\r\n      and r.recipe_for_kind = ci.item_kind\r\n  loop\r\n    if rec.qty_per_unit <= 0 or rec.yield_units <= 0 then\r\n      continue;\r\n    end if;\r\n\r\n    v_produced := (p_delta_units / rec.qty_per_unit) * rec.yield_units;\r\n\r\n    insert into public.stock_ledger(\r\n      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context\r\n    ) values (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.parent_item_id,\r\n      rec.parent_variant,\r\n      v_produced,\r\n      'rollup_production',\r\n      jsonb_build_object(\r\n        'source_ledger_id', p_source_ledger_id,\r\n        'component_id', p_component_id,\r\n        'component_delta', p_delta_units,\r\n        'qty_per_unit', rec.qty_per_unit,\r\n        'yield_units', rec.yield_units\r\n      )\r\n    );\r\n\r\n    perform public.rollup_from_component(\r\n      p_warehouse_id,\r\n      rec.parent_item_id,\r\n      rec.parent_variant,\r\n      v_produced,\r\n      p_source_ledger_id,\r\n      p_depth + 1,\r\n      array_append(p_seen, p_component_id)\r\n    );\r\n  end loop;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "rollup_from_component"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.rollup_on_raw_insert()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_kind item_kind;\r\nbegin\r\n  if new.location_type <> 'warehouse' or new.delta_units <= 0 then\r\n    return new;\r\n  end if;\r\n\r\n  select ci.item_kind into v_kind from public.catalog_items ci where ci.id = new.item_id;\r\n  if v_kind <> 'raw' then\r\n    return new;\r\n  end if;\r\n\r\n  perform public.rollup_from_component(\r\n    new.warehouse_id,\r\n    new.item_id,\r\n    new.variant_key,\r\n    new.delta_units,\r\n    new.id,\r\n    0,\r\n    array[new.item_id]\r\n  );\r\n  return new;\r\nend;\r\n$function$\n",
            "return_type": "trigger",
            "function_name": "rollup_on_raw_insert"
        },
        {
            "arguments": "p_warehouse_id uuid, p_note text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.start_stock_period(p_warehouse_id uuid, p_note text DEFAULT NULL::text)\n RETURNS warehouse_stock_periods\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_row public.warehouse_stock_periods%rowtype;\r\n  v_outlet uuid;\r\nbegin\r\n  if not public.is_stocktake_user(auth.uid()) then\r\n    raise exception 'not authorized';\r\n  end if;\r\n\r\n  if p_warehouse_id is null then\r\n    raise exception 'warehouse required';\r\n  end if;\r\n\r\n  if exists (\r\n    select 1 from public.warehouse_stock_periods wsp\r\n    where wsp.warehouse_id = p_warehouse_id and wsp.status = 'open'\r\n  ) then\r\n    raise exception 'open stock period already exists for this warehouse';\r\n  end if;\r\n\r\n  select ow.outlet_id\r\n  into v_outlet\r\n  from public.outlet_warehouses ow\r\n  join public.outlets o on o.id = ow.outlet_id\r\n  where ow.warehouse_id = p_warehouse_id\r\n    and coalesce(o.active, true)\r\n  order by coalesce(o.name, ''), ow.outlet_id\r\n  limit 1;\r\n\r\n  if v_outlet is null then\r\n    raise exception 'warehouse has no outlet mapping';\r\n  end if;\r\n\r\n  insert into public.warehouse_stock_periods(\r\n    warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number\r\n  )\r\n  values (\r\n    p_warehouse_id,\r\n    v_outlet,\r\n    'open',\r\n    auth.uid(),\r\n    p_note,\r\n    (\r\n      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)\r\n      from (\r\n        select wls.item_id, wls.variant_key, wls.net_units as opening_qty\r\n        from public.warehouse_layer_stock wls\r\n        join public.catalog_items ci on ci.id = wls.item_id and ci.item_kind = 'ingredient'\r\n        where wls.warehouse_id = p_warehouse_id\r\n      ) t\r\n    ),\r\n    public.next_stocktake_number()\r\n  )\r\n  returning * into v_row;\r\n\r\n  if coalesce(jsonb_array_length(v_row.opening_snapshot), 0) > 0 then\r\n    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)\r\n    select v_row.id, s.item_id, s.variant_key, s.opening_qty, 'opening', auth.uid(), jsonb_build_object('snapshot', true)\r\n    from jsonb_to_recordset(coalesce(v_row.opening_snapshot, '[]'::jsonb))\r\n      as s(item_id uuid, variant_key text, opening_qty numeric);\r\n  end if;\r\n\r\n  return v_row;\r\nend;\r\n$function$\n",
            "return_type": "warehouse_stock_periods",
            "function_name": "start_stock_period"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.stock_ledger_set_occurred_at()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  new.occurred_at := coalesce(\r\n    new.occurred_at,\r\n    (new.context->>'sold_at')::timestamptz,\r\n    (new.context->>'order_created_at')::timestamptz,\r\n    (new.context->>'movement_created_at')::timestamptz,\r\n    now()\r\n  );\r\n  return new;\r\nend;\r\n$function$\n",
            "return_type": "trigger",
            "function_name": "stock_ledger_set_occurred_at"
        },
        {
            "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.supervisor_approve_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nbegin\r\n  -- existing approval/lock/allocation\r\n  perform public.approve_lock_and_allocate_order(p_order_id, true);\r\n\r\n  -- auto-transfer\r\n  perform public.record_order_fulfillment(p_order_id);\r\n\r\n  -- preserve any signature/pdf updates you already store\r\n  update public.orders\r\n     set modified_by_supervisor = true,\r\n         modified_by_supervisor_name = coalesce(nullif(p_supervisor_name, ''), modified_by_supervisor_name),\r\n         pdf_path = coalesce(nullif(p_pdf_path, ''), pdf_path),\r\n         updated_at = now()\r\n   where id = p_order_id;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "supervisor_approve_order"
        },
        {
            "arguments": "p_warehouse_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)\n RETURNS TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    s.id,\r\n    s.name,\r\n    s.contact_name,\r\n    s.contact_phone,\r\n    s.contact_email,\r\n    s.active\r\n  FROM public.product_supplier_links psl\r\n  JOIN public.suppliers s ON s.id = psl.supplier_id\r\n  WHERE s.active\r\n    AND psl.active\r\n    AND (\r\n      p_warehouse_id IS NULL\r\n      OR psl.warehouse_id IS NULL\r\n      OR psl.warehouse_id = p_warehouse_id\r\n    );\r\n$function$\n",
            "return_type": "TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)",
            "function_name": "suppliers_for_warehouse"
        },
        {
            "arguments": "payload jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_outlet   uuid := (payload->>'outlet_id')::uuid;\r\n  v_source   text := payload->>'source_event_id';\r\n  v_order_id uuid;\r\n  v_now      timestamptz := now();\r\n  v_item     jsonb;\r\n  v_map      record;\r\n  v_qty      numeric;\r\n  v_branch   integer := nullif(payload->>'branch_id','')::integer;\r\nbegin\r\n  if v_outlet is null or v_source is null then\r\n    raise exception 'outlet_id and source_event_id are required';\r\n  end if;\r\n\r\n  select id into v_order_id from public.orders where source_event_id = v_source;\r\n  if found then return; end if;\r\n\r\n  insert into public.orders(\r\n    outlet_id, source_event_id, status, locked, branch_id, pos_branch_id,\r\n    order_type, bill_type, total_discount, total_discount_amount, total_gst,\r\n    service_charges, delivery_charges, tip, pos_fee, price_type,\r\n    customer_name, customer_phone, payments, raw_payload, created_at, updated_at\r\n  ) values (\r\n    v_outlet, v_source, 'placed', false, v_branch, v_branch,\r\n    payload->>'order_type', payload->>'bill_type',\r\n    (payload->>'total_discount')::numeric, (payload->>'total_discount_amount')::numeric,\r\n    (payload->>'total_gst')::numeric, (payload->>'service_charges')::numeric,\r\n    (payload->>'delivery_charges')::numeric, (payload->>'tip')::numeric,\r\n    (payload->>'pos_fee')::numeric, payload->>'price_type',\r\n    payload#>>'{customer,name}', payload#>>'{customer,phone}',\r\n    payload->'payments', payload, v_now, v_now\r\n  ) returning id into v_order_id;\r\n\r\n  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop\r\n    select catalog_item_id, catalog_variant_key, warehouse_id\r\n      into v_map\r\n    from public.pos_item_map\r\n    where outlet_id = v_outlet\r\n      and pos_item_id = v_item->>'pos_item_id'\r\n      and (pos_flavour_id is null or pos_flavour_id = nullif(v_item->>'flavour_id',''))\r\n    order by case when pos_flavour_id is null then 1 else 0 end\r\n    limit 1;\r\n    if not found then raise exception 'No mapping for pos_item_id % at outlet %', v_item->>'pos_item_id', v_outlet; end if;\r\n\r\n    v_qty := (v_item->>'quantity')::numeric;\r\n    if v_qty is null or v_qty <= 0 then raise exception 'quantity required for item %', v_item->>'pos_item_id'; end if;\r\n\r\n    perform public.record_outlet_sale(\r\n      v_outlet,\r\n      v_map.catalog_item_id,\r\n      v_qty,\r\n      v_map.catalog_variant_key,\r\n      false,\r\n      v_map.warehouse_id,\r\n      (payload->>'occurred_at')::timestamptz,\r\n      nullif(v_item->>'sale_price','')::numeric,\r\n      nullif(v_item->>'vat_exc_price','')::numeric,\r\n      coalesce(nullif(v_item->>'flavour_price','')::numeric, nullif(v_item->>'vat_exc_price','')::numeric),\r\n      nullif(v_item->>'flavour_id',''),\r\n      jsonb_build_object(\r\n        'pos_item_id', v_item->>'pos_item_id',\r\n        'source_event_id', v_source,\r\n        'order_id', v_order_id,\r\n        'sale_price', nullif(v_item->>'sale_price','')::numeric,\r\n        'vat_exc_price', nullif(v_item->>'vat_exc_price','')::numeric,\r\n        'flavour_id', nullif(v_item->>'flavour_id',''),\r\n        'flavour_price', coalesce(nullif(v_item->>'flavour_price','')::numeric, nullif(v_item->>'vat_exc_price','')::numeric)\r\n      )\r\n    );\r\n  end loop;\r\n\r\n  insert into public.pos_inventory_consumed(\r\n    source_event_id, outlet_id, order_id, raw_item_id, quantity_consumed, remaining_quantity,\r\n    occurred_at, pos_date, kdsid, typec, context, unassigned_branch_note\r\n  )\r\n  select\r\n    v_source || '-ic-' || coalesce(nullif(ic->>'pos_id',''), md5(ic::text)),\r\n    v_outlet,\r\n    v_order_id,\r\n    ic->>'raw_item_id',\r\n    (ic->>'quantity_consumed')::numeric,\r\n    nullif(ic->>'remaining_quantity','')::numeric,\r\n    coalesce((ic->>'occurred_at')::timestamptz, (ic->>'pos_date')::timestamptz, v_now),\r\n    coalesce((ic->>'pos_date')::date, v_now::date),\r\n    ic->>'kdsid',\r\n    ic->>'typec',\r\n    ic,\r\n    case\r\n      when ic ? 'branch_missing_note' then ic->>'branch_missing_note'\r\n      when coalesce(nullif(ic->>'branch_id',''),'') = '' then 'Branch missing on POS inventory row'\r\n      else null\r\n    end\r\n  from jsonb_array_elements(coalesce(payload->'inventory_consumed','[]'::jsonb)) ic\r\n  on conflict (source_event_id) do nothing;\r\nend;\r\n$function$\n",
            "return_type": "void",
            "function_name": "sync_pos_order"
        },
        {
            "arguments": "p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  rec record;\r\n  v_reference text;\r\n  v_transfer_id uuid;\r\n  v_variant_key text;\r\n  v_occurred_at timestamptz;\r\nbegin\r\n  if p_source is null or p_destination is null then\r\n    raise exception 'source and destination required';\r\n  end if;\r\n\r\n  if p_items is null or jsonb_array_length(p_items) = 0 then\r\n    raise exception 'at least one transfer line is required';\r\n  end if;\r\n\r\n  v_reference := public.next_transfer_reference();\r\n\r\n  insert into public.warehouse_transfers(\r\n    reference_code,\r\n    source_warehouse_id,\r\n    destination_warehouse_id,\r\n    note,\r\n    context,\r\n    created_by\r\n  ) values (\r\n    v_reference,\r\n    p_source,\r\n    p_destination,\r\n    p_note,\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) returning id, created_at into v_transfer_id, v_occurred_at;\r\n\r\n  v_occurred_at := coalesce(v_occurred_at, now());\r\n\r\n  for rec in\r\n    select\r\n      (elem->>'product_id')::uuid as item_id,\r\n      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,\r\n      (elem->>'qty')::numeric as qty_units\r\n    from jsonb_array_elements(p_items) elem\r\n  loop\r\n    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then\r\n      raise exception 'each line needs product_id and qty > 0';\r\n    end if;\r\n\r\n    v_variant_key := public.normalize_variant_key(rec.variant_key);\r\n\r\n    insert into public.warehouse_transfer_items(transfer_id, item_id, variant_key, qty_units)\r\n    values (v_transfer_id, rec.item_id, v_variant_key, rec.qty_units);\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_source,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      -1 * rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out', 'transfer_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n\r\n    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)\r\n    values (\r\n      'warehouse',\r\n      p_destination,\r\n      rec.item_id,\r\n      v_variant_key,\r\n      rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in', 'transfer_created_at', v_occurred_at),\r\n      v_occurred_at\r\n    );\r\n  end loop;\r\n\r\n  return v_reference;\r\nend;\r\n$function$\n",
            "return_type": "text",
            "function_name": "transfer_units_between_warehouses"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.whoami_outlet()\n RETURNS TABLE(outlet_id uuid, outlet_name text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n  RETURN QUERY\r\n  SELECT o.id, o.name\r\n  FROM public.outlets o\r\n  WHERE o.active AND o.auth_user_id = v_uid;\r\nEND;\r\n$function$\n",
            "return_type": "TABLE(outlet_id uuid, outlet_name text)",
            "function_name": "whoami_outlet"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.whoami_roles()\n RETURNS TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_uid uuid := auth.uid();\r\n  v_email text;\r\n  v_is_admin boolean := false;\r\n  v_roles text[] := ARRAY[]::text[];\r\n  v_outlets jsonb := '[]'::jsonb;\r\n  v_role_catalog jsonb := '[]'::jsonb;\r\nBEGIN\r\n  IF v_uid IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n\r\n  -- Qualify column to avoid ambiguity with output parameter \"email\"\r\n  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;\r\n  v_is_admin := EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = v_uid);\r\n\r\n  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'description' - 'active' - 'created_at'), '[]'::jsonb)\r\n    INTO v_role_catalog\r\n  FROM (\r\n    SELECT id, slug, normalized_slug, display_name\r\n    FROM public.roles\r\n    WHERE active\r\n    ORDER BY display_name\r\n  ) r;\r\n\r\n  SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])\r\n    INTO v_roles\r\n  FROM public.user_roles ur\r\n  JOIN public.roles r ON r.id = ur.role_id\r\n  WHERE ur.user_id = v_uid AND ur.outlet_id IS NULL;\r\n\r\n  IF v_is_admin THEN\r\n    v_roles := array_append(v_roles, 'admin');\r\n  END IF;\r\n\r\n  WITH raw_outlets AS (\r\n    SELECT o.id,\r\n           o.name,\r\n           TRUE AS via_auth_mapping\r\n    FROM public.outlets o\r\n    WHERE o.active AND o.auth_user_id = v_uid\r\n\r\n    UNION ALL\r\n\r\n    SELECT o.id,\r\n           o.name,\r\n           FALSE AS via_auth_mapping\r\n    FROM public.user_roles ur\r\n    JOIN public.outlets o ON o.id = ur.outlet_id\r\n    WHERE ur.user_id = v_uid AND o.active\r\n  ),\r\n  outlet_sources AS (\r\n    SELECT id,\r\n           name,\r\n           bool_or(via_auth_mapping) AS via_auth_mapping\r\n    FROM raw_outlets\r\n    GROUP BY id, name\r\n  )\r\n  SELECT COALESCE(\r\n    jsonb_agg(\r\n      jsonb_build_object(\r\n        'outlet_id', src.id,\r\n        'outlet_name', src.name,\r\n        'roles', (\r\n          SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])\r\n          FROM public.user_roles ur2\r\n          JOIN public.roles r ON r.id = ur2.role_id\r\n          WHERE ur2.user_id = v_uid AND ur2.outlet_id = src.id\r\n        ) || CASE WHEN src.via_auth_mapping THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END\r\n      )\r\n    ),\r\n    '[]'::jsonb\r\n  ) INTO v_outlets\r\n  FROM outlet_sources src;\r\n\r\n  RETURN QUERY SELECT v_uid, v_email, v_is_admin, v_roles, v_outlets, v_role_catalog;\r\nEND;\r\n$function$\n",
            "return_type": "TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb, role_catalog jsonb)",
            "function_name": "whoami_roles"
        }
    ],
    "publications": [
        {
            "tables": [
                {
                    "table": "orders",
                    "schema": "public"
                },
                {
                    "table": "order_items",
                    "schema": "public"
                },
                {
                    "table": "outlets",
                    "schema": "public"
                },
                {
                    "table": "warehouses",
                    "schema": "public"
                },
                {
                    "table": "outlet_stock_balances",
                    "schema": "public"
                },
                {
                    "table": "outlet_sales",
                    "schema": "public"
                },
                {
                    "table": "stock_ledger",
                    "schema": "public"
                }
            ],
            "publication_name": "supabase_realtime"
        },
        {
            "tables": [
                {
                    "table": "messages",
                    "schema": "realtime"
                }
            ],
            "publication_name": "supabase_realtime_messages_publication"
        }
    ]
}