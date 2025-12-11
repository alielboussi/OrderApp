{
    "views": [
        {
            "view_name": "outlet_stock_summary",
            "definition": " SELECT osb.outlet_id,\n    osb.item_id,\n    ci.name AS item_name,\n    osb.variant_id,\n    cv.name AS variant_name,\n    osb.sent_units,\n    osb.consumed_units,\n    osb.on_hand_units\n   FROM outlet_stock_balances osb\n     LEFT JOIN catalog_items ci ON ci.id = osb.item_id\n     LEFT JOIN catalog_variants cv ON cv.id = osb.variant_id;"
        },
        {
            "view_name": "warehouse_layer_stock",
            "definition": " SELECT w.id AS warehouse_id,\n    w.stock_layer,\n    sl.item_id,\n    ci.name AS item_name,\n    sl.variant_id,\n    cv.name AS variant_name,\n    sum(sl.delta_units) AS net_units\n   FROM stock_ledger sl\n     JOIN warehouses w ON w.id = sl.warehouse_id\n     LEFT JOIN catalog_items ci ON ci.id = sl.item_id\n     LEFT JOIN catalog_variants cv ON cv.id = sl.variant_id\n  WHERE sl.location_type = 'warehouse'::text\n  GROUP BY w.id, w.stock_layer, sl.item_id, ci.name, sl.variant_id, cv.name;"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE UNIQUE INDEX catalog_variants_pkey ON public.catalog_variants USING btree (id)",
                    "index_name": "catalog_variants_pkey"
                },
                {
                    "definition": "CREATE INDEX idx_catalog_variants_locked_from ON public.catalog_variants USING btree (locked_from_warehouse_id)",
                    "index_name": "idx_catalog_variants_locked_from"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_catalog_variants_name_unique ON public.catalog_variants USING btree (item_id, lower(name))",
                    "index_name": "idx_catalog_variants_name_unique"
                },
                {
                    "definition": "CREATE UNIQUE INDEX idx_catalog_variants_sku_unique ON public.catalog_variants USING btree (lower(sku)) WHERE (sku IS NOT NULL)",
                    "index_name": "idx_catalog_variants_sku_unique"
                }
            ],
            "table_name": "catalog_variants",
            "constraints": [
                {
                    "definition": "CHECK (cost >= 0::numeric)",
                    "constraint_name": "catalog_variants_cost_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "catalog_variants_default_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "catalog_variants_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (locked_from_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "catalog_variants_locked_from_warehouse_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "CHECK (units_per_purchase_pack > 0::numeric)",
                    "constraint_name": "catalog_variants_package_contains_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "catalog_variants_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0::numeric)",
                    "constraint_name": "catalog_variants_purchase_unit_mass_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "CHECK (transfer_quantity > 0::numeric)",
                    "constraint_name": "catalog_variants_transfer_quantity_check",
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
                    "data_type": "uuid",
                    "column_name": "finished_item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "finished_variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_recipes_finished ON public.item_ingredient_recipes USING btree (finished_item_id, finished_variant_id)",
                    "index_name": "idx_recipes_finished"
                },
                {
                    "definition": "CREATE INDEX idx_recipes_ingredient ON public.item_ingredient_recipes USING btree (ingredient_item_id)",
                    "index_name": "idx_recipes_ingredient"
                },
                {
                    "definition": "CREATE INDEX idx_recipes_source_warehouse ON public.item_ingredient_recipes USING btree (source_warehouse_id)",
                    "index_name": "idx_recipes_source_warehouse"
                },
                {
                    "definition": "CREATE UNIQUE INDEX item_ingredient_recipes_pkey ON public.item_ingredient_recipes USING btree (id)",
                    "index_name": "item_ingredient_recipes_pkey"
                }
            ],
            "table_name": "item_ingredient_recipes",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (finished_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "item_ingredient_recipes_finished_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (finished_variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "item_ingredient_recipes_finished_variant_id_fkey",
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
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_item_transfer_profile_scope ON public.item_transfer_profiles USING btree (item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), from_warehouse_id, to_warehouse_id)",
                    "index_name": "ux_item_transfer_profile_scope"
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
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "item_transfer_profiles_variant_id_fkey",
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
                    "column_name": "item_id",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_item_warehouse_policy_scope ON public.item_warehouse_handling_policies USING btree (warehouse_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))",
                    "index_name": "ux_item_warehouse_policy_scope"
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
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "item_warehouse_handling_policies_variant_id_fkey",
                    "constraint_type": "f"
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
                    "column_name": "variation_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_order_items_item ON public.order_items USING btree (product_id, variation_id)",
                    "index_name": "idx_order_items_item"
                },
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
                    "definition": "FOREIGN KEY (variation_id) REFERENCES catalog_variants(id) ON DELETE RESTRICT",
                    "constraint_name": "order_items_variation_id_fkey",
                    "constraint_type": "f"
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
                    "column_name": "target_outlet_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "target_warehouse_id",
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_deduction_target ON public.outlet_deduction_mappings USING btree (target_outlet_id)",
                    "index_name": "idx_outlet_deduction_target"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_deduction_mappings_pkey ON public.outlet_deduction_mappings USING btree (outlet_id)",
                    "index_name": "outlet_deduction_mappings_pkey"
                }
            ],
            "table_name": "outlet_deduction_mappings",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_deduction_mappings_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id)",
                    "constraint_name": "outlet_deduction_mappings_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (target_outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_deduction_mappings_target_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (target_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL",
                    "constraint_name": "outlet_deduction_mappings_target_warehouse_id_fkey",
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
                    "definition": "CREATE UNIQUE INDEX outlet_order_counters_pkey ON public.outlet_order_counters USING btree (outlet_id)",
                    "index_name": "outlet_order_counters_pkey"
                }
            ],
            "table_name": "outlet_order_counters",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_order_counters_outlet_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (outlet_id)",
                    "constraint_name": "outlet_order_counters_pkey",
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
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_sales_item ON public.outlet_sales USING btree (item_id, variant_id)",
                    "index_name": "idx_outlet_sales_item"
                },
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
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_sales_variant_id_fkey",
                    "constraint_type": "f"
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
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_stock_balances_item ON public.outlet_stock_balances USING btree (item_id, variant_id)",
                    "index_name": "idx_outlet_stock_balances_item"
                },
                {
                    "definition": "CREATE INDEX idx_outlet_stock_balances_outlet ON public.outlet_stock_balances USING btree (outlet_id)",
                    "index_name": "idx_outlet_stock_balances_outlet"
                },
                {
                    "definition": "CREATE UNIQUE INDEX outlet_stock_balances_pkey ON public.outlet_stock_balances USING btree (id)",
                    "index_name": "outlet_stock_balances_pkey"
                },
                {
                    "definition": "CREATE UNIQUE INDEX ux_outlet_stock_balances_scope ON public.outlet_stock_balances USING btree (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))",
                    "index_name": "ux_outlet_stock_balances_scope"
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
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "outlet_stock_balances_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stock_balances_variant_id_fkey",
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
                    "default": null,
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_outlet_stocktakes_item ON public.outlet_stocktakes USING btree (item_id, variant_id)",
                    "index_name": "idx_outlet_stocktakes_item"
                },
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
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "outlet_stocktakes_variant_id_fkey",
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
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                    "definition": "CREATE INDEX idx_product_supplier_links_variant ON public.product_supplier_links USING btree (variant_id)",
                    "index_name": "idx_product_supplier_links_variant"
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
                    "definition": "CREATE UNIQUE INDEX ux_supplier_item_variant_warehouse ON public.product_supplier_links USING btree (supplier_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid))",
                    "index_name": "ux_supplier_item_variant_warehouse"
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
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "product_supplier_links_variant_id_fkey",
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
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "stock_ledger_variant_id_fkey",
                    "constraint_type": "f"
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
                    "column_name": "damage_id",
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
                    "column_name": "variant_id",
                    "is_nullable": "YES"
                },
                {
                    "default": null,
                    "data_type": "numeric",
                    "column_name": "qty_units",
                    "is_nullable": "NO"
                },
                {
                    "default": null,
                    "data_type": "text",
                    "column_name": "note",
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
                    "definition": "CREATE INDEX idx_damage_items_damage ON public.warehouse_damage_items USING btree (damage_id)",
                    "index_name": "idx_damage_items_damage"
                },
                {
                    "definition": "CREATE INDEX idx_damage_items_item ON public.warehouse_damage_items USING btree (item_id, variant_id)",
                    "index_name": "idx_damage_items_item"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_damage_items_pkey ON public.warehouse_damage_items USING btree (id)",
                    "index_name": "warehouse_damage_items_pkey"
                }
            ],
            "table_name": "warehouse_damage_items",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (damage_id) REFERENCES warehouse_damages(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_damage_items_damage_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_damage_items_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_damage_items_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "CHECK (qty_units > 0::numeric)",
                    "constraint_name": "warehouse_damage_items_qty_units_check",
                    "constraint_type": "c"
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_damage_items_variant_id_fkey",
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
                    "column_name": "warehouse_id",
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
                    "column_name": "variant_id",
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
                    "definition": "CREATE UNIQUE INDEX ux_warehouse_defaults_item_variant ON public.warehouse_defaults USING btree (item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))",
                    "index_name": "ux_warehouse_defaults_item_variant"
                },
                {
                    "definition": "CREATE UNIQUE INDEX warehouse_defaults_pkey ON public.warehouse_defaults USING btree (id)",
                    "index_name": "warehouse_defaults_pkey"
                }
            ],
            "table_name": "warehouse_defaults",
            "constraints": [
                {
                    "definition": "FOREIGN KEY (item_id) REFERENCES catalog_items(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_defaults_item_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_defaults_pkey",
                    "constraint_type": "p"
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_defaults_variant_id_fkey",
                    "constraint_type": "f"
                },
                {
                    "definition": "FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE",
                    "constraint_name": "warehouse_defaults_warehouse_id_fkey",
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
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_purchase_items_item ON public.warehouse_purchase_items USING btree (item_id, variant_id)",
                    "index_name": "idx_purchase_items_item"
                },
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
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_purchase_items_variant_id_fkey",
                    "constraint_type": "f"
                }
            ],
            "row_security": true
        },
        {
            "columns": [
                {
                    "default": "1",
                    "data_type": "integer",
                    "column_name": "id",
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
                    "definition": "CREATE UNIQUE INDEX warehouse_purchase_receipt_counters_pkey ON public.warehouse_purchase_receipt_counters USING btree (id)",
                    "index_name": "warehouse_purchase_receipt_counters_pkey"
                }
            ],
            "table_name": "warehouse_purchase_receipt_counters",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_purchase_receipt_counters_pkey",
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
                    "default": "1",
                    "data_type": "integer",
                    "column_name": "id",
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
                    "definition": "CREATE UNIQUE INDEX warehouse_transfer_counters_pkey ON public.warehouse_transfer_counters USING btree (id)",
                    "index_name": "warehouse_transfer_counters_pkey"
                }
            ],
            "table_name": "warehouse_transfer_counters",
            "constraints": [
                {
                    "definition": "PRIMARY KEY (id)",
                    "constraint_name": "warehouse_transfer_counters_pkey",
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
                    "data_type": "uuid",
                    "column_name": "variant_id",
                    "is_nullable": "YES"
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
                }
            ],
            "indexes": [
                {
                    "definition": "CREATE INDEX idx_transfer_items_item ON public.warehouse_transfer_items USING btree (item_id, variant_id)",
                    "index_name": "idx_transfer_items_item"
                },
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
                },
                {
                    "definition": "FOREIGN KEY (variant_id) REFERENCES catalog_variants(id) ON DELETE RESTRICT",
                    "constraint_name": "warehouse_transfer_items_variant_id_fkey",
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
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "catalog_variants",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "catalog_variants_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "((auth.uid() IS NOT NULL) AND active)",
            "roles": [
                "authenticated"
            ],
            "table_name": "catalog_variants",
            "with_check": null,
            "policy_name": "catalog_variants_select_active"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "item_ingredient_recipes",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "item_recipes_admin_rw"
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
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "public"
            ],
            "table_name": "outlet_deduction_mappings",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_deduction_mappings_admin_rw"
        },
        {
            "cmd": "ALL",
            "qual": "is_admin(auth.uid())",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlet_order_counters",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlet_order_counters_admin_rw"
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
                "authenticated"
            ],
            "table_name": "outlets",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "outlets_admin_rw"
        },
        {
            "cmd": "SELECT",
            "qual": "(is_admin(auth.uid()) OR (id = ANY (member_outlet_ids(auth.uid()))))",
            "roles": [
                "authenticated"
            ],
            "table_name": "outlets",
            "with_check": null,
            "policy_name": "outlets_select_scoped"
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
            "table_name": "warehouse_damage_items",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_damage_items_admin_rw"
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
                "public"
            ],
            "table_name": "warehouse_defaults",
            "with_check": "is_admin(auth.uid())",
            "policy_name": "warehouse_defaults_admin_rw"
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
            "qual": "(auth.uid() IS NOT NULL)",
            "roles": [
                "authenticated"
            ],
            "table_name": "warehouses",
            "with_check": null,
            "policy_name": "warehouses_select_scoped"
        }
    ],
    "triggers": [
        {
            "timing": "AFTER",
            "condition": null,
            "statement": "EXECUTE FUNCTION catalog_variants_flag_sync()",
            "manipulation": "INSERT",
            "trigger_name": "trg_catalog_variants_flag_sync"
        },
        {
            "timing": "AFTER",
            "condition": null,
            "statement": "EXECUTE FUNCTION catalog_variants_flag_sync()",
            "manipulation": "DELETE",
            "trigger_name": "trg_catalog_variants_flag_sync"
        },
        {
            "timing": "AFTER",
            "condition": null,
            "statement": "EXECUTE FUNCTION catalog_variants_flag_sync()",
            "manipulation": "UPDATE",
            "trigger_name": "trg_catalog_variants_flag_sync"
        }
    ],
    "functions": [
        {
            "arguments": "p_item_id uuid, p_qty_units numeric, p_warehouse_id uuid, p_variant_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(p_item_id uuid, p_qty_units numeric, p_warehouse_id uuid, p_variant_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  rec record;\r\nBEGIN\r\n  IF p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN\r\n    RAISE EXCEPTION 'item + qty required for recipe deductions';\r\n  END IF;\r\n\r\n  IF p_warehouse_id IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse required for recipe deductions';\r\n  END IF;\r\n\r\n  FOR rec IN\r\n    SELECT ingredient_item_id, qty_per_unit\r\n    FROM public.item_ingredient_recipes\r\n    WHERE finished_item_id = p_item_id\r\n      AND (finished_variant_id IS NULL OR finished_variant_id = p_variant_id)\r\n      AND active\r\n  LOOP\r\n    INSERT INTO public.stock_ledger(\r\n      location_type,\r\n      warehouse_id,\r\n      item_id,\r\n      variant_id,\r\n      delta_units,\r\n      reason,\r\n      context\r\n    ) VALUES (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.ingredient_item_id,\r\n      NULL,\r\n      -1 * (p_qty_units * rec.qty_per_unit),\r\n      'recipe_consumption',\r\n      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units) || coalesce(p_context, '{}')\r\n    );\r\n  END LOOP;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "apply_recipe_deductions"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.catalog_variants_flag_sync()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_new uuid;\r\n  v_old uuid;\r\nBEGIN\r\n  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.item_id ELSE NULL END;\r\n  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.item_id ELSE NULL END;\r\n\r\n  IF v_new IS NOT NULL THEN\r\n    PERFORM public.refresh_catalog_has_variations(v_new);\r\n  END IF;\r\n  IF v_old IS NOT NULL AND (v_new IS NULL OR v_old <> v_new) THEN\r\n    PERFORM public.refresh_catalog_has_variations(v_old);\r\n  END IF;\r\n\r\n  IF TG_OP = 'DELETE' THEN\r\n    RETURN OLD;\r\n  END IF;\r\n  RETURN NEW;\r\nEND;\r\n$function$\n",
            "return_type": "trigger",
            "function_name": "catalog_variants_flag_sync"
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
            "arguments": "p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_user_id IS NULL THEN\r\n    RETURN false;\r\n  END IF;\r\n  RETURN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_user_id);\r\nEND;\r\n$function$\n",
            "return_type": "boolean",
            "function_name": "is_admin"
        },
        {
            "arguments": "p_order_id uuid, p_supervisor_name text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.mark_order_modified(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  UPDATE public.orders\r\n  SET modified_by_supervisor = true,\r\n      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),\r\n      updated_at = now()\r\n  WHERE id = p_order_id;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "mark_order_modified"
        },
        {
            "arguments": "p_user_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)\n RETURNS uuid[]\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT COALESCE(\r\n    CASE\r\n      WHEN p_user_id IS NULL THEN NULL\r\n      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)\r\n      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)\r\n    END,\r\n    '{}'\r\n  );\r\n$function$\n",
            "return_type": "uuid[]",
            "function_name": "member_outlet_ids"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.member_outlet_ids()\n RETURNS SETOF uuid\n LANGUAGE sql\n STABLE\n SET search_path TO 'pg_temp'\nAS $function$\r\n  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));\r\n$function$\n",
            "return_type": "SETOF uuid",
            "function_name": "member_outlet_ids"
        },
        {
            "arguments": "p_outlet_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_prefix text;\r\n  v_next bigint;\r\nBEGIN\r\n  IF p_outlet_id IS NULL THEN\r\n    RAISE EXCEPTION 'outlet id required for numbering';\r\n  END IF;\r\n\r\n  INSERT INTO public.outlet_order_counters(outlet_id, last_value)\r\n  VALUES (p_outlet_id, 1)\r\n  ON CONFLICT (outlet_id)\r\n  DO UPDATE SET last_value = public.outlet_order_counters.last_value + 1,\r\n                updated_at = now()\r\n  RETURNING last_value INTO v_next;\r\n\r\n  SELECT COALESCE(NULLIF(o.code, ''), substr(o.id::text, 1, 4)) INTO v_prefix\r\n  FROM public.outlets o\r\n  WHERE o.id = p_outlet_id;\r\n\r\n  v_prefix := COALESCE(v_prefix, 'OUT');\r\n  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));\r\n  RETURN v_prefix || '-' || lpad(v_next::text, 4, '0');\r\nEND;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_order_number"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.next_purchase_receipt_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_next bigint;\r\nBEGIN\r\n  INSERT INTO public.warehouse_purchase_receipt_counters(id, last_value)\r\n  VALUES (1, 1)\r\n  ON CONFLICT (id)\r\n  DO UPDATE SET last_value = public.warehouse_purchase_receipt_counters.last_value + 1,\r\n                updated_at = now()\r\n  RETURNING last_value INTO v_next;\r\n\r\n  RETURN 'PR-' || lpad(v_next::text, 6, '0');\r\nEND;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_purchase_receipt_reference"
        },
        {
            "arguments": "",
            "definition": "CREATE OR REPLACE FUNCTION public.next_transfer_reference()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_next bigint;\r\nBEGIN\r\n  INSERT INTO public.warehouse_transfer_counters(id, last_value)\r\n  VALUES (1, 1)\r\n  ON CONFLICT (id)\r\n  DO UPDATE SET last_value = public.warehouse_transfer_counters.last_value + 1,\r\n                updated_at = now()\r\n  RETURNING last_value INTO v_next;\r\n\r\n  RETURN 'WT-' || lpad(v_next::text, 6, '0');\r\nEND;\r\n$function$\n",
            "return_type": "text",
            "function_name": "next_transfer_reference"
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
            "arguments": "p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  rec record;\r\n  v_damage_id uuid;\r\nBEGIN\r\n  IF p_warehouse_id IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse_id is required';\r\n  END IF;\r\n\r\n  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'at least one damage line is required';\r\n  END IF;\r\n\r\n  INSERT INTO public.warehouse_damages(warehouse_id, note, context, created_by)\r\n  VALUES (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())\r\n  RETURNING id INTO v_damage_id;\r\n\r\n  FOR rec IN\r\n    SELECT\r\n      (elem->>'product_id')::uuid AS item_id,\r\n      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,\r\n      (elem->>'qty')::numeric AS qty_units,\r\n      NULLIF(elem->>'note', '') AS line_note\r\n    FROM jsonb_array_elements(p_items) elem\r\n  LOOP\r\n    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN\r\n      RAISE EXCEPTION 'each damage line needs product_id and qty > 0';\r\n    END IF;\r\n\r\n    INSERT INTO public.warehouse_damage_items(damage_id, item_id, variant_id, qty_units, note)\r\n    VALUES (v_damage_id, rec.item_id, rec.variant_id, rec.qty_units, rec.line_note);\r\n\r\n    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)\r\n    VALUES (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      rec.variant_id,\r\n      -1 * rec.qty_units,\r\n      'damage',\r\n      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))\r\n    );\r\n  END LOOP;\r\n\r\n  RETURN v_damage_id;\r\nEND;\r\n$function$\n",
            "return_type": "uuid",
            "function_name": "record_damage"
        },
        {
            "arguments": "p_order_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.record_order_fulfillment(p_order_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  oi record;\r\n  v_order public.orders%ROWTYPE;\r\n  v_wh uuid;\r\nBEGIN\r\n  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;\r\n  IF NOT FOUND THEN\r\n    RAISE EXCEPTION 'order % not found', p_order_id;\r\n  END IF;\r\n\r\n  FOR oi IN\r\n    SELECT oi.id, oi.order_id, oi.product_id AS item_id, oi.variation_id AS variant_id, oi.qty, oi.warehouse_id\r\n    FROM public.order_items oi\r\n    WHERE oi.order_id = p_order_id AND oi.qty > 0\r\n  LOOP\r\n    v_wh := coalesce(oi.warehouse_id, (\r\n      SELECT wd.warehouse_id FROM public.warehouse_defaults wd\r\n      WHERE wd.item_id = oi.item_id AND (wd.variant_id IS NULL OR wd.variant_id = oi.variant_id)\r\n      ORDER BY wd.variant_id NULLS LAST LIMIT 1\r\n    ));\r\n\r\n    IF v_wh IS NULL THEN\r\n      RAISE EXCEPTION 'no warehouse mapping for item %', oi.item_id;\r\n    END IF;\r\n\r\n    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)\r\n    VALUES ('warehouse', v_wh, oi.item_id, oi.variant_id, -1 * oi.qty, 'order_fulfillment', jsonb_build_object('order_id', p_order_id, 'order_item_id', oi.id));\r\n\r\n    INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)\r\n    VALUES (v_order.outlet_id, oi.item_id, oi.variant_id, oi.qty, 0)\r\n    ON CONFLICT (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))\r\n    DO UPDATE SET sent_units = public.outlet_stock_balances.sent_units + EXCLUDED.sent_units,\r\n                  updated_at = now();\r\n  END LOOP;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "record_order_fulfillment"
        },
        {
            "arguments": "p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_id uuid DEFAULT NULL::uuid, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb",
            "definition": "CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_id uuid DEFAULT NULL::uuid, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb)\n RETURNS outlet_sales\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  v_sale public.outlet_sales%ROWTYPE;\r\n  v_map record;\r\n  v_deduct_outlet uuid;\r\n  v_deduct_wh uuid;\r\nBEGIN\r\n  IF p_outlet_id IS NULL OR p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN\r\n    RAISE EXCEPTION 'outlet, item, qty required';\r\n  END IF;\r\n\r\n  SELECT outlet_id, target_outlet_id, target_warehouse_id INTO v_map\r\n  FROM public.outlet_deduction_mappings\r\n  WHERE outlet_id = p_outlet_id;\r\n\r\n  v_deduct_outlet := coalesce(v_map.target_outlet_id, p_outlet_id);\r\n  v_deduct_wh := coalesce(p_warehouse_id, v_map.target_warehouse_id);\r\n\r\n  INSERT INTO public.outlet_sales(\r\n    outlet_id, item_id, variant_id, qty_units, is_production, warehouse_id, sold_at, created_by, context\r\n  ) VALUES (\r\n    p_outlet_id, p_item_id, p_variant_id, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context\r\n  ) RETURNING * INTO v_sale;\r\n\r\n  INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)\r\n  VALUES (p_outlet_id, p_item_id, p_variant_id, 0, p_qty_units)\r\n  ON CONFLICT (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))\r\n  DO UPDATE SET\r\n    consumed_units = public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units,\r\n    updated_at = now();\r\n\r\n  IF coalesce(p_is_production, false) THEN\r\n    PERFORM public.apply_recipe_deductions(\r\n      p_item_id,\r\n      p_qty_units,\r\n      v_deduct_wh,\r\n      p_variant_id,\r\n      jsonb_build_object('source', 'outlet_sale', 'outlet_id', p_outlet_id, 'deduct_outlet_id', v_deduct_outlet, 'sale_id', v_sale.id)\r\n    );\r\n  END IF;\r\n\r\n  RETURN v_sale;\r\nEND;\r\n$function$\n",
            "return_type": "outlet_sales",
            "function_name": "record_outlet_sale"
        },
        {
            "arguments": "p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false",
            "definition": "CREATE OR REPLACE FUNCTION public.record_purchase_receipt(p_warehouse_id uuid, p_items jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_reference_code text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_auto_whatsapp boolean DEFAULT false)\n RETURNS warehouse_purchase_receipts\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  rec record;\r\n  v_receipt public.warehouse_purchase_receipts%ROWTYPE;\r\n  v_reference text;\r\nBEGIN\r\n  IF p_warehouse_id IS NULL THEN\r\n    RAISE EXCEPTION 'warehouse_id is required';\r\n  END IF;\r\n\r\n  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'at least one purchase item is required';\r\n  END IF;\r\n\r\n  v_reference := COALESCE(NULLIF(p_reference_code, ''), public.next_purchase_receipt_reference());\r\n\r\n  INSERT INTO public.warehouse_purchase_receipts(\r\n    warehouse_id,\r\n    supplier_id,\r\n    reference_code,\r\n    note,\r\n    auto_whatsapp,\r\n    context,\r\n    recorded_by\r\n  ) VALUES (\r\n    p_warehouse_id,\r\n    p_supplier_id,\r\n    v_reference,\r\n    p_note,\r\n    coalesce(p_auto_whatsapp, false),\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) RETURNING * INTO v_receipt;\r\n\r\n  FOR rec IN\r\n    SELECT\r\n      (elem->>'product_id')::uuid AS item_id,\r\n      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,\r\n      (elem->>'qty')::numeric AS qty_units,\r\n      COALESCE(NULLIF(elem->>'qty_input_mode', ''), 'units') AS qty_input_mode,\r\n      NULLIF(elem->>'unit_cost', '')::numeric AS unit_cost\r\n    FROM jsonb_array_elements(p_items) elem\r\n  LOOP\r\n    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN\r\n      RAISE EXCEPTION 'each purchase line needs product_id and qty > 0';\r\n    END IF;\r\n\r\n    INSERT INTO public.warehouse_purchase_items(\r\n      receipt_id,\r\n      item_id,\r\n      variant_id,\r\n      qty_units,\r\n      qty_input_mode,\r\n      unit_cost\r\n    ) VALUES (\r\n      v_receipt.id,\r\n      rec.item_id,\r\n      rec.variant_id,\r\n      rec.qty_units,\r\n      rec.qty_input_mode,\r\n      rec.unit_cost\r\n    );\r\n\r\n    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)\r\n    VALUES (\r\n      'warehouse',\r\n      p_warehouse_id,\r\n      rec.item_id,\r\n      rec.variant_id,\r\n      rec.qty_units,\r\n      'purchase_receipt',\r\n      jsonb_build_object('receipt_id', v_receipt.id, 'reference_code', v_receipt.reference_code, 'supplier_id', p_supplier_id)\r\n    );\r\n  END LOOP;\r\n\r\n  RETURN v_receipt;\r\nEND;\r\n$function$\n",
            "return_type": "warehouse_purchase_receipts",
            "function_name": "record_purchase_receipt"
        },
        {
            "arguments": "p_item_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations(p_item_id uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nBEGIN\r\n  IF p_item_id IS NULL THEN\r\n    RETURN;\r\n  END IF;\r\n  UPDATE public.catalog_items ci\r\n  SET has_variations = EXISTS (\r\n        SELECT 1 FROM public.catalog_variants v\r\n      WHERE v.item_id = ci.id AND v.active AND v.outlet_order_visible\r\n      ),\r\n      updated_at = now()\r\n  WHERE ci.id = p_item_id;\r\nEND;\r\n$function$\n",
            "return_type": "void",
            "function_name": "refresh_catalog_has_variations"
        },
        {
            "arguments": "p_warehouse_id uuid",
            "definition": "CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)\n RETURNS TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\n  SELECT DISTINCT\r\n    s.id,\r\n    s.name,\r\n    s.contact_name,\r\n    s.contact_phone,\r\n    s.contact_email,\r\n    s.active\r\n  FROM public.product_supplier_links psl\r\n  JOIN public.suppliers s ON s.id = psl.supplier_id\r\n  WHERE s.active\r\n    AND psl.active\r\n    AND (\r\n      p_warehouse_id IS NULL\r\n      OR psl.warehouse_id IS NULL\r\n      OR psl.warehouse_id = p_warehouse_id\r\n    );\r\n$function$\n",
            "return_type": "TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean)",
            "function_name": "suppliers_for_warehouse"
        },
        {
            "arguments": "p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text",
            "definition": "CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text)\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\nDECLARE\r\n  rec record;\r\n  v_transfer_id uuid;\r\n  v_reference text;\r\nBEGIN\r\n  IF p_source IS NULL OR p_destination IS NULL THEN\r\n    RAISE EXCEPTION 'source and destination are required';\r\n  END IF;\r\n\r\n  IF p_source = p_destination THEN\r\n    RAISE EXCEPTION 'source and destination cannot match';\r\n  END IF;\r\n\r\n  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN\r\n    RAISE EXCEPTION 'at least one line item is required';\r\n  END IF;\r\n\r\n  v_reference := public.next_transfer_reference();\r\n\r\n  INSERT INTO public.warehouse_transfers(\r\n    reference_code,\r\n    source_warehouse_id,\r\n    destination_warehouse_id,\r\n    note,\r\n    context,\r\n    created_by\r\n  ) VALUES (\r\n    v_reference,\r\n    p_source,\r\n    p_destination,\r\n    p_note,\r\n    coalesce(p_items, '[]'::jsonb),\r\n    auth.uid()\r\n  ) RETURNING id INTO v_transfer_id;\r\n\r\n  FOR rec IN\r\n    SELECT\r\n      (elem->>'product_id')::uuid AS item_id,\r\n      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,\r\n      (elem->>'qty')::numeric AS qty_units\r\n    FROM jsonb_array_elements(p_items) elem\r\n  LOOP\r\n    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN\r\n      RAISE EXCEPTION 'each line needs product_id and qty > 0';\r\n    END IF;\r\n\r\n    INSERT INTO public.warehouse_transfer_items(transfer_id, item_id, variant_id, qty_units)\r\n    VALUES (v_transfer_id, rec.item_id, rec.variant_id, rec.qty_units);\r\n\r\n    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)\r\n    VALUES (\r\n      'warehouse',\r\n      p_source,\r\n      rec.item_id,\r\n      rec.variant_id,\r\n      -1 * rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out')\r\n    );\r\n\r\n    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)\r\n    VALUES (\r\n      'warehouse',\r\n      p_destination,\r\n      rec.item_id,\r\n      rec.variant_id,\r\n      rec.qty_units,\r\n      'warehouse_transfer',\r\n      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in')\r\n    );\r\n  END LOOP;\r\n\r\n  RETURN v_reference;\r\nEND;\r\n$function$\n",
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
        }
    ]
}
