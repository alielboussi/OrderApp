export type DamageProductRef = {
  id?: string | null;
  name?: string | null;
};

export type DamageItem = {
  id: string;
  damage_id?: string | null;
  item_id?: string | null;
  variant_key?: string | null;
  variant_id?: string | null;
  qty: number;
  note?: string | null;
  item?: DamageProductRef | null;
  variant?: DamageProductRef | null;
};

export type DamageWarehouseRef = {
  id?: string | null;
  name?: string | null;
};

export type WarehouseDamage = {
  id: string;
  warehouse_id?: string | null;
  warehouse?: DamageWarehouseRef | null;
  note?: string | null;
  created_at?: string | null;
  items: DamageItem[];
};
