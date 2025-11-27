export type Warehouse = {
  id: string;
  name: string;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean;
};

export type WarehouseStockRow = {
  warehouse_id: string;
  warehouse_name: string;
  product_id: string;
  product_name: string;
  variation_id: string | null;
  variation_name: string | null;
  qty: number;
};

export type AggregatedStockRow = {
  productId: string;
  productName: string;
  variationId: string | null;
  variationName: string | null;
  totalQty: number;
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    qty: number;
  }>;
};
