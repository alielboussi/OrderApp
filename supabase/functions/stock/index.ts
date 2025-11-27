/// <reference path="../types.d.ts" />
/// <reference lib="dom" />
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.5';
import { aggregateStockRows, collectDescendantIds, filterRowsBySearch } from '../_shared/warehouseHelpers.ts';
import type { Warehouse, WarehouseStockRow } from '../_shared/types.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'content-type',
	'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function getEnv(name: 'PROJECT_URL' | 'SERVICE_ROLE_KEY'): string {
	const value = Deno.env.get(name);
	if (!value) {
		throw new Error(`${name} is not set for the stock function`);
	}
	return value;
}

const STOCK_VIEW_NAME = Deno.env.get('WAREHOUSE_STOCK_VIEW') ?? 'warehouse_stock_current';

const supabase = createClient(getEnv('PROJECT_URL'), getEnv('SERVICE_ROLE_KEY'), {
	auth: { persistSession: false },
	global: {
		headers: { 'x-client-info': 'stock-management-edge/1.0' },
	},
});

type WarehouseRecord = {
	id: string;
	name: string | null;
	parent_warehouse_id: string | null;
	kind: string | null;
	active: boolean | null;
};

type StockRecord = {
	warehouse_id: string;
	product_id: string;
	variation_id: string | null;
	qty: number | string | null;
};

type ProductRecord = {
	id: string;
	name: string | null;
};

type VariationRecord = {
	id: string;
	name: string | null;
};

type EdgeRequest = {
	method: string;
	json(): Promise<any>;
};

serve(async (req: EdgeRequest) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	if (req.method !== 'POST') {
		return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
	}

	try {
		const { warehouseId, search } = await req.json();
		if (!warehouseId || typeof warehouseId !== 'string') {
			return new Response(JSON.stringify({ error: 'warehouseId is required' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}

		const { data: warehouseRows, error: warehouseError } = await supabase
			.from('warehouses')
			.select('id,name,parent_warehouse_id,kind,active')
			.eq('active', true);

		if (warehouseError) {
			throw warehouseError;
		}

		const warehouses: Warehouse[] = (warehouseRows ?? []).map((wh: WarehouseRecord) => ({
			id: wh.id,
			name: wh.name ?? 'Warehouse',
			parent_warehouse_id: wh.parent_warehouse_id,
			kind: wh.kind,
			active: wh.active ?? false,
		}));

		if (!warehouses.some((wh) => wh.id === warehouseId)) {
			return new Response(JSON.stringify({ error: 'Warehouse not found or inactive' }), {
				status: 404,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}

		const targetIds = collectDescendantIds(warehouses, warehouseId);

		const { data: stockRows, error: stockError } = await supabase
			.from(STOCK_VIEW_NAME)
			.select('warehouse_id,product_id,variation_id,qty')
			.in('warehouse_id', targetIds);

		if (stockError) {
			throw stockError;
		}

		const productIds = Array.from(
			new Set((stockRows ?? []).map((row: StockRecord) => row.product_id)),
		).filter(Boolean);
		const variationIds = Array.from(
			new Set(
				(stockRows ?? [])
					.map((row: StockRecord) => row.variation_id)
					.filter((id: string | null): id is string => Boolean(id)),
			),
		);

		const productLookup = new Map<string, string>();
		if (productIds.length) {
			const { data: products, error: productsError } = await supabase
				.from('products')
				.select('id,name')
				.in('id', productIds);
			if (productsError) {
				throw productsError;
			}
			(products as ProductRecord[] | null)?.forEach((product) => {
				productLookup.set(product.id, product.name ?? 'Product');
			});
		}

		const variationLookup = new Map<string, string | null>();
		if (variationIds.length) {
			const { data: variations, error: variationsError } = await supabase
				.from('product_variations')
				.select('id,name')
				.in('id', variationIds);
			if (variationsError) {
				throw variationsError;
			}
			(variations as VariationRecord[] | null)?.forEach((variation) => {
				variationLookup.set(variation.id, variation.name ?? null);
			});
		}

		const normalizedRows: WarehouseStockRow[] = (stockRows ?? []).map((row: StockRecord) => ({
			warehouse_id: row.warehouse_id,
			warehouse_name: warehouses.find((wh) => wh.id === row.warehouse_id)?.name ?? 'Warehouse',
			product_id: row.product_id,
			product_name: productLookup.get(row.product_id) ?? 'Product',
			variation_id: row.variation_id,
			variation_name: row.variation_id ? variationLookup.get(row.variation_id) ?? null : null,
			qty: Number(row.qty) || 0,
		}));

		const filteredRows = filterRowsBySearch(normalizedRows, search);
		const aggregates = aggregateStockRows(filteredRows);

		return new Response(
			JSON.stringify({
				rows: filteredRows,
				aggregates,
				warehouseCount: targetIds.length,
			}),
			{
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			},
		);
	} catch (error) {
		console.error('stock function failed', error);
		return new Response(JSON.stringify({ error: 'Unable to load stock data' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	}
});
