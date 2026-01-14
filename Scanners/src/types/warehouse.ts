export type Warehouse = {
  id: string;
  name: string;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean;
};

export type WarehouseStockRow = {
  warehouse_id: string;
  warehouse_name?: string | null;
  product_id: string;
  product_name: string;
  variant_key: string | null;
  variation_id: string | null;
  variation_name: string | null;
  qty: number;
};

export type AggregatedStockRow = {
  productId: string;
  variationId: string | null;
  productName: string;
  variationName: string | null;
  totalQty: number;
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    qty: number;
  }>;
};
