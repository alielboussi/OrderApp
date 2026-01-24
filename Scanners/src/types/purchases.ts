export type PurchaseProductRef = {
  id?: string | null;
  name?: string | null;
};

export type PurchaseItem = {
  id: string;
  receipt_id?: string | null;
  item_id?: string | null;
  variant_key?: string | null;
  qty: number;
  qty_input_mode?: string | null;
  unit_cost?: number | null;
  item?: PurchaseProductRef | null;
  variant?: PurchaseProductRef | null;
};

export type PurchaseWarehouseRef = {
  id?: string | null;
  name?: string | null;
};

export type PurchaseSupplierRef = {
  id?: string | null;
  name?: string | null;
};

export type WarehousePurchase = {
  id: string;
  warehouse_id?: string | null;
  supplier_id?: string | null;
  reference_code?: string | null;
  note?: string | null;
  auto_whatsapp?: boolean | null;
  recorded_at?: string | null;
  received_at?: string | null;
  operator_name?: string | null;
  warehouse?: PurchaseWarehouseRef | null;
  supplier?: PurchaseSupplierRef | null;
  items: PurchaseItem[];
};
