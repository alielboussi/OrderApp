-- Afterten public schema (structure only, no data)
-- Generated from supabase/Supabase Schema.sql JSON export.

CREATE EXTENSION IF NOT EXISTS pgcrypto
-- @split
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
-- @split
DO $$ BEGIN
  CREATE TYPE public.item_kind AS ENUM ('finished', 'ingredient', 'raw');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
-- @split
DO $$ BEGIN
  CREATE TYPE public.recipe_measure_unit AS ENUM (
    'grams', 'kilograms', 'milligrams', 'litres', 'millilitres', 'units'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
-- @split
DO $$ BEGIN
  CREATE TYPE public.order_lock_stage AS ENUM ('outlet', 'supervisor', 'driver', 'offloader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
-- @split
CREATE SEQUENCE IF NOT EXISTS public."pos_inventory_consumed_id_seq"
-- @split
CREATE TABLE IF NOT EXISTS public."catalog_items" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"name" text NOT NULL,
"sku" text,
"item_kind" public.item_kind NOT NULL,
"units_per_purchase_pack" numeric NOT NULL DEFAULT 1,
"active" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now(),
"consumption_uom" text NOT NULL DEFAULT 'each'::text,
"cost" numeric NOT NULL DEFAULT 0,
"has_variations" boolean NOT NULL DEFAULT false,
"image_url" text,
"purchase_pack_unit" text NOT NULL DEFAULT 'each'::text,
"purchase_unit_mass" numeric,
"purchase_unit_mass_uom" public.recipe_measure_unit,
"transfer_unit" text NOT NULL DEFAULT 'each'::text,
"transfer_quantity" numeric NOT NULL DEFAULT 1,
"outlet_order_visible" boolean NOT NULL DEFAULT true,
"has_recipe" boolean NOT NULL DEFAULT false,
"consumption_unit_mass" numeric,
"consumption_unit_mass_uom" text,
"consumption_unit" text NOT NULL DEFAULT 'each'::text,
"storage_unit" text,
"storage_weight" numeric,
"qty_decimal_places" integer DEFAULT 0,
"supplier_sku" text,
"selling_price" numeric,
"inner_pack_unit_mass" numeric,
"inner_pack_unit_mass_uom" text,
"menu_group_id" uuid
)
-- @split
CREATE TABLE IF NOT EXISTS public."catalog_menu_groups" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"name" text NOT NULL,
"pos_menu_group_id" integer,
"active" boolean NOT NULL DEFAULT true,
"sort_order" integer NOT NULL DEFAULT 0,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."catalog_variants" (
"id" text NOT NULL,
"item_id" uuid NOT NULL,
"name" text NOT NULL,
"sku" text,
"supplier_sku" text,
"item_kind" public.item_kind NOT NULL DEFAULT 'finished'::item_kind,
"consumption_uom" text NOT NULL DEFAULT 'each'::text,
"purchase_pack_unit" text NOT NULL DEFAULT 'each'::text,
"units_per_purchase_pack" numeric NOT NULL DEFAULT 1,
"purchase_unit_mass" numeric,
"purchase_unit_mass_uom" text,
"transfer_unit" text NOT NULL DEFAULT 'each'::text,
"transfer_quantity" numeric NOT NULL DEFAULT 1,
"qty_decimal_places" integer,
"cost" numeric NOT NULL DEFAULT 0,
"selling_price" numeric,
"outlet_order_visible" boolean NOT NULL DEFAULT true,
"image_url" text,
"active" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now(),
"inner_pack_unit_mass" numeric,
"inner_pack_unit_mass_uom" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."counter_values" (
"counter_key" text NOT NULL,
"scope_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
"last_value" bigint NOT NULL DEFAULT 0,
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."middleware_catalog_schedule" (
"id" text NOT NULL,
"scheduled_at" timestamptz,
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."middleware_update_drafts" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"entity_type" text NOT NULL,
"entity_id" text NOT NULL,
"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."order_items" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"order_id" uuid NOT NULL,
"product_id" uuid NOT NULL,
"qty" numeric NOT NULL,
"created_at" timestamptz NOT NULL DEFAULT now(),
"name" text,
"consumption_uom" text NOT NULL DEFAULT 'each'::text,
"cost" numeric NOT NULL DEFAULT 0,
"receiving_contains" numeric,
"qty_cases" numeric,
"amount" numeric,
"receiving_uom" text NOT NULL DEFAULT 'each'::text,
"variation_key" text DEFAULT 'base'::text
)
-- @split
CREATE TABLE IF NOT EXISTS public."orders" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"outlet_id" uuid NOT NULL,
"status" text NOT NULL DEFAULT 'draft'::text,
"approved_at" timestamptz,
"approved_by" uuid,
"created_by" uuid,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now(),
"order_number" text,
"locked" boolean NOT NULL DEFAULT false,
"tz" text NOT NULL DEFAULT 'UTC'::text,
"pdf_path" text,
"approved_pdf_path" text,
"loaded_pdf_path" text,
"offloaded_pdf_path" text,
"employee_signed_name" text,
"employee_signature_path" text,
"employee_signed_at" timestamptz,
"supervisor_signed_name" text,
"supervisor_signature_path" text,
"supervisor_signed_at" timestamptz,
"driver_signed_name" text,
"driver_signature_path" text,
"driver_signed_at" timestamptz,
"offloader_signed_name" text,
"offloader_signature_path" text,
"offloader_signed_at" timestamptz,
"modified_by_supervisor" boolean NOT NULL DEFAULT false,
"modified_by_supervisor_name" text,
"source_event_id" text,
"branch_id" integer,
"order_type" text,
"bill_type" text,
"total_discount" numeric,
"total_discount_amount" numeric,
"total_gst" numeric,
"service_charges" numeric,
"delivery_charges" numeric,
"tip" numeric,
"pos_fee" numeric,
"price_type" text,
"customer_name" text,
"customer_phone" text,
"raw_payload" jsonb DEFAULT '{}'::jsonb,
"payments" jsonb,
"pos_branch_id" integer,
"pos_sale_id" text,
"customer_email" text,
"handoff_driver_name" text,
"handoff_driver_signature_path" text,
"handoff_driver_signed_at" timestamptz,
"delivery_driver_name" text,
"delivery_driver_signature_path" text,
"delivery_driver_signed_at" timestamptz,
"completed_pdf_path" text,
"accepted_at" timestamptz,
"accepted_by" uuid,
"completed_at" timestamptz
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_auth_assignments" (
"outlet_id" uuid NOT NULL,
"auth_user_id" uuid NOT NULL,
"assignment_role" text NOT NULL DEFAULT 'both'::text,
"active" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_catalog_allowlist" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"outlet_id" uuid NOT NULL,
"item_id" uuid NOT NULL,
"variant_id" text,
"allow_orders" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_catalog_sync_events" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"outlet_id" uuid NOT NULL,
"entity_type" text NOT NULL,
"entity_id" text NOT NULL,
"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
"status" text NOT NULL DEFAULT 'pending'::text,
"created_at" timestamptz NOT NULL DEFAULT now(),
"delivered_at" timestamptz,
"error_message" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_pos_catalog_bindings" (
"outlet_id" uuid NOT NULL,
"item_sku" text NOT NULL,
"variant_sku" text NOT NULL DEFAULT ''::text,
"catalog_item_id" uuid NOT NULL,
"pos_item_name" text,
"catalog_variant_key" text,
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_pos_heartbeats" (
"outlet_id" uuid NOT NULL,
"last_seen_at" timestamptz NOT NULL DEFAULT now(),
"middleware_version" text,
"host_name" text,
"updated_at" timestamptz NOT NULL DEFAULT now(),
"pending_sales_count" integer,
"unmapped_pos_skus_count" integer,
"last_sync_error" text,
"last_sale_uploaded_at" timestamptz
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_sales" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"outlet_id" uuid NOT NULL,
"item_id" uuid NOT NULL,
"qty_units" numeric NOT NULL,
"is_production" boolean NOT NULL DEFAULT false,
"warehouse_id" uuid,
"sold_at" timestamptz NOT NULL DEFAULT now(),
"created_by" uuid,
"context" jsonb NOT NULL DEFAULT '{}'::jsonb,
"created_at" timestamptz NOT NULL DEFAULT now(),
"variant_key" text DEFAULT 'base'::text,
"sale_price" numeric,
"vat_exc_price" numeric,
"flavour_price" numeric,
"flavour_id" text,
"modifier_id" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_warehouse_order_receipts" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"outlet_id" uuid NOT NULL,
"warehouse_id" uuid NOT NULL,
"order_id" uuid NOT NULL,
"approved_at" timestamptz NOT NULL DEFAULT now(),
"line_count" integer NOT NULL DEFAULT 0,
"total_units" numeric NOT NULL DEFAULT 0,
"total_value" numeric NOT NULL DEFAULT 0,
"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
"created_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlet_warehouses" (
"outlet_id" uuid NOT NULL,
"warehouse_id" uuid NOT NULL
)
-- @split
CREATE TABLE IF NOT EXISTS public."outlets" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"name" text NOT NULL,
"code" text,
"channel" text NOT NULL DEFAULT 'selling'::text,
"auth_user_id" uuid,
"active" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now(),
"deduct_on_pos_sale" boolean NOT NULL DEFAULT true,
"has_pos_middleware" boolean NOT NULL DEFAULT true,
"uses_orders_app" boolean NOT NULL DEFAULT false,
"default_sales_warehouse_id" uuid,
"default_receiving_warehouse_id" uuid,
"middleware_sales_api_profile" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."pos_inventory_consumed" (
"id" bigint NOT NULL DEFAULT nextval('pos_inventory_consumed_id_seq'::regclass),
"source_event_id" text,
"outlet_id" uuid NOT NULL,
"order_id" uuid,
"raw_item_id" text NOT NULL,
"quantity_consumed" numeric NOT NULL,
"remaining_quantity" numeric,
"occurred_at" timestamptz DEFAULT now(),
"pos_date" date,
"kdsid" text,
"typec" text,
"context" jsonb DEFAULT '{}'::jsonb,
"created_at" timestamptz DEFAULT now(),
"unassigned_branch_note" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."pos_sync_failures" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"created_at" timestamptz NOT NULL DEFAULT now(),
"outlet_id" uuid,
"source_event_id" text,
"pos_order_id" text,
"sale_id" text,
"stage" text NOT NULL,
"error_message" text NOT NULL,
"details" jsonb
)
-- @split
CREATE TABLE IF NOT EXISTS public."stg_mintpos_menuitem" (
"menuitem_id" bigint NOT NULL,
"item_sku" text NOT NULL,
"item_name" text NOT NULL
)
-- @split
CREATE TABLE IF NOT EXISTS public."stg_mintpos_modifierflavour" (
"flavour_id" bigint NOT NULL,
"menuitem_id" bigint NOT NULL,
"variant_name" text NOT NULL,
"variant_sku" text
)
-- @split
CREATE TABLE IF NOT EXISTS public."suppliers" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"name" text NOT NULL,
"contact_name" text,
"contact_phone" text,
"contact_email" text,
"whatsapp_number" text,
"notes" text,
"active" boolean NOT NULL DEFAULT true,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."warehouse_audit_viewers" (
"user_id" uuid NOT NULL
)
-- @split
CREATE TABLE IF NOT EXISTS public."warehouse_auth_accounts" (
"user_id" uuid NOT NULL,
"email" text,
"active" boolean NOT NULL DEFAULT false,
"created_at" timestamptz NOT NULL DEFAULT now(),
"activated_at" timestamptz,
"updated_at" timestamptz NOT NULL DEFAULT now()
)
-- @split
CREATE TABLE IF NOT EXISTS public."warehouse_backoffice_logs" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"created_at" timestamptz NOT NULL DEFAULT now(),
"user_id" uuid,
"user_email" text,
"action" text NOT NULL,
"page" text,
"method" text,
"status" integer,
"entity_type" text,
"entity_id" text,
"entity_name" text,
"details" jsonb
)
-- @split
CREATE TABLE IF NOT EXISTS public."warehouses" (
"id" uuid NOT NULL DEFAULT gen_random_uuid(),
"name" text NOT NULL,
"code" text,
"parent_warehouse_id" uuid,
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now(),
"active" boolean NOT NULL DEFAULT true,
"outlet_id" uuid,
"warehouse_scope" text NOT NULL DEFAULT 'outlet'::text
)
-- @split
ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_warehouse_scope_check
-- @split
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_warehouse_scope_check CHECK (warehouse_scope = ANY (ARRAY['hub'::text, 'outlet'::text]))
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_pkey ON public.catalog_items USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS idx_catalog_items_menu_group_id ON public.catalog_items USING btree (menu_group_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_name_item_kind_unique ON public.catalog_items USING btree (lower(name), item_kind)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_sku_unique ON public.catalog_items USING btree (lower(sku)) WHERE (sku IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS catalog_menu_groups_pkey ON public.catalog_menu_groups USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_menu_groups_name_lower ON public.catalog_menu_groups USING btree (lower(btrim(name)))
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_menu_groups_pos_menu_group_id ON public.catalog_menu_groups USING btree (pos_menu_group_id) WHERE (pos_menu_group_id IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS catalog_variants_item_key ON public.catalog_variants USING btree (item_id, id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS catalog_variants_pkey ON public.catalog_variants USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS idx_catalog_variants_item_id ON public.catalog_variants USING btree (item_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS counter_values_pkey ON public.counter_values USING btree (counter_key, scope_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS middleware_catalog_schedule_pkey ON public.middleware_catalog_schedule USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS middleware_update_drafts_entity_type_entity_id_key ON public.middleware_update_drafts USING btree (entity_type, entity_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS middleware_update_drafts_pkey ON public.middleware_update_drafts USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items USING btree (order_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items USING btree (product_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS order_items_pkey ON public.order_items USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS idx_orders_approved_by ON public.orders USING btree (approved_by) WHERE (approved_by IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders USING btree (created_by) WHERE (created_by IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_orders_outlet ON public.orders USING btree (outlet_id, status)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS orders_pkey ON public.orders USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_order_number ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_source_event ON public.orders USING btree (source_event_id) WHERE (source_event_id IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_auth_assignments_pkey ON public.outlet_auth_assignments USING btree (outlet_id, auth_user_id)
-- @split
CREATE INDEX IF NOT EXISTS outlet_auth_assignments_user_idx ON public.outlet_auth_assignments USING btree (auth_user_id) WHERE (active = true)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_catalog_allowlist_outlet_id ON public.outlet_catalog_allowlist USING btree (outlet_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_catalog_allowlist_variant_id ON public.outlet_catalog_allowlist USING btree (variant_id)
-- @split
CREATE INDEX IF NOT EXISTS outlet_catalog_allowlist_item_idx ON public.outlet_catalog_allowlist USING btree (item_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_catalog_allowlist_pkey ON public.outlet_catalog_allowlist USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_catalog_allowlist_unique_base ON public.outlet_catalog_allowlist USING btree (outlet_id, item_id) WHERE (variant_id IS NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_catalog_allowlist_unique_variant ON public.outlet_catalog_allowlist USING btree (outlet_id, item_id, variant_id) WHERE (variant_id IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_catalog_sync_pending ON public.outlet_catalog_sync_events USING btree (outlet_id, status, created_at) WHERE (status = 'pending'::text)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_catalog_sync_events_pkey ON public.outlet_catalog_sync_events USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS outlet_pos_catalog_bindings_catalog_idx ON public.outlet_pos_catalog_bindings USING btree (catalog_item_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_pos_catalog_bindings_pkey ON public.outlet_pos_catalog_bindings USING btree (outlet_id, item_sku, variant_sku)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_pos_heartbeats_pkey ON public.outlet_pos_heartbeats USING btree (outlet_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_sales_created_by ON public.outlet_sales USING btree (created_by) WHERE (created_by IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_sales_item_id ON public.outlet_sales USING btree (item_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_sales_outlet ON public.outlet_sales USING btree (outlet_id, sold_at DESC)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_sales_source_event ON public.outlet_sales USING btree (((context ->> 'source_event_id'::text)))
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_sales_warehouse_id ON public.outlet_sales USING btree (warehouse_id) WHERE (warehouse_id IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_sales_pkey ON public.outlet_sales USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_wh_order_receipts_order_id ON public.outlet_warehouse_order_receipts USING btree (order_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_wh_order_receipts_outlet_id ON public.outlet_warehouse_order_receipts USING btree (outlet_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_wh_order_receipts_warehouse_id ON public.outlet_warehouse_order_receipts USING btree (warehouse_id)
-- @split
CREATE INDEX IF NOT EXISTS outlet_warehouse_order_receipts_outlet_idx ON public.outlet_warehouse_order_receipts USING btree (outlet_id, approved_at DESC)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_warehouse_order_receipts_pkey ON public.outlet_warehouse_order_receipts USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_warehouse_order_receipts_unique ON public.outlet_warehouse_order_receipts USING btree (order_id, warehouse_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlet_warehouses_warehouse ON public.outlet_warehouses USING btree (warehouse_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlet_warehouses_pkey ON public.outlet_warehouses USING btree (outlet_id, warehouse_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlets_default_receiving_wh ON public.outlets USING btree (default_receiving_warehouse_id) WHERE (default_receiving_warehouse_id IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_outlets_default_sales_wh ON public.outlets USING btree (default_sales_warehouse_id) WHERE (default_sales_warehouse_id IS NOT NULL)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlets_auth_user_id_key ON public.outlets USING btree (auth_user_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS outlets_pkey ON public.outlets USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS ux_outlets_code ON public.outlets USING btree (lower(code)) WHERE (code IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_pos_inventory_consumed_order_id ON public.pos_inventory_consumed USING btree (order_id) WHERE (order_id IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_pos_inventory_consumed_outlet ON public.pos_inventory_consumed USING btree (outlet_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_consumed_pkey ON public.pos_inventory_consumed USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_consumed_source_event_id_key ON public.pos_inventory_consumed USING btree (source_event_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_pos_sync_failures_created_at ON public.pos_sync_failures USING btree (created_at DESC)
-- @split
CREATE INDEX IF NOT EXISTS idx_pos_sync_failures_source_event ON public.pos_sync_failures USING btree (source_event_id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS pos_sync_failures_pkey ON public.pos_sync_failures USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_pkey ON public.suppliers USING btree (id)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_audit_viewers_pkey ON public.warehouse_audit_viewers USING btree (user_id)
-- @split
CREATE INDEX IF NOT EXISTS warehouse_auth_accounts_active_idx ON public.warehouse_auth_accounts USING btree (active, created_at DESC)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_auth_accounts_pkey ON public.warehouse_auth_accounts USING btree (user_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_warehouse_backoffice_logs_user_id ON public.warehouse_backoffice_logs USING btree (user_id)
-- @split
CREATE INDEX IF NOT EXISTS warehouse_backoffice_logs_action_idx ON public.warehouse_backoffice_logs USING btree (action)
-- @split
CREATE INDEX IF NOT EXISTS warehouse_backoffice_logs_created_at_idx ON public.warehouse_backoffice_logs USING btree (created_at DESC)
-- @split
CREATE INDEX IF NOT EXISTS warehouse_backoffice_logs_page_idx ON public.warehouse_backoffice_logs USING btree (page)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_backoffice_logs_pkey ON public.warehouse_backoffice_logs USING btree (id)
-- @split
CREATE INDEX IF NOT EXISTS warehouse_backoffice_logs_user_email_idx ON public.warehouse_backoffice_logs USING btree (user_email)
-- @split
CREATE INDEX IF NOT EXISTS idx_warehouses_outlet_id ON public.warehouses USING btree (outlet_id)
-- @split
CREATE INDEX IF NOT EXISTS idx_warehouses_parent_warehouse_id ON public.warehouses USING btree (parent_warehouse_id) WHERE (parent_warehouse_id IS NOT NULL)
-- @split
CREATE INDEX IF NOT EXISTS idx_warehouses_scope ON public.warehouses USING btree (warehouse_scope)
-- @split
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_pkey ON public.warehouses USING btree (id)
-- @split
CREATE OR REPLACE VIEW public."v_outlet_warehouses" AS SELECT o.id AS outlet_id,
    o.name AS outlet_name,
    o.code AS outlet_code,
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    w.warehouse_scope
   FROM ((outlets o
     JOIN outlet_warehouses ow ON ((ow.outlet_id = o.id)))
     JOIN warehouses w ON ((w.id = ow.warehouse_id)))
  WHERE (COALESCE(o.active, true) AND COALESCE(w.active, true))
-- @split
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized to accept orders';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN
    RAISE EXCEPTION 'order must be placed before accept (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = v_uid,
      approved_at = now(),
      approved_by = v_uid,
      modified_by_supervisor = true,
      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),
      supervisor_signed_name = COALESCE(NULLIF(p_supervisor_name, ''), supervisor_signed_name),
      supervisor_signature_path = COALESCE(NULLIF(p_signature_path, ''), supervisor_signature_path),
      supervisor_signed_at = CASE WHEN NULLIF(p_signature_path, '') IS NOT NULL THEN now() ELSE supervisor_signed_at END,
      approved_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), approved_pdf_path),
      updated_at = now()
  WHERE id = p_order_id;

  -- record_order_fulfillment (trigger) credits ingredients at outlet in order UOM
  -- record_outlet_warehouse_order_receipt stores equivalent finished count for reporting only
  PERFORM public.record_outlet_warehouse_order_receipt(p_order_id);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.apply_pos_sale_deduction_rules(p_outlet_id uuid, p_sold_item_id uuid, p_sold_variant_key text, p_sale_qty numeric, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.approve_lock_and_allocate_order(p_order_id uuid, p_strict boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_needs_allocation boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  if not (
    public.is_admin(v_uid)
    or v_order.outlet_id = any(coalesce(public.member_outlet_ids(v_uid), array[]::uuid[]))
  ) then
    raise exception 'not authorized to allocate order %', p_order_id;
  end if;

  v_needs_allocation := not coalesce(v_order.locked, false);

  if v_needs_allocation then
    update public.orders
    set status = coalesce(nullif(v_order.status, ''), 'ordered'),
        locked = true,
        approved_at = coalesce(v_order.approved_at, now()),
        approved_by = coalesce(v_order.approved_by, v_uid),
        updated_at = now()
    where id = p_order_id;

    perform public.record_order_fulfillment(p_order_id);
  elsif not p_strict then
    perform public.record_order_fulfillment(p_order_id);
  end if;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.assert_order_item_editable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_supervisor boolean := false;
  v_status text;
  v_merge text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found for item';
  END IF;

  v_is_admin := public.is_admin(v_uid);
  v_is_supervisor := public.is_supervisor(v_uid);
  v_status := lower(COALESCE(v_order.status, ''));

  IF NOT v_is_admin AND v_is_supervisor THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      v_merge := current_setting('order_items.supervisor_merge', true);
      IF TG_OP = 'DELETE' AND v_merge = 'on' AND v_status = 'placed' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'supervisors cannot add or remove order items';
    END IF;

    IF v_status <> 'placed' THEN
      RAISE EXCEPTION 'supervisors can only edit items while order status is placed';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'supervisors cannot change product on an order line';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NOT v_is_admin THEN
    IF COALESCE(v_order.locked, false) THEN
      RAISE EXCEPTION 'order is locked';
    END IF;
    IF v_status NOT IN ('placed', 'draft') THEN
      RAISE EXCEPTION 'order items cannot be modified when status is %', v_order.status;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.available_servings(p_finished_item_id uuid, p_warehouse_id uuid, p_variant_key text DEFAULT 'base'::text)
 RETURNS TABLE(finished_item_id uuid, warehouse_id uuid, variant_key text, max_servings numeric, bottleneck_ingredient uuid, bottleneck_needed numeric, bottleneck_available numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with normalized as (
    select public.normalize_variant_key(coalesce(p_variant_key, 'base')) as vkey
  ),
  req as (
    select
      r.ingredient_item_id as ingredient_id,
      r.qty_per_unit as qty_per_unit,
      coalesce(r.yield_qty_units, 1) as yield_units
    from public.recipes r
    join normalized n on true
    where r.active
      and r.finished_item_id = p_finished_item_id
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = n.vkey
  ),
  stock as (
    select
      s.item_id,
      s.variant_key,
      coalesce(s.net_units, 0) as on_hand
    from public.warehouse_layer_stock s
    where s.warehouse_id = p_warehouse_id
  ),
  per_component as (
    select
      req.ingredient_id,
      req.qty_per_unit,
      req.yield_units,
      coalesce(st.on_hand, 0) as on_hand,
      /* how many finished units this ingredient can support */
      floor(
        case
          when req.qty_per_unit <= 0 then 0
          else (coalesce(st.on_hand, 0) * req.yield_units) / req.qty_per_unit
        end
      ) as max_by_component
    from req
    left join stock st on st.item_id = req.ingredient_id and st.variant_key = 'base'
  ),
  agg as (
    select
      min(max_by_component) as max_servings,
      /* pick the bottleneck ingredient (smallest capacity) */
      (array_agg(ingredient_id order by max_by_component asc nulls first))[1] as bottleneck_ingredient,
      (array_agg(qty_per_unit order by max_by_component asc nulls first))[1] as bottleneck_needed,
      (array_agg(on_hand order by max_by_component asc nulls first))[1] as bottleneck_available
    from per_component
  )
  select
    p_finished_item_id,
    p_warehouse_id,
    (select vkey from normalized) as variant_key,
    coalesce(agg.max_servings, 0) as max_servings,
    agg.bottleneck_ingredient,
    agg.bottleneck_needed,
    agg.bottleneck_available
  from agg;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.catalog_consumption_uom(p_item_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.normalize_uom_token(
    coalesce(
      nullif(trim(i.consumption_unit), ''),
      nullif(trim(i.consumption_uom), ''),
      'each'
    )
  )
  FROM public.catalog_items i
  WHERE i.id = p_item_id;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.clear_pos_sync_failure(p_outlet_id uuid, p_source_event_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_outlet_id IS NULL OR nullif(p_source_event_id, '') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.pos_sync_failures
  WHERE outlet_id = p_outlet_id
    AND source_event_id = p_source_event_id;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'not authorized to complete order %', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'loaded' THEN
    RAISE EXCEPTION 'order must be loaded before complete (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'completed',
      locked = true,
      delivery_driver_name = COALESCE(NULLIF(p_driver_name, ''), delivery_driver_name),
      delivery_driver_signature_path = NULLIF(p_signature_path, ''),
      delivery_driver_signed_at = now(),
      offloader_signed_name = COALESCE(NULLIF(p_driver_name, ''), offloader_signed_name),
      offloader_signature_path = COALESCE(NULLIF(p_signature_path, ''), offloader_signature_path),
      offloader_signed_at = now(),
      completed_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), completed_pdf_path),
      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),
      offloaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), offloaded_pdf_path),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.compute_order_yield_from_deduction_rules(p_outlet_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lines jsonb;
BEGIN
  IF p_outlet_id IS NULL OR p_order_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', oi.product_id,
        'variant_key', public.normalize_variant_key(oi.variation_key),
        'qty', oi.qty,
        'cost', oi.cost,
        'amount', oi.amount
      )
      ORDER BY oi.created_at
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN v_lines;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.console_locked_warehouses(p_include_inactive boolean DEFAULT false, p_locked_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, name text, parent_warehouse_id uuid, kind text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ids uuid[] := array(select distinct unnest(coalesce(p_locked_ids, array[]::uuid[])));
begin
  return query
  select
    w.id,
    w.name,
    w.parent_warehouse_id,
    w.warehouse_scope::text as kind,
    w.active
  from public.warehouses w
  where p_include_inactive
     or w.active
     or (array_length(ids, 1) is not null and w.id = any (ids));
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.console_operator_directory()
 RETURNS TABLE(id uuid, display_name text, name text, email text, auth_user_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    u.id,
    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS display_name,
    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS name,
    u.email,
    u.id AS auth_user_id
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role_id = 'eef421e0-ce06-4518-93c4-6bb6525f6742'
    AND (u.is_anonymous IS NULL OR u.is_anonymous = false)
    AND u.email IS NOT NULL;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.convert_catalog_uom_qty(p_qty numeric, p_from_uom text, p_to_uom text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from text := public.normalize_uom_token(p_from_uom);
  v_to text := public.normalize_uom_token(p_to_uom);
  v_grams numeric;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN 0;
  END IF;

  IF v_from = v_to THEN
    RETURN p_qty;
  END IF;

  -- Mass units convert via grams
  IF v_from IN ('mg', 'g', 'kg') AND v_to IN ('mg', 'g', 'kg') THEN
    v_grams := CASE v_from
      WHEN 'mg' THEN p_qty / 1000.0
      WHEN 'kg' THEN p_qty * 1000.0
      ELSE p_qty
    END;
    RETURN CASE v_to
      WHEN 'mg' THEN v_grams * 1000.0
      WHEN 'kg' THEN v_grams / 1000.0
      ELSE v_grams
    END;
  END IF;

  -- Volume units convert via millilitres
  IF v_from IN ('ml', 'l') AND v_to IN ('ml', 'l') THEN
    v_grams := CASE v_from WHEN 'l' THEN p_qty * 1000.0 ELSE p_qty END;
    RETURN CASE v_to WHEN 'l' THEN v_grams / 1000.0 ELSE v_grams END;
  END IF;

  -- Count / pack units: no cross-family conversion
  RETURN p_qty;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.convert_uom_qty(p_qty numeric, p_from text, p_to text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from text := lower(trim(coalesce(p_from, '')));
  v_to text := lower(trim(coalesce(p_to, '')));
  v_multiplier numeric := 1;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_from = '' OR v_to = '' OR v_from = v_to THEN
    RETURN p_qty;
  END IF;

  SELECT uc.multiplier
    INTO v_multiplier
  FROM public.uom_conversions uc
  WHERE uc.active
    AND lower(uc.from_uom) = v_from
    AND lower(uc.to_uom) = v_to
  LIMIT 1;

  RETURN p_qty * COALESCE(v_multiplier, 1);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.debug_pos_sync_counter(p_scope_id uuid, p_counter_key text)
 RETURNS TABLE(counter_key text, scope_id uuid, last_value bigint, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
begin
  return query
  select c.counter_key, c.scope_id, c.last_value, c.updated_at
  from public.counter_values c
  where c.counter_key = p_counter_key
    and c.scope_id = p_scope_id;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_temp'
AS $function$
  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];
$function$
-- @split
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized to dispatch orders';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'order must be accepted before dispatch (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'loaded',
      locked = true,
      handoff_driver_name = COALESCE(NULLIF(p_driver_name, ''), handoff_driver_name),
      handoff_driver_signature_path = NULLIF(p_signature_path, ''),
      handoff_driver_signed_at = now(),
      driver_signed_name = COALESCE(NULLIF(p_driver_name, ''), driver_signed_name),
      driver_signature_path = COALESCE(NULLIF(p_signature_path, ''), driver_signature_path),
      driver_signed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.enqueue_catalog_sync_for_outlets(p_entity_type text, p_entity_id text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.outlet_catalog_sync_events(outlet_id, entity_type, entity_id, payload)
  SELECT o.id, p_entity_type, p_entity_id, p_payload
  FROM public.outlets o
  WHERE COALESCE(o.active, true);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.ensure_open_stock_period(p_warehouse_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.fetch_outlet_catalog_sync(p_outlet_id uuid, p_limit integer DEFAULT 100)
 RETURNS SETOF outlet_catalog_sync_events
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.outlet_catalog_sync_events
  WHERE outlet_id = p_outlet_id
    AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$
-- @split
CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_cutoff(p_outlet_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_timestamp(cv.last_value)
  FROM public.counter_values cv
  WHERE cv.counter_key = 'pos_sync_cutoff'
    AND cv.scope_id = p_outlet_id
  ORDER BY cv.updated_at DESC NULLS LAST
  LIMIT 1;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_opening(p_outlet_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_timestamp(cv.last_value)
  FROM public.counter_values cv
  WHERE cv.counter_key = 'pos_sync_opening'
    AND cv.scope_id = p_outlet_id
  ORDER BY cv.updated_at DESC NULLS LAST
  LIMIT 1;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.get_outlet_sync_health(p_outlet_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH hb AS (
    SELECT *
    FROM public.outlet_pos_heartbeats
    WHERE outlet_id = p_outlet_id
  ),
  missing_lines AS (
    SELECT COUNT(*)::int AS orders_missing_api_lines
    FROM public.orders o
    WHERE o.outlet_id = p_outlet_id
      AND o.source_event_id IS NOT NULL
      AND o.source_event_id LIKE p_outlet_id::text || '-%'
      AND NOT EXISTS (
        SELECT 1 FROM public.outlet_sales os
        WHERE os.context->>'source_event_id' = o.source_event_id
      )
  ),
  missing_shift AS (
    SELECT COUNT(*)::int AS orders_missing_shift
    FROM public.orders o
    WHERE o.outlet_id = p_outlet_id
      AND o.source_event_id IS NOT NULL
      AND o.source_event_id LIKE p_outlet_id::text || '-%'
      AND (o.raw_payload->'shift' IS NULL OR o.raw_payload->'shift' = 'null'::jsonb)
  ),
  recent_failures AS (
    SELECT COUNT(*)::int AS failures_24h
    FROM public.pos_sync_failures f
    WHERE f.outlet_id = p_outlet_id
      AND f.created_at >= now() - interval '24 hours'
  )
  SELECT jsonb_build_object(
    'outlet_id', p_outlet_id,
    'last_seen_at', (SELECT last_seen_at FROM hb),
    'pending_sales_count', (SELECT pending_sales_count FROM hb),
    'unmapped_pos_skus_count', (SELECT unmapped_pos_skus_count FROM hb),
    'last_sync_error', (SELECT last_sync_error FROM hb),
    'last_sale_uploaded_at', (SELECT last_sale_uploaded_at FROM hb),
    'orders_missing_api_lines', (SELECT orders_missing_api_lines FROM missing_lines),
    'orders_missing_shift', (SELECT orders_missing_shift FROM missing_shift),
    'sync_failures_24h', (SELECT failures_24h FROM recent_failures)
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.handle_new_warehouse_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.warehouse_auth_accounts (user_id, email, active)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.has_open_warehouse_period(p_warehouse_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT true;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.is_pack_receiving_uom(p_uom text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.normalize_uom_token(p_uom) = ANY (
    ARRAY['plastic', 'case', 'crate', 'bottle', 'tin can', 'jar', 'bag', 'box', 'packet', 'tray', 'bucket', 'block']
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.is_supervisor(p_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND lower(coalesce(r.normalized_slug, r.slug)) = 'supervisor'
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.is_warehouse_app_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.source_event_id IS NULL
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.list_middleware_outlets()
 RETURNS SETOF outlets
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.outlets o
  WHERE COALESCE(o.active, true)
    AND COALESCE(o.has_pos_middleware, false)
    AND COALESCE(o.channel, 'selling') = 'selling'
    AND o.name !~* '\mstorerooms?\M'
  ORDER BY o.name;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.list_orders_missing_shift(p_outlet_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(source_event_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_outlet_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.source_event_id
  FROM public.orders o
  WHERE o.outlet_id = p_outlet_id
    AND EXISTS (
      SELECT 1 FROM public.outlet_sales os
      WHERE os.outlet_id = p_outlet_id
        AND os.context->>'source_event_id' = o.source_event_id
      LIMIT 1
    )
    AND (
      o.raw_payload->'shift' IS NULL
      OR o.raw_payload->'shift' = 'null'::jsonb
      OR nullif(o.raw_payload->'shift'->>'shift_id', '') IS NULL
      OR nullif(o.raw_payload->'shift'->>'shift_name', '') IS NULL
    )
  ORDER BY o.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.list_warehouse_items(p_warehouse_id uuid, p_outlet_id uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(warehouse_id uuid, item_id uuid, item_name text, variant_key text, variant_name text, sku text, net_units numeric, unit_cost numeric, item_kind item_kind, image_url text, has_recipe boolean, consumption_uom text, purchase_pack_unit text, transfer_unit text, transfer_quantity numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with storage_keys as (
    select
      ish.item_id,
      ish.normalized_variant_key
    from public.item_storage_homes ish
    where ish.storage_warehouse_id = p_warehouse_id
  ),
  items_in_warehouse as (
    select distinct item_id from storage_keys
  ),
  base_items as (
    select
      p_warehouse_id as warehouse_id,
      ci.id as item_id,
      ci.name as item_name,
      'base'::text as variant_key,
      null::text as variant_name,
      ci.sku as sku,
      0::numeric as net_units,
      coalesce(ci.cost, 0)::numeric as unit_cost,
      ci.item_kind as item_kind,
      ci.image_url,
      exists (
        select 1 from public.recipes r
        where r.active
          and r.finished_item_id = ci.id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = 'base'
      ) as has_recipe,
      ci.consumption_uom as consumption_uom,
      ci.purchase_pack_unit as purchase_pack_unit,
      ci.transfer_unit as transfer_unit,
      ci.transfer_quantity as transfer_quantity
    from public.catalog_items ci
    where ci.id in (select item_id from items_in_warehouse)
  ),
  variant_items as (
    select
      p_warehouse_id as warehouse_id,
      cv.item_id,
      ci.name as item_name,
      public.normalize_variant_key(cv.id) as variant_key,
      cv.name as variant_name,
      cv.sku as sku,
      0::numeric as net_units,
      coalesce(ci.cost, 0)::numeric as unit_cost,
      cv.item_kind as item_kind,
      coalesce(cv.image_url, ci.image_url) as image_url,
      exists (
        select 1 from public.recipes r
        where r.active
          and r.finished_item_id = cv.item_id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = public.normalize_variant_key(cv.id)
      ) as has_recipe,
      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,
      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,
      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,
      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity
    from storage_keys sk
    join public.catalog_variants cv
      on cv.item_id = sk.item_id
      and public.normalize_variant_key(cv.id) = sk.normalized_variant_key
    join public.catalog_items ci on ci.id = cv.item_id
    where sk.normalized_variant_key <> 'base'
      and coalesce(cv.active, true)
  ),
  available_items as (
    select * from base_items
    union all
    select * from variant_items
  ),
  with_stock as (
    select
      wli.warehouse_id,
      wli.item_id,
      wli.item_name,
      wli.variant_key,
      cv.name as variant_name,
      cv.sku as sku,
      wli.net_units,
      wli.unit_cost,
      wli.item_kind,
      coalesce(cv.image_url, ci.image_url, wli.image_url) as image_url,
      wli.has_recipe,
      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,
      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,
      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,
      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity
    from public.warehouse_live_items wli
    join public.catalog_items ci on ci.id = wli.item_id
    left join public.catalog_variants cv
      on cv.item_id = wli.item_id
      and public.normalize_variant_key(cv.id) = public.normalize_variant_key(wli.variant_key)
      and coalesce(cv.active, true)
    where wli.warehouse_id = p_warehouse_id
  )
  select
    ai.warehouse_id,
    ai.item_id,
    ai.item_name,
    ai.variant_key,
    ai.variant_name,
    ai.sku,
    coalesce(ws.net_units, ai.net_units) as net_units,
    ai.unit_cost,
    ai.item_kind,
    ai.image_url,
    ai.has_recipe,
    ai.consumption_uom,
    ai.purchase_pack_unit,
    ai.transfer_unit,
    ai.transfer_quantity
  from available_items ai
  left join with_stock ws
    on ws.warehouse_id = ai.warehouse_id
    and ws.item_id = ai.item_id
    and public.normalize_variant_key(ws.variant_key) = public.normalize_variant_key(ai.variant_key)
  where (
    p_search is null
    or ai.item_name ilike ('%' || p_search || '%')
    or coalesce(ai.variant_name, '') ilike ('%' || p_search || '%')
    or coalesce(ai.sku, '') ilike ('%' || p_search || '%')
  )
  order by item_name asc, variant_key asc;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.log_pos_sync_failure(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(payload->>'stage','') ilike '%pos_item_match%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_match%'
     or coalesce(payload->>'stage','') = 'missing_mapping'
     or coalesce(payload->>'error_message','') ilike '%missing_mapping%'
     or coalesce(payload->>'error_message','') ilike '%pos_item_map missing%'
     or coalesce(payload->>'error_message','') ilike '%no_mappable_items%'
     or coalesce(payload->>'error_message','') ilike '%no items had a valid pos_item_map%'
     or payload->'error_message' @> '[{"code":"no_mappable_items"}]'::jsonb
     or coalesce(payload->>'error_message','') ilike '%missing_open_stock_period%'
     or coalesce(payload->>'error_message','') ilike '%open stock period required%'
     or payload->'error_message' @> '[{"code":"missing_open_stock_period"}]'::jsonb
     or payload->'details' @> '[{"code":"missing_open_stock_period"}]'::jsonb
  then
    return;
  end if;

  insert into public.pos_sync_failures(
    outlet_id,
    source_event_id,
    pos_order_id,
    sale_id,
    stage,
    error_message,
    details
  ) values (
    nullif(payload->>'outlet_id','')::uuid,
    nullif(payload->>'source_event_id',''),
    nullif(payload->>'pos_order_id',''),
    nullif(payload->>'sale_id',''),
    coalesce(nullif(payload->>'stage',''),'unknown'),
    coalesce(nullif(payload->>'error_message',''), 'unknown error'),
    payload->'details'
  );
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.maintenance_purge_old_pos_sync_failures(p_retention_days integer DEFAULT 30)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint;
  v_days integer;
BEGIN
  v_days := GREATEST(COALESCE(p_retention_days, 30), 7);

  DELETE FROM public.pos_sync_failures
  WHERE created_at < now() - (v_days || ' days')::interval;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.mark_catalog_sync_delivered(p_event_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.outlet_catalog_sync_events
  SET status = 'delivered', delivered_at = now(), error_message = NULL
  WHERE id = ANY(p_event_ids);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.mark_order_loaded(p_order_id uuid, p_driver_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_supervisor(v_uid) OR public.is_admin(v_uid) THEN
    PERFORM public.dispatch_order(p_order_id, p_driver_name, p_signature_path);
    IF NULLIF(p_pdf_path, '') IS NOT NULL THEN
      UPDATE public.orders SET loaded_pdf_path = p_pdf_path, updated_at = now() WHERE id = p_order_id;
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'use dispatch_order from supervisor app; outlet completes via complete_order';
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.mark_order_modified(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.orders
  SET modified_by_supervisor = true,
      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),
      updated_at = now()
  WHERE id = p_order_id;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.mark_order_offloaded(p_order_id uuid, p_offloader_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.complete_order(p_order_id, p_offloader_name, p_signature_path, p_pdf_path);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_temp'
AS $function$
  SELECT COALESCE(
    CASE
      WHEN p_user_id IS NULL THEN NULL
      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)
      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)
    END,
    '{}'
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.member_outlet_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_temp'
AS $function$
  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));
$function$
-- @split
CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prefix text;
  v_next bigint;
  v_scope uuid := coalesce(p_outlet_id, '00000000-0000-0000-0000-000000000000');
begin
  if p_outlet_id is null then
    raise exception 'outlet id required for numbering';
  end if;

  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('order_number', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  select coalesce(nullif(o.code, ''), substr(o.id::text, 1, 4)) into v_prefix
  from public.outlets o
  where o.id = p_outlet_id;

  v_prefix := coalesce(v_prefix, 'OUT');
  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));
  return substr(v_prefix, 1, 1) || lpad(v_next::text, 11, '0');
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.next_transfer_reference()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_next bigint;
  v_scope uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('transfer', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  return 'WT-' || lpad(v_next::text, 6, '0');
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.normalize_uom_token(p_uom text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(trim(coalesce(p_uom, 'each')))
    WHEN 'pc' THEN 'each'
    WHEN 'pcs' THEN 'each'
    WHEN 'piece' THEN 'each'
    WHEN 'pieces' THEN 'each'
    WHEN 'plastic' THEN 'plastic'
    WHEN 'plastics' THEN 'plastic'
    WHEN 'tin can' THEN 'tin can'
    ELSE lower(trim(coalesce(p_uom, 'each')))
  END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.normalize_variant_key(p_variant_key text)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif($1, ''), 'base');
$function$
-- @split
CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_outlet uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;
  IF target_outlet IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.is_supervisor(p_user_id) AND public.is_warehouse_app_order(p_order_id) THEN
    RETURN true;
  END IF;

  RETURN (
    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))
    OR public.outlet_auth_user_matches(target_outlet, p_user_id)
  );
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.order_item_effective_qty_for_rule(p_order_id uuid, p_deduct_item_id uuid, p_deduct_variant_key text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line record;
  v_variant text := public.normalize_variant_key(p_deduct_variant_key);
  v_target_uom text := public.catalog_consumption_uom(p_deduct_item_id);
  v_total numeric := 0;
  v_raw numeric;
  v_pack_size numeric;
  v_pack_qty numeric;
BEGIN
  IF p_order_id IS NULL OR p_deduct_item_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_line IN
    SELECT
      oi.qty,
      oi.qty_cases,
      oi.receiving_contains,
      oi.receiving_uom,
      oi.consumption_uom,
      coalesce(ci.units_per_purchase_pack, 1) AS catalog_pack_units
    FROM public.order_items oi
    JOIN public.catalog_items ci ON ci.id = oi.product_id
    WHERE oi.order_id = p_order_id
      AND oi.product_id = p_deduct_item_id
      AND public.normalize_variant_key(oi.variation_key) = v_variant
  LOOP
    v_raw := coalesce(v_line.qty, 0);

    IF coalesce(v_line.qty_cases, 0) > 0 THEN
      v_pack_size := coalesce(
        nullif(v_line.receiving_contains, 0),
        nullif(v_line.catalog_pack_units, 0)
      );

      IF v_pack_size IS NOT NULL AND v_pack_size > 0 THEN
        v_pack_qty := v_line.qty_cases * v_pack_size;
        IF public.is_pack_receiving_uom(v_line.receiving_uom)
          OR public.is_pack_receiving_uom(v_target_uom)
          OR abs(v_pack_qty - coalesce(v_line.qty, 0)) > 0.0001 THEN
          v_raw := v_pack_qty;
        END IF;
      END IF;
    END IF;

    v_total := v_total + public.convert_catalog_uom_qty(
      v_raw,
      v_line.consumption_uom,
      v_target_uom
    );
  END LOOP;

  RETURN coalesce(v_total, 0);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(p_outlet_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.outlets o
    WHERE o.id = p_outlet_id AND o.auth_user_id = p_user_id AND o.active
  );
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.outlet_default_warehouses(p_outlet_id uuid)
 RETURNS TABLE(default_sales_warehouse_id uuid, default_receiving_warehouse_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.default_sales_warehouse_id, o.default_receiving_warehouse_id
  from public.outlets o
  where o.id = p_outlet_id;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.outlet_pos_sale_in_sync_window(p_outlet_id uuid, p_sold_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT true;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.patch_pos_order_payload(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_existing jsonb;
  v_merged jsonb;
BEGIN
  IF v_outlet IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'outlet_id and source_event_id are required';
  END IF;

  SELECT raw_payload INTO v_existing
  FROM public.orders
  WHERE source_event_id = v_source AND outlet_id = v_outlet
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_merged := COALESCE(v_existing, '{}'::jsonb);

  IF payload ? 'occurred_at' AND nullif(payload->>'occurred_at', '') IS NOT NULL THEN
    v_merged := v_merged || jsonb_build_object('occurred_at', payload->'occurred_at');
  END IF;
  IF payload ? 'terminal' AND nullif(payload->>'terminal', '') IS NOT NULL THEN
    v_merged := v_merged || jsonb_build_object('terminal', payload->'terminal');
  END IF;
  IF payload ? 'payments' THEN
    v_merged := v_merged || jsonb_build_object('payments', payload->'payments');
  END IF;
  IF payload ? 'customer' AND payload->'customer' IS NOT NULL THEN
    v_merged := v_merged || jsonb_build_object('customer', payload->'customer');
  END IF;
  IF payload ? 'sale_id' AND nullif(payload->>'sale_id', '') IS NOT NULL THEN
    v_merged := v_merged || jsonb_build_object('sale_id', payload->'sale_id');
  END IF;

  IF payload ? 'shift' AND payload->'shift' IS NOT NULL AND payload->'shift' <> 'null'::jsonb THEN
    v_merged := jsonb_set(v_merged, '{shift}', payload->'shift', true);
  END IF;

  UPDATE public.orders
  SET raw_payload = v_merged,
      updated_at = now()
  WHERE source_event_id = v_source AND outlet_id = v_outlet;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.place_order(p_outlet_id uuid, p_items jsonb, p_employee_name text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := now();
  v_row public.orders%rowtype;
  v_item jsonb;
  v_qty numeric;
  v_qty_cases numeric;
  v_receiving_contains numeric;
  v_default_sales_wh uuid;
  v_variant_key text;
  v_route_wh uuid;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet id required';
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR p_outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'not authorized for outlet %', p_outlet_id;
  END IF;

  SELECT default_sales_warehouse_id
    INTO v_default_sales_wh
  FROM public.outlet_default_warehouses(p_outlet_id);

  INSERT INTO public.orders(
    outlet_id,
    order_number,
    status,
    locked,
    created_by,
    tz,
    pdf_path,
    employee_signed_name,
    employee_signature_path,
    employee_signed_at,
    source_event_id,
    updated_at,
    created_at
  ) VALUES (
    p_outlet_id,
    public.next_order_number(p_outlet_id),
    'placed',
    false,
    v_uid,
    COALESCE(current_setting('TIMEZONE', true), 'UTC'),
    p_pdf_path,
    COALESCE(NULLIF(p_employee_name, ''), p_employee_name),
    NULLIF(p_signature_path, ''),
    v_now,
    NULL,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    IF (v_item ->> 'product_id') IS NULL THEN
      RAISE EXCEPTION 'product_id is required for each line item';
    END IF;

    v_receiving_contains := NULLIF(v_item ->> 'receiving_contains', '')::numeric;
    v_qty := COALESCE((v_item ->> 'qty')::numeric, 0);
    v_qty_cases := COALESCE((v_item ->> 'qty_cases')::numeric, NULL);
    IF v_qty_cases IS NULL AND v_receiving_contains IS NOT NULL AND v_receiving_contains > 0 THEN
      v_qty_cases := v_qty / v_receiving_contains;
    END IF;

    v_variant_key := public.normalize_variant_key(
      COALESCE(NULLIF(v_item ->> 'variation_key', ''), NULLIF(v_item ->> 'variation_id', ''), 'base')
    );

    v_route_wh := v_default_sales_wh;

    INSERT INTO public.order_items(
      order_id,
      product_id,
      variation_id,
      variation_key,
      warehouse_id,
      name,
      receiving_uom,
      consumption_uom,
      cost,
      qty,
      qty_cases,
      receiving_contains,
      amount
    ) VALUES (
      v_row.id,
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variation_id', '')::uuid,
      v_variant_key,
      v_route_wh,
      COALESCE(NULLIF(v_item ->> 'name', ''), 'Item'),
      COALESCE(NULLIF(v_item ->> 'receiving_uom', ''), 'each'),
      COALESCE(NULLIF(v_item ->> 'consumption_uom', ''), 'each'),
      COALESCE((v_item ->> 'cost')::numeric, 0),
      v_qty,
      v_qty_cases,
      v_receiving_contains,
      COALESCE((v_item ->> 'cost')::numeric, 0) * v_qty
    );
  END LOOP;

  order_id := v_row.id;
  order_number := v_row.order_number;
  created_at := v_row.created_at;
  RETURN NEXT;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.recipe_uom_available_qty(p_warehouse_id uuid, p_item_id uuid, p_variant_key text DEFAULT 'base'::text)
 RETURNS TABLE(item_id uuid, variant_key text, source_uom text, target_uom text, base_qty numeric, recipe_qty numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with stock as (
    select * from public.list_warehouse_items(p_warehouse_id, null, null)
    where item_id = p_item_id
      and normalize_variant_key(variant_key) = normalize_variant_key(coalesce(p_variant_key, 'base'))
    limit 1
  ),
  profile as (
    select * from public.recipe_uom_profiles
    where item_id = p_item_id
      and normalize_variant_key(variant_key) = normalize_variant_key(coalesce(p_variant_key, 'base'))
      and active
    limit 1
  ),
  steps as (
    select multiplier
    from public.recipe_uom_chain_steps
    where profile_id = (select id from profile)
    order by step_order
  )
  select
    stock.item_id,
    stock.variant_key,
    profile.source_uom,
    profile.target_uom,
    stock.net_units as base_qty,
    stock.net_units * coalesce((select exp(sum(ln(multiplier))) from steps), 1) as recipe_qty
  from stock
  join profile on true;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_damage_id uuid;
  v_variant_key text;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse_id is required';
  end if;

  perform public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one damage line is required';
  end if;

  insert into public.warehouse_damages(warehouse_id, note, context, created_by)
  values (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())
  returning id into v_damage_id;

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units,
      nullif(elem->>'note', '') as line_note
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each damage line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)
    values (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      v_variant_key,
      -1 * rec.qty_units,
      'damage',
      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))
    );
  end loop;

  return v_damage_id;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.record_order_fulfillment(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.record_outlet_sale(p_outlet_id uuid, p_item_id uuid, p_qty_units numeric, p_variant_key text DEFAULT 'base'::text, p_sold_at timestamp with time zone DEFAULT now(), p_context jsonb DEFAULT '{}'::jsonb, p_is_production boolean DEFAULT false, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.record_outlet_warehouse_order_receipt(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_outlet record;
  v_warehouse_id uuid;
  v_receipt_id uuid;
  v_line_count integer := 0;
  v_total_units numeric := 0;
  v_total_value numeric := 0;
  v_order_lines jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT o.id, o.uses_orders_app, o.default_receiving_warehouse_id
  INTO v_outlet
  FROM public.outlets o
  WHERE o.id = v_order.outlet_id;

  IF NOT COALESCE(v_outlet.uses_orders_app, false) THEN
    RETURN NULL;
  END IF;

  v_warehouse_id := v_outlet.default_receiving_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT ow.warehouse_id
    INTO v_warehouse_id
    FROM public.outlet_warehouses ow
    WHERE ow.outlet_id = v_outlet.id
    ORDER BY ow.warehouse_id
    LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::integer,
         COALESCE(SUM(oi.qty), 0),
         COALESCE(SUM(COALESCE(oi.amount, oi.qty * oi.cost, 0)), 0)
  INTO v_line_count, v_total_units, v_total_value
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', oi.product_id,
        'variant_key', public.normalize_variant_key(oi.variation_key),
        'qty', oi.qty,
        'cost', oi.cost,
        'amount', oi.amount
      )
      ORDER BY oi.created_at
    ),
    '[]'::jsonb
  )
  INTO v_order_lines
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  INSERT INTO public.outlet_warehouse_order_receipts (
    outlet_id,
    warehouse_id,
    order_id,
    approved_at,
    line_count,
    total_units,
    total_value,
    metadata
  )
  VALUES (
    v_order.outlet_id,
    v_warehouse_id,
    p_order_id,
    now(),
    v_line_count,
    v_total_units,
    v_total_value,
    jsonb_build_object('order_lines', v_order_lines, 'source', 'order_items')
  )
  ON CONFLICT (order_id, warehouse_id) DO UPDATE SET
    line_count = EXCLUDED.line_count,
    total_units = EXCLUDED.total_units,
    total_value = EXCLUDED.total_value,
    metadata = EXCLUDED.metadata,
    approved_at = EXCLUDED.approved_at
  RETURNING id INTO v_receipt_id;

  RETURN v_receipt_id;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_item_id is null then
    return;
  end if;
  update public.catalog_items ci
  set has_variations = exists (
        select 1
        from public.catalog_variants cv
        where cv.item_id = p_item_id
          and coalesce(cv.active, true)
      ),
      updated_at = now()
  where ci.id = p_item_id;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_catalog_has_variations(coalesce(new.item_id, old.item_id));
  return coalesce(new, old);
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.replace_recipe_uom_chain(p_profile_id uuid, p_steps jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.recipe_uom_chain_steps where profile_id = p_profile_id;

  insert into public.recipe_uom_chain_steps (profile_id, step_order, from_uom, to_uom, multiplier)
  select
    p_profile_id,
    (step->>'step_order')::int,
    step->>'from_uom',
    step->>'to_uom',
    (step->>'multiplier')::numeric
  from jsonb_array_elements(p_steps) as step;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.resolve_catalog_by_sku(p_item_sku text, p_variant_sku text DEFAULT NULL::text)
 RETURNS TABLE(catalog_item_id uuid, catalog_item_name text, catalog_item_sku text, variant_key text, variant_name text, variant_sku text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_sku text := nullif(trim(p_item_sku), '');
  v_variant_sku text := nullif(trim(p_variant_sku), '');
  v_item_id uuid;
BEGIN
  IF v_item_sku IS NULL THEN
    RETURN;
  END IF;

  -- Match by SKU (case-insensitive) or by catalog item UUID in Code field
  SELECT ci.id INTO v_item_id
  FROM public.catalog_items ci
  WHERE lower(ci.sku) = lower(v_item_sku)
     OR ci.id::text = v_item_sku
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN;
  END IF;

  IF v_variant_sku IS NOT NULL THEN
    RETURN QUERY
    SELECT
      ci.id,
      ci.name,
      ci.sku,
      public.normalize_variant_key(cv.id),
      cv.name,
      cv.sku
    FROM public.catalog_items ci
    JOIN public.catalog_variants cv ON cv.item_id = ci.id
    WHERE ci.id = v_item_id
      AND (lower(cv.sku) = lower(v_variant_sku) OR cv.id = v_variant_sku)
      AND COALESCE(cv.active, true)
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ci.id, ci.name, ci.sku, 'base'::text, NULL::text, NULL::text
  FROM public.catalog_items ci
  WHERE ci.id = v_item_id
  LIMIT 1;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.resolve_catalog_for_outlet(p_outlet_id uuid, p_item_sku text, p_variant_sku text DEFAULT NULL::text, p_pos_item_name text DEFAULT NULL::text)
 RETURNS TABLE(catalog_item_id uuid, catalog_item_name text, catalog_item_sku text, variant_key text, variant_name text, variant_sku text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_sku text := nullif(trim(p_item_sku), '');
  v_variant_sku text := nullif(trim(p_variant_sku), '');
  v_pos_name text := nullif(trim(p_pos_item_name), '');
  v_bound_catalog_item_id uuid;
  v_bound_variant_key text;
BEGIN
  IF p_outlet_id IS NULL OR v_item_sku IS NULL THEN
    RETURN;
  END IF;

  -- A) Existing auto-binding from middleware catalog sync
  SELECT b.catalog_item_id, b.catalog_variant_key
  INTO v_bound_catalog_item_id, v_bound_variant_key
  FROM public.outlet_pos_catalog_bindings b
  WHERE b.outlet_id = p_outlet_id
    AND lower(b.item_sku) = lower(v_item_sku)
    AND b.variant_sku = COALESCE(v_variant_sku, '')
  LIMIT 1;

  IF v_bound_catalog_item_id IS NOT NULL THEN
    RETURN QUERY
    SELECT * FROM public.resolve_catalog_by_sku(
      (SELECT ci.sku FROM public.catalog_items ci WHERE ci.id = v_bound_catalog_item_id),
      v_variant_sku
    );
    RETURN;
  END IF;

  -- B) Outlet allowlist + MintPOS name (handles Id-as-Code collisions)
  IF v_pos_name IS NOT NULL THEN
    RETURN QUERY
    SELECT
      ci.id,
      ci.name,
      ci.sku,
      COALESCE(cv.id::text, 'base'),
      cv.name,
      cv.sku
    FROM public.outlet_catalog_allowlist oca
    JOIN public.catalog_items ci ON ci.id = oca.item_id
    LEFT JOIN public.catalog_variants cv
      ON cv.item_id = ci.id
     AND v_variant_sku IS NOT NULL
     AND (lower(cv.sku) = lower(v_variant_sku) OR cv.id::text = v_variant_sku)
    WHERE oca.outlet_id = p_outlet_id
      AND oca.allow_orders = true
      AND lower(trim(ci.name)) = lower(v_pos_name)
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- C) Allowlist + global sku (when POS Code already matches website sku)
  RETURN QUERY
  SELECT r.*
  FROM public.resolve_catalog_by_sku(v_item_sku, v_variant_sku) r
  JOIN public.outlet_catalog_allowlist oca
    ON oca.item_id = r.catalog_item_id
   AND oca.outlet_id = p_outlet_id
   AND oca.allow_orders = true
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- D) Last resort: global sku (legacy)
  RETURN QUERY
  SELECT * FROM public.resolve_catalog_by_sku(v_item_sku, v_variant_sku);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.rollup_from_component(p_warehouse_id uuid, p_component_id uuid, p_variant_key text, p_delta_units numeric, p_source_ledger_id uuid, p_depth integer DEFAULT 0, p_seen uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_variant text := public.normalize_variant_key(coalesce(p_variant_key, 'base'));
  v_produced numeric;
begin
  if p_delta_units <= 0 then
    return;
  end if;
  if p_depth > 6 then
    return; -- safety guard
  end if;
  if p_component_id = any (p_seen) then
    return; -- avoid cycles
  end if;

  for rec in
    select
      r.finished_item_id      as parent_item_id,
      public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) as parent_variant,
      r.qty_per_unit,
      coalesce(r.yield_qty_units, 1) as yield_units,
      ci.item_kind            as parent_kind
    from public.recipes r
    join public.catalog_items ci on ci.id = r.finished_item_id
    where r.active
      and r.ingredient_item_id = p_component_id
      and r.recipe_for_kind = ci.item_kind
  loop
    if rec.qty_per_unit <= 0 or rec.yield_units <= 0 then
      continue;
    end if;

    v_produced := (p_delta_units / rec.qty_per_unit) * rec.yield_units;

    insert into public.stock_ledger(
      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
    ) values (
      'warehouse',
      p_warehouse_id,
      rec.parent_item_id,
      rec.parent_variant,
      v_produced,
      'rollup_production',
      jsonb_build_object(
        'source_ledger_id', p_source_ledger_id,
        'component_id', p_component_id,
        'component_delta', p_delta_units,
        'qty_per_unit', rec.qty_per_unit,
        'yield_units', rec.yield_units
      )
    );

    perform public.rollup_from_component(
      p_warehouse_id,
      rec.parent_item_id,
      rec.parent_variant,
      v_produced,
      p_source_ledger_id,
      p_depth + 1,
      array_append(p_seen, p_component_id)
    );
  end loop;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.rollup_on_raw_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind item_kind;
begin
  if new.location_type <> 'warehouse' or new.delta_units <= 0 then
    return new;
  end if;

  select ci.item_kind into v_kind from public.catalog_items ci where ci.id = new.item_id;
  if v_kind <> 'raw' then
    return new;
  end if;

  perform public.rollup_from_component(
    new.warehouse_id,
    new.item_id,
    new.variant_key,
    new.delta_units,
    new.id,
    0,
    array[new.item_id]
  );
  return new;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_pos_sync_cutoff_for_warehouse(p_warehouse_id uuid, p_cutoff timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cutoff_epoch bigint;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if p_cutoff is null then
    raise exception 'cutoff required';
  end if;

  v_cutoff_epoch := floor(extract(epoch from p_cutoff));

  insert into public.counter_values(counter_key, scope_id, last_value)
  select 'pos_sync_cutoff', o.id, v_cutoff_epoch
  from public.outlets o
  where o.default_sales_warehouse_id = p_warehouse_id

  union

  select 'pos_sync_cutoff', ow.outlet_id, v_cutoff_epoch
  from public.outlet_warehouses ow
  where ow.warehouse_id = p_warehouse_id
    and coalesce(ow.show_in_stocktake, true)

  on conflict (counter_key, scope_id)
  do update
    set last_value = excluded.last_value,
        updated_at = now();
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_pos_sync_opening_for_warehouse(p_warehouse_id uuid, p_opened timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_opened_epoch bigint;
  v_outlets uuid[];
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if p_opened is null then
    raise exception 'opened time required';
  end if;

  v_opened_epoch := floor(extract(epoch from p_opened));

  select array_agg(outlet_id)
  into v_outlets
  from (
    select o.id as outlet_id
    from public.outlets o
    where o.default_sales_warehouse_id = p_warehouse_id

    union

    select ow.outlet_id
    from public.outlet_warehouses ow
    where ow.warehouse_id = p_warehouse_id
      and coalesce(ow.show_in_stocktake, true)
  ) scope_outlets;

  if v_outlets is null or array_length(v_outlets, 1) is null then
    raise exception 'no outlet mappings found for warehouse %', p_warehouse_id;
  end if;

  insert into public.counter_values(counter_key, scope_id, last_value)
  select 'pos_sync_opening', unnest(v_outlets), v_opened_epoch
  on conflict (counter_key, scope_id)
  do update
    set last_value = excluded.last_value,
        updated_at = now();

  update public.counter_values
  set last_value = 0,
      updated_at = now()
  where counter_key = 'pos_sync_cutoff'
    and scope_id = any(v_outlets);
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_production_assignment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_transfer_operator_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.operator_name is null or btrim(new.operator_name) = '' then
    if new.created_by is not null then
      select coalesce(u.raw_user_meta_data->>'display_name', u.email, 'Operator')
        into new.operator_name
      from auth.users u
      where u.id = new.created_by;
    else
      new.operator_name := 'Operator';
    end if;
  end if;
  return new;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_uom_conversion_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_uom_options_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.set_warehouse_auth_account_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.active IS TRUE AND (OLD.active IS DISTINCT FROM TRUE) THEN
    NEW.activated_at := now();
  END IF;
  IF NEW.active IS FALSE THEN
    NEW.activated_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.stock_ledger_flow_trace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sale_id uuid := nullif(new.context->>'sale_id', '')::uuid;
  v_order_id uuid := nullif(new.context->>'order_id', '')::uuid;
  v_outlet_id uuid := nullif(new.context->>'outlet_id', '')::uuid;
  v_component_kind text := lower(coalesce(new.context->>'component_kind', ''));
  v_flow_batch_id uuid := coalesce(new.flow_batch_id, nullif(new.context->>'flow_batch_id', '')::uuid);
  v_level text;
  v_trace_id uuid;
  v_available numeric := null;
  v_negative boolean := false;
begin
  if new.reason not in ('outlet_sale', 'recipe_consumption') then
    return new;
  end if;

  if new.reason = 'outlet_sale' then
    v_level := 'finished';
  elsif v_component_kind = 'ingredient' then
    v_level := 'ingredient';
  else
    v_level := 'raw';
  end if;

  if new.warehouse_id is not null then
    select wli.net_units
      into v_available
    from public.warehouse_live_items wli
    where wli.warehouse_id = new.warehouse_id
      and wli.item_id = new.item_id
      and public.normalize_variant_key(wli.variant_key) = public.normalize_variant_key(coalesce(new.variant_key, 'base'))
    limit 1;
  end if;

  if v_available is not null and v_available < 0 then
    v_negative := true;
  end if;

  if v_flow_batch_id is not null then
    insert into public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      flow_batch_id,
      context
    ) values (
      v_sale_id,
      v_order_id,
      v_outlet_id,
      v_level,
      new.item_id,
      public.normalize_variant_key(coalesce(new.variant_key, 'base')),
      new.warehouse_id,
      v_flow_batch_id,
      new.context
    )
    on conflict on constraint ux_flow_traces_batch_level_item_wh
    do update set
      context = excluded.context
    returning id into v_trace_id;
  else
    insert into public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      context
    ) values (
      v_sale_id,
      v_order_id,
      v_outlet_id,
      v_level,
      new.item_id,
      public.normalize_variant_key(coalesce(new.variant_key, 'base')),
      new.warehouse_id,
      new.context
    )
    on conflict on constraint ux_flow_traces_sale_level_item_wh
    do update set
      context = excluded.context
    returning id into v_trace_id;
  end if;

  insert into public.flow_trace_steps (
    trace_id,
    occurred_at,
    delta_units,
    available_units,
    reason,
    negative,
    context,
    flow_batch_id,
    ledger_id
  ) values (
    v_trace_id,
    new.occurred_at,
    new.delta_units,
    v_available,
    new.reason,
    v_negative,
    new.context,
    v_flow_batch_id,
    new.id
  )
  on conflict (ledger_id)
  do nothing;

  return new;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.stock_ledger_set_occurred_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.occurred_at := coalesce(
    new.occurred_at,
    (new.context->>'sold_at')::timestamptz,
    (new.context->>'order_created_at')::timestamptz,
    (new.context->>'movement_created_at')::timestamptz,
    now()
  );
  return new;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.supervisor_approve_order(p_order_id uuid, p_supervisor_name text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_pdf_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.accept_order(p_order_id, p_supervisor_name, p_signature_path, p_pdf_path);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.supervisor_merge_order_item_variant(p_order_item_id uuid, p_new_variant_key text, p_new_name text DEFAULT NULL::text, p_receiving_uom text DEFAULT NULL::text, p_consumption_uom text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_new_key text;
  v_target_id uuid;
  v_target_qty numeric;
  v_merged_qty numeric;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_src FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_src.order_id FOR UPDATE;
  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN
    RAISE EXCEPTION 'order must be placed to merge variants';
  END IF;

  v_new_key := public.normalize_variant_key(COALESCE(p_new_variant_key, 'base'));

  SELECT oi.id, oi.qty
    INTO v_target_id, v_target_qty
  FROM public.order_items oi
  WHERE oi.order_id = v_src.order_id
    AND oi.product_id = v_src.product_id
    AND public.normalize_variant_key(oi.variation_key) = v_new_key
    AND oi.id <> v_src.id
  LIMIT 1;

  IF v_target_id IS NOT NULL THEN
    v_merged_qty := COALESCE(v_target_qty, 0) + COALESCE(v_src.qty, 0);
    UPDATE public.order_items
    SET qty = v_merged_qty,
        amount = COALESCE(cost, 0) * v_merged_qty
    WHERE id = v_target_id;

    PERFORM set_config('order_items.supervisor_merge', 'on', true);
    DELETE FROM public.order_items WHERE id = v_src.id;
    PERFORM set_config('order_items.supervisor_merge', 'off', true);
  ELSE
    UPDATE public.order_items
    SET variation_key = v_new_key,
        name = COALESCE(NULLIF(p_new_name, ''), name),
        receiving_uom = COALESCE(NULLIF(p_receiving_uom, ''), receiving_uom),
        consumption_uom = COALESCE(NULLIF(p_consumption_uom, ''), consumption_uom),
        cost = COALESCE(p_cost, cost),
        amount = COALESCE(COALESCE(p_cost, cost), 0) * COALESCE(qty, 0)
    WHERE id = v_src.id;
  END IF;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)
 RETURNS TABLE(id uuid, name text, contact_name text, contact_phone text, contact_email text, active boolean, scanner_id uuid, scanner_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    s.id,
    s.name,
    s.contact_name,
    s.contact_phone,
    s.contact_email,
    s.active,
    s.scanner_id,
    sc.name AS scanner_name
  FROM public.product_supplier_links psl
  JOIN public.suppliers s ON s.id = psl.supplier_id
  LEFT JOIN public.scanners sc ON sc.id = s.scanner_id
  WHERE s.active
    AND psl.active
    AND (
      p_warehouse_id IS NULL
      OR psl.warehouse_id IS NULL
      OR psl.warehouse_id = p_warehouse_id
    );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.sync_outlet_pos_catalog_bindings(p_outlet_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_catalog_item_id uuid;
  v_variant_key text;
  v_bindings_upserted int := 0;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'p_outlet_id is required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('bindings_upserted', 0);
  END IF;

  FOR v_row IN
    SELECT
      nullif(trim(r.item_sku), '') AS item_sku,
      nullif(trim(r.item_name), '') AS item_name,
      nullif(trim(r.variant_sku), '') AS variant_sku,
      nullif(trim(r.variant_name), '') AS variant_name
    FROM jsonb_to_recordset(p_rows) AS r(
      item_sku text,
      item_name text,
      variant_sku text,
      variant_name text
    )
  LOOP
    IF v_row.item_sku IS NULL OR v_row.item_name IS NULL THEN
      CONTINUE;
    END IF;

    v_catalog_item_id := NULL;
    v_variant_key := NULL;

    -- Match by name within outlet allowlist (primary — avoids cross-outlet Id collisions)
    SELECT ci.id INTO v_catalog_item_id
    FROM public.outlet_catalog_allowlist oca
    JOIN public.catalog_items ci ON ci.id = oca.item_id
    WHERE oca.outlet_id = p_outlet_id
      AND oca.allow_orders = true
      AND lower(trim(ci.name)) = lower(trim(v_row.item_name))
    LIMIT 1;

    -- Fallback: allowlist + sku
    IF v_catalog_item_id IS NULL THEN
      SELECT ci.id INTO v_catalog_item_id
      FROM public.outlet_catalog_allowlist oca
      JOIN public.catalog_items ci ON ci.id = oca.item_id
      WHERE oca.outlet_id = p_outlet_id
        AND oca.allow_orders = true
        AND lower(ci.sku) = lower(v_row.item_sku)
      LIMIT 1;
    END IF;

    IF v_catalog_item_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.variant_sku IS NOT NULL THEN
      SELECT cv.id::text INTO v_variant_key
      FROM public.catalog_variants cv
      WHERE cv.item_id = v_catalog_item_id
        AND (lower(cv.sku) = lower(v_row.variant_sku) OR cv.id::text = v_row.variant_sku)
      LIMIT 1;
    END IF;

    INSERT INTO public.outlet_pos_catalog_bindings (
      outlet_id, item_sku, variant_sku, catalog_item_id, pos_item_name, catalog_variant_key, updated_at
    ) VALUES (
      p_outlet_id,
      v_row.item_sku,
      COALESCE(v_row.variant_sku, ''),
      v_catalog_item_id,
      v_row.item_name,
      COALESCE(v_variant_key, 'base'),
      now()
    )
    ON CONFLICT (outlet_id, item_sku, variant_sku)
    DO UPDATE SET
      catalog_item_id = EXCLUDED.catalog_item_id,
      pos_item_name = EXCLUDED.pos_item_name,
      catalog_variant_key = EXCLUDED.catalog_variant_key,
      updated_at = now();

    v_bindings_upserted := v_bindings_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('bindings_upserted', v_bindings_upserted);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.sync_pos_catalog_from_middleware(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_items_updated int := 0;
  v_variants_updated int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with src as (
    select
      nullif(trim(item_sku), '') as item_sku,
      nullif(trim(item_name), '') as item_name,
      nullif(trim(variant_name), '') as variant_name,
      nullif(trim(variant_sku), '') as variant_sku
    from jsonb_to_recordset(p_rows) as r(
      item_sku text,
      item_name text,
      variant_name text,
      variant_sku text
    )
  ),
  upd as (
    update public.catalog_items ci
    set
      name = coalesce(src.item_name, ci.name),
      updated_at = now()
    from src
    where ci.item_kind = 'finished'
      and ci.sku = src.item_sku
      and src.item_sku is not null
      and src.item_name is not null
    returning 1
  )
  select count(*) into v_items_updated from upd;

  with src as (
    select
      nullif(trim(item_sku), '') as item_sku,
      nullif(trim(variant_name), '') as variant_name,
      nullif(trim(variant_sku), '') as variant_sku
    from jsonb_to_recordset(p_rows) as r(
      item_sku text,
      item_name text,
      variant_name text,
      variant_sku text
    )
  ),
  upd as (
    update public.catalog_variants cv
    set
      name = src.variant_name,
      sku = coalesce(src.variant_sku, cv.sku),
      updated_at = now()
    from src, public.catalog_items ci
    where ci.item_kind = 'finished'
      and cv.item_id = ci.id
      and ci.sku = src.item_sku
      and src.item_sku is not null
      and src.variant_name is not null
      and lower(trim(cv.name)) = lower(trim(src.variant_name))
    returning 1
  )
  select count(*) into v_variants_updated from upd;

  return jsonb_build_object(
    'ok', true,
    'items_updated', v_items_updated,
    'variants_updated', v_variants_updated
  );
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.sync_pos_menu_groups_from_middleware(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_groups_upserted int := 0;
  v_items_linked int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with src as (
    select distinct
      nullif(trim(grp_row ->> 'group_name'), '') as group_name,
      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id
    from jsonb_array_elements(p_rows) as grp_row
    where nullif(trim(grp_row ->> 'group_name'), '') is not null
  ),
  updated as (
    update public.catalog_menu_groups g
    set
      pos_menu_group_id = coalesce(src.pos_menu_group_id, g.pos_menu_group_id),
      updated_at = now()
    from src
    where lower(trim(g.name)) = lower(trim(src.group_name))
    returning g.id
  ),
  inserted as (
    insert into public.catalog_menu_groups (name, pos_menu_group_id, updated_at)
    select src.group_name, src.pos_menu_group_id, now()
    from src
    where not exists (
      select 1
      from public.catalog_menu_groups g
      where lower(trim(g.name)) = lower(trim(src.group_name))
    )
    returning id
  )
  select (select count(*) from updated) + (select count(*) from inserted) into v_groups_upserted;

  with src as (
    select
      nullif(trim(grp_row ->> 'item_sku'), '') as item_sku,
      nullif(trim(grp_row ->> 'group_name'), '') as group_name,
      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id
    from jsonb_array_elements(p_rows) as grp_row
  ),
  grp as (
    select
      src.item_sku,
      coalesce(
        g_by_id.id,
        g_by_name.id
      ) as menu_group_id
    from src
    left join public.catalog_menu_groups g_by_id
      on g_by_id.pos_menu_group_id = src.pos_menu_group_id
    left join public.catalog_menu_groups g_by_name
      on lower(trim(g_by_name.name)) = lower(trim(src.group_name))
    where src.item_sku is not null
      and (src.group_name is not null or src.pos_menu_group_id is not null)
  ),
  upd as (
    update public.catalog_items ci
    set
      menu_group_id = grp.menu_group_id,
      updated_at = now()
    from grp
    where ci.item_kind = 'finished'
      and ci.sku = grp.item_sku
      and grp.menu_group_id is not null
    returning 1
  )
  select count(*) into v_items_linked from upd;

  return jsonb_build_object(
    'ok', true,
    'groups_upserted', v_groups_upserted,
    'items_linked', v_items_linked
  );
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_order_id uuid;
  v_existing jsonb;
  v_merged jsonb;
  v_item jsonb;
  v_resolved record;
  v_qty numeric;
  v_qty_text text;
  v_branch integer := nullif(payload->>'branch_id', '')::integer;
  v_outlet_name text;
  v_item_sku text;
  v_variant_sku text;
  v_pos_item_name text;
  v_ctx jsonb;
  v_sold_at timestamptz;
  v_has_lines boolean;
BEGIN
  IF v_outlet IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'outlet_id and source_event_id are required';
  END IF;

  SELECT id, raw_payload INTO v_order_id, v_existing
  FROM public.orders
  WHERE source_event_id = v_source AND outlet_id = v_outlet
  FOR UPDATE;

  v_merged := COALESCE(v_existing, '{}'::jsonb);
  v_merged := v_merged || (payload - 'items');

  IF payload ? 'shift' AND payload->'shift' IS NOT NULL AND payload->'shift' <> 'null'::jsonb THEN
    v_merged := jsonb_set(v_merged, '{shift}', payload->'shift', true);
  END IF;

  IF v_order_id IS NULL THEN
    v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());
    SELECT name INTO v_outlet_name FROM public.outlets WHERE id = v_outlet;

    BEGIN
      INSERT INTO public.orders (
        outlet_id, source_event_id, pos_sale_id, status, locked, branch_id, pos_branch_id,
        order_type, bill_type, total_discount, total_discount_amount, total_gst,
        service_charges, delivery_charges, tip, pos_fee, price_type,
        customer_name, customer_phone, customer_email, raw_payload
      )
      VALUES (
        v_outlet, v_source, nullif(payload->>'sale_id', ''),
        'synced', true, v_branch, v_branch,
        payload->>'order_type', payload->>'bill_type',
        nullif(payload->>'total_discount', '')::numeric,
        nullif(payload->>'total_discount_amount', '')::numeric,
        nullif(payload->>'total_gst', '')::numeric,
        nullif(payload->>'service_charges', '')::numeric,
        nullif(payload->>'delivery_charges', '')::numeric,
        nullif(payload->>'tip', '')::numeric,
        nullif(payload->>'pos_fee', '')::numeric,
        payload->>'price_type',
        payload->'customer'->>'name',
        payload->'customer'->>'phone',
        payload->'customer'->>'email',
        v_merged
      )
      RETURNING id INTO v_order_id;
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.orders
        SET raw_payload = v_merged,
            updated_at = now()
        WHERE source_event_id = v_source AND outlet_id = v_outlet
        RETURNING id INTO v_order_id;
    END;
  ELSE
    UPDATE public.orders
    SET raw_payload = v_merged,
        updated_at = now()
    WHERE id = v_order_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.outlet_sales os
    WHERE os.outlet_id = v_outlet
      AND os.context->>'source_event_id' = v_source
    LIMIT 1
  ) INTO v_has_lines;

  IF v_has_lines THEN
    RETURN;
  END IF;

  IF v_order_id IS NULL THEN
    SELECT id INTO v_order_id FROM public.orders WHERE source_event_id = v_source AND outlet_id = v_outlet;
  END IF;

  v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());
  SELECT name INTO v_outlet_name FROM public.outlets WHERE id = v_outlet;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))
  LOOP
    v_item_sku := nullif(trim(coalesce(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');
    IF v_item_sku IS NULL THEN
      v_item_sku := nullif(trim(v_item->>'pos_item_id'), '');
    END IF;
    v_variant_sku := nullif(trim(coalesce(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');
    v_pos_item_name := nullif(trim(v_item->>'name'), '');
    IF v_item_sku IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_resolved
    FROM public.resolve_catalog_for_outlet(v_outlet, v_item_sku, v_variant_sku, v_pos_item_name)
    LIMIT 1;
    IF NOT FOUND OR v_resolved.catalog_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_qty_text := nullif(v_item->>'quantity', '');
    v_qty := COALESCE(v_qty_text::numeric, 0);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_ctx := jsonb_build_object(
      'outlet_name', v_outlet_name,
      'outlet_id', v_outlet,
      'catalog_item_id', v_resolved.catalog_item_id,
      'catalog_item_name', v_resolved.catalog_item_name,
      'catalog_item_sku', v_resolved.catalog_item_sku,
      'variant_key', v_resolved.variant_key,
      'variant_name', v_resolved.variant_name,
      'variant_sku', v_resolved.variant_sku,
      'pos_item_id', v_item->>'pos_item_id',
      'source_event_id', v_source,
      'sale_id', payload->>'sale_id',
      'order_id', v_order_id
    );

    INSERT INTO public.outlet_sales (
      outlet_id, item_id, qty_units, variant_key, sold_at, sale_price,
      vat_exc_price, flavour_price, flavour_id, context
    )
    VALUES (
      v_outlet, v_resolved.catalog_item_id, v_qty, v_resolved.variant_key, v_sold_at,
      nullif(v_item->>'sale_price', '')::numeric,
      nullif(v_item->>'vat_exc_price', '')::numeric,
      nullif(v_item->>'flavour_price', '')::numeric,
      v_item->>'flavour_id',
      v_ctx
    );
  END LOOP;
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  v_reference text;
  v_transfer_id uuid;
  v_variant_key text;
  v_occurred_at timestamptz;
begin
  if p_source is null or p_destination is null then
    raise exception 'source and destination required';
  end if;

  -- Require an open stock period on the source warehouse only.
  perform public.require_open_stock_period_for_outlet_warehouse(p_source);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one transfer line is required';
  end if;

  v_reference := public.next_transfer_reference();

  insert into public.warehouse_transfers(
    reference_code,
    source_warehouse_id,
    destination_warehouse_id,
    note,
    context,
    created_by
  ) values (
    v_reference,
    p_source,
    p_destination,
    p_note,
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) returning id, created_at into v_transfer_id, v_occurred_at;

  v_occurred_at := coalesce(v_occurred_at, now());

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.warehouse_transfer_items(transfer_id, item_id, variant_key, qty_units)
    values (v_transfer_id, rec.item_id, v_variant_key, rec.qty_units);

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_source,
      rec.item_id,
      v_variant_key,
      -1 * rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_destination,
      rec.item_id,
      v_variant_key,
      rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );
  end loop;

  return v_reference;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.upsert_outlet_heartbeat(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
BEGIN
  IF v_outlet IS NULL THEN
    RAISE EXCEPTION 'outlet_id is required';
  END IF;

  INSERT INTO public.outlet_pos_heartbeats(
    outlet_id,
    last_seen_at,
    middleware_version,
    host_name,
    pending_sales_count,
    unmapped_pos_skus_count,
    last_sync_error,
    last_sale_uploaded_at,
    updated_at
  )
  VALUES (
    v_outlet,
    now(),
    nullif(payload->>'middleware_version', ''),
    nullif(payload->>'host_name', ''),
    nullif(payload->>'pending_sales_count', '')::integer,
    nullif(payload->>'unmapped_pos_skus_count', '')::integer,
    nullif(payload->>'last_sync_error', ''),
    nullif(payload->>'last_sale_uploaded_at', '')::timestamptz,
    now()
  )
  ON CONFLICT (outlet_id) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    middleware_version = COALESCE(EXCLUDED.middleware_version, public.outlet_pos_heartbeats.middleware_version),
    host_name = COALESCE(EXCLUDED.host_name, public.outlet_pos_heartbeats.host_name),
    pending_sales_count = COALESCE(EXCLUDED.pending_sales_count, public.outlet_pos_heartbeats.pending_sales_count),
    unmapped_pos_skus_count = COALESCE(EXCLUDED.unmapped_pos_skus_count, public.outlet_pos_heartbeats.unmapped_pos_skus_count),
    last_sync_error = COALESCE(EXCLUDED.last_sync_error, public.outlet_pos_heartbeats.last_sync_error),
    last_sale_uploaded_at = COALESCE(EXCLUDED.last_sale_uploaded_at, public.outlet_pos_heartbeats.last_sale_uploaded_at),
    updated_at = now();
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.upsert_recipe_uom_profile(p_item_id uuid, p_variant_key text, p_source_uom text, p_target_uom text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  insert into public.recipe_uom_profiles (item_id, variant_key, source_uom, target_uom, active)
  values (p_item_id, coalesce(p_variant_key, 'base'), p_source_uom, p_target_uom, true)
  on conflict (item_id, variant_key, active)
  do update set
    source_uom = excluded.source_uom,
    target_uom = excluded.target_uom,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_item jsonb;
  v_resolved record;
  v_qty numeric;
  v_qty_text text;
  v_errors jsonb := '[]'::jsonb;
  v_has_mapped boolean := false;
  v_item_sku text;
  v_variant_sku text;
  v_pos_item_name text;
BEGIN
  IF v_outlet IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'missing_outlet', 'message', 'outlet_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_source IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'missing_source', 'message', 'source_event_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))
  LOOP
    v_item_sku := nullif(trim(coalesce(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');
    IF v_item_sku IS NULL THEN
      v_item_sku := nullif(trim(v_item->>'pos_item_id'), '');
    END IF;
    v_variant_sku := nullif(trim(coalesce(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');
    v_pos_item_name := nullif(trim(v_item->>'name'), '');
    IF v_item_sku IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_resolved
    FROM public.resolve_catalog_for_outlet(v_outlet, v_item_sku, v_variant_sku, v_pos_item_name)
    LIMIT 1;
    IF NOT FOUND OR v_resolved.catalog_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_qty_text := nullif(v_item->>'quantity', '');
    v_qty := COALESCE(v_qty_text::numeric, 0);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_has_mapped := true;
    EXIT;
  END LOOP;

  IF NOT v_has_mapped THEN
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'no_mappable_items', 'message', 'no items had a valid catalog mapping')
    );
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  RETURN jsonb_build_object('ok', true, 'errors', '[]'::jsonb);
END;
$function$
-- @split
CREATE OR REPLACE FUNCTION public.warehouse_account_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT waa.active FROM public.warehouse_auth_accounts waa WHERE waa.user_id = auth.uid()),
    false
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.warehouse_can_view_audit_logs()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_audit_viewers v
    WHERE v.user_id = auth.uid()
  );
$function$
-- @split
CREATE OR REPLACE FUNCTION public.whoami_outlet()
 RETURNS TABLE(outlet_id uuid, outlet_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT o.id, o.name
  FROM public.outlets o
  WHERE o.active AND o.auth_user_id = v_uid;
END;
$function$
-- @split
DROP TRIGGER IF EXISTS "trg_refresh_catalog_has_variations" ON public."catalog_variants"
-- @split
CREATE TRIGGER trg_refresh_catalog_has_variations AFTER INSERT OR DELETE OR UPDATE ON catalog_variants FOR EACH ROW EXECUTE PROCEDURE refresh_catalog_has_variations_trigger()
-- @split
DROP TRIGGER IF EXISTS "trg_order_items_lock" ON public."order_items"
-- @split
CREATE TRIGGER trg_order_items_lock BEFORE INSERT OR DELETE OR UPDATE ON order_items FOR EACH ROW EXECUTE PROCEDURE assert_order_item_editable()
-- @split
DROP TRIGGER IF EXISTS "warehouse_auth_accounts_set_updated_at" ON public."warehouse_auth_accounts"
-- @split
CREATE TRIGGER warehouse_auth_accounts_set_updated_at BEFORE UPDATE ON warehouse_auth_accounts FOR EACH ROW EXECUTE PROCEDURE set_warehouse_auth_account_updated_at()
-- @split
ALTER TABLE public."catalog_items" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."catalog_menu_groups" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."catalog_variants" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."counter_values" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."middleware_catalog_schedule" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."middleware_update_drafts" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_auth_assignments" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_catalog_allowlist" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_catalog_sync_events" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_pos_catalog_bindings" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_pos_heartbeats" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_sales" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_warehouse_order_receipts" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlet_warehouses" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."outlets" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."pos_inventory_consumed" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."pos_sync_failures" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."stg_mintpos_menuitem" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."stg_mintpos_modifierflavour" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."warehouse_audit_viewers" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."warehouse_auth_accounts" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."warehouse_backoffice_logs" ENABLE ROW LEVEL SECURITY
-- @split
ALTER TABLE public."warehouses" ENABLE ROW LEVEL SECURITY
-- @split
DROP POLICY IF EXISTS "catalog_items_read_kiosk_anon" ON public."catalog_items"
-- @split
CREATE POLICY "catalog_items_read_kiosk_anon" ON public."catalog_items"  FOR SELECT TO "anon" USING ((active = true))
-- @split
DROP POLICY IF EXISTS "catalog_items_select_any_auth" ON public."catalog_items"
-- @split
CREATE POLICY "catalog_items_select_any_auth" ON public."catalog_items"  FOR SELECT TO "authenticated" USING (true)
-- @split
DROP POLICY IF EXISTS "catalog_menu_groups_authenticated_select" ON public."catalog_menu_groups"
-- @split
CREATE POLICY "catalog_menu_groups_authenticated_select" ON public."catalog_menu_groups"  FOR SELECT TO "authenticated" USING (warehouse_account_is_active())
-- @split
DROP POLICY IF EXISTS "catalog_menu_groups_service" ON public."catalog_menu_groups"
-- @split
CREATE POLICY "catalog_menu_groups_service" ON public."catalog_menu_groups"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "catalog_variants_read_kiosk_anon" ON public."catalog_variants"
-- @split
CREATE POLICY "catalog_variants_read_kiosk_anon" ON public."catalog_variants"  FOR SELECT TO "anon" USING ((active = true))
-- @split
DROP POLICY IF EXISTS "catalog_variants_select_any_auth" ON public."catalog_variants"
-- @split
CREATE POLICY "catalog_variants_select_any_auth" ON public."catalog_variants"  FOR SELECT TO "authenticated" USING (true)
-- @split
DROP POLICY IF EXISTS "counter_values_service_all" ON public."counter_values"
-- @split
CREATE POLICY "counter_values_service_all" ON public."counter_values"  FOR ALL TO "public" USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text))
-- @split
DROP POLICY IF EXISTS "middleware_catalog_schedule_service" ON public."middleware_catalog_schedule"
-- @split
CREATE POLICY "middleware_catalog_schedule_service" ON public."middleware_catalog_schedule"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "middleware_update_drafts_service" ON public."middleware_update_drafts"
-- @split
CREATE POLICY "middleware_update_drafts_service" ON public."middleware_update_drafts"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "order_items_policy_insert" ON public."order_items"
-- @split
CREATE POLICY "order_items_policy_insert" ON public."order_items"  FOR INSERT TO "authenticated" WITH CHECK (order_is_accessible(order_id, ( SELECT auth.uid() AS uid)))
-- @split
DROP POLICY IF EXISTS "order_items_select" ON public."order_items"
-- @split
CREATE POLICY "order_items_select" ON public."order_items"  FOR SELECT TO "authenticated" USING ((order_is_accessible(order_id, ( SELECT auth.uid() AS uid)) OR (is_supervisor(( SELECT auth.uid() AS uid)) AND is_warehouse_app_order(order_id))))
-- @split
DROP POLICY IF EXISTS "order_items_update" ON public."order_items"
-- @split
CREATE POLICY "order_items_update" ON public."order_items"  FOR UPDATE TO "authenticated" USING ((order_is_accessible(order_id, ( SELECT auth.uid() AS uid)) OR (is_supervisor(( SELECT auth.uid() AS uid)) AND is_warehouse_app_order(order_id) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (lower(o.status) = 'placed'::text))))))) WITH CHECK ((order_is_accessible(order_id, ( SELECT auth.uid() AS uid)) OR (is_supervisor(( SELECT auth.uid() AS uid)) AND is_warehouse_app_order(order_id) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (lower(o.status) = 'placed'::text)))))))
-- @split
DROP POLICY IF EXISTS "orders_supervisor_select" ON public."orders"
-- @split
CREATE POLICY "orders_supervisor_select" ON public."orders"  FOR SELECT TO "authenticated" USING ((is_supervisor(( SELECT auth.uid() AS uid)) AND (source_event_id IS NULL)))
-- @split
DROP POLICY IF EXISTS "outlet_auth_assignments_service" ON public."outlet_auth_assignments"
-- @split
CREATE POLICY "outlet_auth_assignments_service" ON public."outlet_auth_assignments"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_catalog_allowlist_authenticated_read" ON public."outlet_catalog_allowlist"
-- @split
CREATE POLICY "outlet_catalog_allowlist_authenticated_read" ON public."outlet_catalog_allowlist"  FOR SELECT TO "authenticated" USING (true)
-- @split
DROP POLICY IF EXISTS "outlet_catalog_allowlist_service" ON public."outlet_catalog_allowlist"
-- @split
CREATE POLICY "outlet_catalog_allowlist_service" ON public."outlet_catalog_allowlist"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_catalog_sync_service" ON public."outlet_catalog_sync_events"
-- @split
CREATE POLICY "outlet_catalog_sync_service" ON public."outlet_catalog_sync_events"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_pos_catalog_bindings_service" ON public."outlet_pos_catalog_bindings"
-- @split
CREATE POLICY "outlet_pos_catalog_bindings_service" ON public."outlet_pos_catalog_bindings"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_pos_heartbeats_service" ON public."outlet_pos_heartbeats"
-- @split
CREATE POLICY "outlet_pos_heartbeats_service" ON public."outlet_pos_heartbeats"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_sales_authenticated_select" ON public."outlet_sales"
-- @split
CREATE POLICY "outlet_sales_authenticated_select" ON public."outlet_sales"  FOR SELECT TO "authenticated" USING (true)
-- @split
DROP POLICY IF EXISTS "outlet_warehouse_order_receipts_service" ON public."outlet_warehouse_order_receipts"
-- @split
CREATE POLICY "outlet_warehouse_order_receipts_service" ON public."outlet_warehouse_order_receipts"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlet_warehouses_service" ON public."outlet_warehouses"
-- @split
CREATE POLICY "outlet_warehouses_service" ON public."outlet_warehouses"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "outlets_authenticated_select" ON public."outlets"
-- @split
CREATE POLICY "outlets_authenticated_select" ON public."outlets"  FOR SELECT TO "authenticated" USING ((warehouse_account_is_active() OR is_supervisor(( SELECT auth.uid() AS uid)) OR (id = ANY (COALESCE(member_outlet_ids(( SELECT auth.uid() AS uid)), ARRAY[]::uuid[])))))
-- @split
DROP POLICY IF EXISTS "pos_inventory_consumed_service" ON public."pos_inventory_consumed"
-- @split
CREATE POLICY "pos_inventory_consumed_service" ON public."pos_inventory_consumed"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "pos_sync_failures_service_only" ON public."pos_sync_failures"
-- @split
CREATE POLICY "pos_sync_failures_service_only" ON public."pos_sync_failures"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "stg_mintpos_menuitem_service" ON public."stg_mintpos_menuitem"
-- @split
CREATE POLICY "stg_mintpos_menuitem_service" ON public."stg_mintpos_menuitem"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "stg_mintpos_modifierflavour_service" ON public."stg_mintpos_modifierflavour"
-- @split
CREATE POLICY "stg_mintpos_modifierflavour_service" ON public."stg_mintpos_modifierflavour"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "suppliers_authenticated_select" ON public."suppliers"
-- @split
CREATE POLICY "suppliers_authenticated_select" ON public."suppliers"  FOR SELECT TO "authenticated" USING (true)
-- @split
DROP POLICY IF EXISTS "warehouse_audit_viewers_service" ON public."warehouse_audit_viewers"
-- @split
CREATE POLICY "warehouse_audit_viewers_service" ON public."warehouse_audit_viewers"  FOR ALL TO "service_role" USING (true) WITH CHECK (true)
-- @split
DROP POLICY IF EXISTS "warehouse_auth_accounts_read_own" ON public."warehouse_auth_accounts"
-- @split
CREATE POLICY "warehouse_auth_accounts_read_own" ON public."warehouse_auth_accounts"  FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)))
-- @split
DROP POLICY IF EXISTS "warehouse_backoffice_logs_insert_own" ON public."warehouse_backoffice_logs"
-- @split
CREATE POLICY "warehouse_backoffice_logs_insert_own" ON public."warehouse_backoffice_logs"  FOR INSERT TO "authenticated" WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)))
-- @split
DROP POLICY IF EXISTS "warehouse_backoffice_logs_select_viewer" ON public."warehouse_backoffice_logs"
-- @split
CREATE POLICY "warehouse_backoffice_logs_select_viewer" ON public."warehouse_backoffice_logs"  FOR SELECT TO "authenticated" USING (warehouse_can_view_audit_logs())
-- @split
DROP POLICY IF EXISTS "warehouses_authenticated_select" ON public."warehouses"
-- @split
CREATE POLICY "warehouses_authenticated_select" ON public."warehouses"  FOR SELECT TO "authenticated" USING ((warehouse_account_is_active() OR is_supervisor(( SELECT auth.uid() AS uid))))
