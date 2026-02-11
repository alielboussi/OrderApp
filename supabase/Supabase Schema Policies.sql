[
  {
    "schemaname": "public",
    "tablename": "catalog_items",
    "policyname": "catalog_items_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "catalog_items",
    "policyname": "catalog_items_image_update_stocktake",
    "roles": "{public}",
    "cmd": "UPDATE",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))",
    "with_check_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))"
  },
  {
    "schemaname": "public",
    "tablename": "catalog_items",
    "policyname": "catalog_items_read_kiosk_anon",
    "roles": "{anon}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "catalog_items",
    "policyname": "catalog_items_select_active",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "((auth.uid() IS NOT NULL) AND active)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "catalog_items",
    "policyname": "catalog_items_select_any_auth",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "catalog_variants",
    "policyname": "catalog_variants_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "catalog_variants",
    "policyname": "catalog_variants_read_kiosk_anon",
    "roles": "{anon}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "catalog_variants",
    "policyname": "catalog_variants_select_active",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "((auth.uid() IS NOT NULL) AND active)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "catalog_variants",
    "policyname": "catalog_variants_select_any_auth",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "counter_values",
    "policyname": "counter_values_service_all",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "(auth.role() = 'service_role'::text)"
  },
  {
    "schemaname": "public",
    "tablename": "order_items",
    "policyname": "order_items_policy_delete",
    "roles": "{authenticated}",
    "cmd": "DELETE",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "order_items",
    "policyname": "order_items_policy_insert",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
  },
  {
    "schemaname": "public",
    "tablename": "order_items",
    "policyname": "order_items_policy_select",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "order_items",
    "policyname": "order_items_policy_update",
    "roles": "{authenticated}",
    "cmd": "UPDATE",
    "permissive": "PERMISSIVE",
    "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
    "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
  },
  {
    "schemaname": "public",
    "tablename": "orders",
    "policyname": "orders_policy_delete",
    "roles": "{authenticated}",
    "cmd": "DELETE",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "orders",
    "policyname": "orders_policy_insert",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))"
  },
  {
    "schemaname": "public",
    "tablename": "orders",
    "policyname": "orders_policy_select",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "orders",
    "policyname": "orders_policy_update",
    "roles": "{authenticated}",
    "cmd": "UPDATE",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": "is_admin(( SELECT auth.uid() AS uid))"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_item_routes",
    "policyname": "outlet_item_routes_select",
    "roles": "{public}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "((auth.role() = 'service_role'::text) OR (outlet_id = ANY (COALESCE(member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_item_routes",
    "policyname": "outlet_item_routes_select_stocktake",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_stocktake_user(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_item_routes",
    "policyname": "outlet_item_routes_write",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "(auth.role() = 'service_role'::text)"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_products",
    "policyname": "outlet_products_read_stocktake",
    "roles": "{public}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(auth.uid() IS NOT NULL)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_products",
    "policyname": "outlet_products_write_admin",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_sales",
    "policyname": "outlet_sales_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_sales",
    "policyname": "outlet_sales_insert_ops",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "(auth.uid() IS NOT NULL)"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_sales",
    "policyname": "outlet_sales_scoped",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stock_balances",
    "policyname": "outlet_balances_scoped",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stock_balances",
    "policyname": "outlet_stock_balances_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stock_balances",
    "policyname": "outlet_stock_balances_ro",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stocktakes",
    "policyname": "outlet_stocktakes_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stocktakes",
    "policyname": "outlet_stocktakes_ro",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_stocktakes",
    "policyname": "outlet_stocktakes_scoped",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlet_warehouses",
    "policyname": "outlet_warehouses_select_backoffice",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlet_warehouses",
    "policyname": "outlet_warehouses_select_stocktake",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (outlet_id = ANY (COALESCE(stocktake_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "outlets",
    "policyname": "outlets_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "outlets",
    "policyname": "outlets_select_stocktake",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "platform_admins",
    "policyname": "platform_admins_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "platform_admins",
    "policyname": "platform_admins_self_select",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "pos_item_map",
    "policyname": "pos_item_map_select_any_auth",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "pos_sync_failures",
    "policyname": "pos_sync_failures_service_only",
    "roles": "{service_role}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": "true"
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_admin_rw",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_edit_admin_or_transfer_mgr",
    "roles": "{public}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))"
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_read_admin_or_transfer_mgr",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_read_kiosk",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_read_kiosk_anon",
    "roles": "{anon}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_read_kiosk_anon_wh",
    "roles": "{anon}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_read_kiosk_wh",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "recipes",
    "policyname": "recipes_update_admin_or_transfer_mgr",
    "roles": "{authenticated}",
    "cmd": "UPDATE",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))"
  },
  {
    "schemaname": "public",
    "tablename": "roles",
    "policyname": "roles_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "roles",
    "policyname": "roles_select_all",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "stock_ledger",
    "policyname": "stock_ledger_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "stock_ledger",
    "policyname": "stock_ledger_stocktake_read",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_stocktake_user(auth.uid()) AND (location_type = 'warehouse'::text))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "user_roles",
    "policyname": "user_roles_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "user_roles",
    "policyname": "user_roles_self_select",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_backoffice_logs",
    "policyname": "wb_logs_insert_auth",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "(auth.uid() IS NOT NULL)"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_backoffice_logs",
    "policyname": "wb_logs_select_admin_backoffice",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_damages",
    "policyname": "warehouse_damages_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_purchase_items",
    "policyname": "warehouse_purchase_items_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_purchase_receipts",
    "policyname": "warehouse_purchase_receipts_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_stock_counts",
    "policyname": "stocktake_counts_admin",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "true"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_stock_counts",
    "policyname": "stocktake_counts_stocktakers",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_stocktake_user(auth.uid())",
    "with_check_expression": "is_stocktake_user(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_stock_periods",
    "policyname": "stocktake_periods_admin",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "true"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_stock_periods",
    "policyname": "stocktake_periods_stocktakers",
    "roles": "{public}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_stocktake_user(auth.uid())",
    "with_check_expression": "is_stocktake_user(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_stock_periods",
    "policyname": "warehouse_stock_periods_select_backoffice",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_transfer_items",
    "policyname": "warehouse_transfer_items_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouse_transfers",
    "policyname": "warehouse_transfers_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouses",
    "policyname": "warehouses_admin_rw",
    "roles": "{authenticated}",
    "cmd": "ALL",
    "permissive": "PERMISSIVE",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "warehouses",
    "policyname": "warehouses_select_backoffice",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schemaname": "public",
    "tablename": "warehouses",
    "policyname": "warehouses_select_stocktake",
    "roles": "{authenticated}",
    "cmd": "SELECT",
    "permissive": "PERMISSIVE",
    "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schemaname": "storage",
    "tablename": "objects",
    "policyname": "insert_orders_by_outlet_prefix",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "((bucket_id = 'orders'::text) AND (is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM unnest(member_outlet_ids(auth.uid())) oid(oid)\n  WHERE (objects.path_tokens[1] = (oid.oid)::text)))) AND (name ~ '^[0-9a-fA-F-]+/.+'::text))"
  },
  {
    "schemaname": "storage",
    "tablename": "objects",
    "policyname": "insert_signatures_by_outlet_prefix",
    "roles": "{authenticated}",
    "cmd": "INSERT",
    "permissive": "PERMISSIVE",
    "using_expression": null,
    "with_check_expression": "((bucket_id = 'signatures'::text) AND (is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM unnest(member_outlet_ids(auth.uid())) oid(oid)\n  WHERE (objects.path_tokens[1] = (oid.oid)::text)))) AND (name ~ '^[0-9a-fA-F-]+/.+'::text))"
  }
]