[
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_image_update_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))",
    "with_check_expression": "(is_admin(auth.uid()) OR has_stocktake_role(auth.uid()))"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_read_kiosk_anon",
    "permissive": "PERMISSIVE",
    "roles": "{anon}",
    "command": "SELECT",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_select_active",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "((auth.uid() IS NOT NULL) AND active)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_items",
    "policy_name": "catalog_items_select_any_auth",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_read_kiosk_anon",
    "permissive": "PERMISSIVE",
    "roles": "{anon}",
    "command": "SELECT",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_select_active",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "((auth.uid() IS NOT NULL) AND active)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "catalog_variants",
    "policy_name": "catalog_variants_select_any_auth",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "counter_values",
    "policy_name": "counter_values_service_all",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "(auth.role() = 'service_role'::text)"
  },
  {
    "schema_name": "public",
    "table_name": "order_items",
    "policy_name": "order_items_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "order_items",
    "policy_name": "order_items_policy_delete",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "DELETE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "order_items",
    "policy_name": "order_items_policy_insert",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
  },
  {
    "schema_name": "public",
    "table_name": "order_items",
    "policy_name": "order_items_policy_select",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "order_items",
    "policy_name": "order_items_policy_update",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "UPDATE",
    "using_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))",
    "with_check_expression": "order_is_accessible(order_id, ( SELECT auth.uid() AS uid))"
  },
  {
    "schema_name": "public",
    "table_name": "orders",
    "policy_name": "orders_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "orders",
    "policy_name": "orders_policy_delete",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "DELETE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "orders",
    "policy_name": "orders_policy_insert",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))"
  },
  {
    "schema_name": "public",
    "table_name": "orders",
    "policy_name": "orders_policy_select",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(( SELECT auth.uid() AS uid)) OR (outlet_id = ANY (member_outlet_ids(( SELECT auth.uid() AS uid)))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "orders",
    "policy_name": "orders_policy_update",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "UPDATE",
    "using_expression": "is_admin(( SELECT auth.uid() AS uid))",
    "with_check_expression": "is_admin(( SELECT auth.uid() AS uid))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "((auth.role() = 'service_role'::text) OR (outlet_id = ANY (COALESCE(member_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_select_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_stocktake_user(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_item_routes",
    "policy_name": "outlet_item_routes_write",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "(auth.role() = 'service_role'::text)",
    "with_check_expression": "(auth.role() = 'service_role'::text)"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_order_routes",
    "policy_name": "outlet_order_routes_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_order_routes",
    "policy_name": "outlet_order_routes_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_order_routes",
    "policy_name": "outlet_order_routes_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "UPDATE",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_products",
    "policy_name": "outlet_products_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_products",
    "policy_name": "outlet_products_read_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(auth.uid() IS NOT NULL)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_products",
    "policy_name": "outlet_products_write_admin",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_sales",
    "policy_name": "outlet_sales_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_sales",
    "policy_name": "outlet_sales_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_sales",
    "policy_name": "outlet_sales_insert_ops",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(auth.uid() IS NOT NULL)"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_sales",
    "policy_name": "outlet_sales_scoped",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stock_balances",
    "policy_name": "outlet_balances_scoped",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stock_balances",
    "policy_name": "outlet_stock_balances_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stock_balances",
    "policy_name": "outlet_stock_balances_ro",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stocktakes",
    "policy_name": "outlet_stocktakes_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stocktakes",
    "policy_name": "outlet_stocktakes_ro",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_stocktakes",
    "policy_name": "outlet_stocktakes_scoped",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "outlet_auth_user_matches(outlet_id, auth.uid())",
    "with_check_expression": "outlet_auth_user_matches(outlet_id, auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_warehouses",
    "policy_name": "outlet_warehouses_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_warehouses",
    "policy_name": "outlet_warehouses_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_warehouses",
    "policy_name": "outlet_warehouses_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlet_warehouses",
    "policy_name": "outlet_warehouses_select_backoffice",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlet_warehouses",
    "policy_name": "outlet_warehouses_select_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (outlet_id = ANY (COALESCE(stocktake_outlet_ids(auth.uid()), ARRAY[]::uuid[]))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlets",
    "policy_name": "outlets_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "outlets",
    "policy_name": "outlets_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlets",
    "policy_name": "outlets_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "outlets",
    "policy_name": "outlets_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "outlets",
    "policy_name": "outlets_select_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "platform_admins",
    "policy_name": "platform_admins_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "platform_admins",
    "policy_name": "platform_admins_self_select",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "pos_item_map",
    "policy_name": "pos_item_map_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "pos_item_map",
    "policy_name": "pos_item_map_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "pos_item_map",
    "policy_name": "pos_item_map_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "pos_item_map",
    "policy_name": "pos_item_map_select_any_auth",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "pos_sync_failures",
    "policy_name": "pos_sync_failures_service_only",
    "permissive": "PERMISSIVE",
    "roles": "{service_role}",
    "command": "ALL",
    "using_expression": "true",
    "with_check_expression": "true"
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_edit_admin_or_transfer_mgr",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))"
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_read_admin_or_transfer_mgr",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_read_kiosk",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_read_kiosk_anon",
    "permissive": "PERMISSIVE",
    "roles": "{anon}",
    "command": "SELECT",
    "using_expression": "(active = true)",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_read_kiosk_anon_wh",
    "permissive": "PERMISSIVE",
    "roles": "{anon}",
    "command": "SELECT",
    "using_expression": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_read_kiosk_wh",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "((active = true) AND ((source_warehouse_id IS NULL) OR (source_warehouse_id = '587fcdb9-c998-42d6-b88e-bbcd1a66b088'::uuid)))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "recipes",
    "policy_name": "recipes_update_admin_or_transfer_mgr",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "UPDATE",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))",
    "with_check_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM (user_roles ur\n     JOIN roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND (lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'::text)))))"
  },
  {
    "schema_name": "public",
    "table_name": "roles",
    "policy_name": "roles_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "roles",
    "policy_name": "roles_select_all",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "true",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "stock_ledger",
    "policy_name": "stock_ledger_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "stock_ledger",
    "policy_name": "stock_ledger_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "stock_ledger",
    "policy_name": "stock_ledger_stocktake_read",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_stocktake_user(auth.uid()) AND (location_type = 'warehouse'::text))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "suppliers",
    "policy_name": "suppliers_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "suppliers",
    "policy_name": "suppliers_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "suppliers",
    "policy_name": "suppliers_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "uom_conversions",
    "policy_name": "uom_conversions_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "user_roles",
    "policy_name": "user_roles_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "user_roles",
    "policy_name": "user_roles_self_select",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (user_id = auth.uid()))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_backoffice_update",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "UPDATE",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_select_backoffice",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "vehicles",
    "policy_name": "vehicles_select_stocktake",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(has_stocktake_role(auth.uid()) OR is_admin(auth.uid()))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_backoffice_logs",
    "policy_name": "warehouse_backoffice_logs_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_backoffice_logs",
    "policy_name": "warehouse_backoffice_logs_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_backoffice_logs",
    "policy_name": "wb_logs_insert_auth",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(auth.uid() IS NOT NULL)"
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_backoffice_logs",
    "policy_name": "wb_logs_select_admin_backoffice",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "SELECT",
    "using_expression": "(is_admin(auth.uid()) OR (EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid)))))",
    "with_check_expression": null
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_damages",
    "policy_name": "warehouse_damages_admin_rw",
    "permissive": "PERMISSIVE",
    "roles": "{authenticated}",
    "command": "ALL",
    "using_expression": "is_admin(auth.uid())",
    "with_check_expression": "is_admin(auth.uid())"
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_damages",
    "policy_name": "warehouse_damages_backoffice_insert",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "INSERT",
    "using_expression": null,
    "with_check_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))"
  },
  {
    "schema_name": "public",
    "table_name": "warehouse_damages",
    "policy_name": "warehouse_damages_backoffice_select",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "command": "SELECT",
    "using_expression": "(EXISTS ( SELECT 1\n   FROM user_roles ur\n  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid))))",
    "with_check_expression": null
  }
]