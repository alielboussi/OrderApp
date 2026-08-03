export type MiddlewareSaleLine = {
  outlet_uuid: string;
  outlet_name: string | null;
  product_uuid: string;
  product_name: string | null;
  group_uuid: string | null;
  group_name: string | null;
  variant_uuid: string | null;
  variant_name: string | null;
  variant_sku: string | null;
  menu_group_uuid: string | null;
  menu_group_name: string | null;
  pos_menu_group_id: number | null;
  quantity: number;
  price_before_vat_16: number;
  price_after_vat_16: number;
  line_total_amount: number;
};

export type MiddlewareSaleEvent = {
  sale_reference: string;
  source_event_id: string | null;
  pos_bill_id: string | null;
  pos_sale_id: string | null;
  payment_type: string | null;
  payment_methods: { method: string; amount: number }[];
  shift_name: string | null;
  shift_id: number | null;
  shift_session_id: number | null;
  terminal: string | null;
  shift_session_start: string | null;
  shift_session_end: string | null;
  shift_session_status: string | null;
  shift_opened_by: string | null;
  cashier_id: number | null;
  cashier_name: string | null;
  cashier_username: string | null;
  outlet_uuid: string;
  outlet_name: string | null;
  sold_at: string;
  total_amount_of_sale: number;
  lines: { paragraph: string; items: MiddlewareSaleLine[] };
};

export type MiddlewareSalesResponse = {
  api_format_version: number;
  since: string | null;
  until: string;
  sales_count: number;
  grouping: string;
  cloud_backend?: string;
  outlet_summaries?: Array<{
    outlet_id: string;
    outlet_name: string | null;
    sales_count: number;
    total_amount: number;
  }>;
  sales: MiddlewareSaleEvent[];
  error?: string;
};
