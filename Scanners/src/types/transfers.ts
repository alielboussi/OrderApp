export type TransferProductRef = {
  id?: string | null;
  name?: string | null;
  uom?: string | null;
};

export type TransferWarehouseRef = {
  id?: string | null;
  name?: string | null;
};

export type TransferItem = {
  id: string;
  transfer_id?: string | null;
  product_id?: string | null;
  variant_key?: string | null;
  qty: number;
  product?: TransferProductRef | null;
  variation?: TransferProductRef | null;
};

export type WarehouseTransfer = {
  id: string;
  reference_code?: string | null;
  status?: string | null;
  note?: string | null;
  created_at: string | null;
  completed_at?: string | null;
  source_location_id?: string | null;
  dest_location_id?: string | null;
  items: TransferItem[];
  source?: TransferWarehouseRef | null;
  dest?: TransferWarehouseRef | null;
};
