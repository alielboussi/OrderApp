/// <reference path="../types.d.ts" />
/// <reference lib="dom" />
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.5';
import type { Warehouse } from '../_shared/types.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'content-type',
	'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

function getEnv(name: 'PROJECT_URL' | 'SERVICE_ROLE_KEY'): string {
	const value = Deno.env.get(name);
	if (!value) {
		throw new Error(`${name} is not set for the warehouses function`);
	}
	return value;
}

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

type EdgeRequest = {
	method: string;
};

serve(async (req: EdgeRequest) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	if (req.method !== 'GET') {
		return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
	}

	try {
		const { data, error } = await supabase
			.from('warehouses')
			.select('id,name,parent_warehouse_id,kind,active')
			.eq('active', true)
			.order('name', { ascending: true });

		if (error) {
			throw error;
		}

		const warehouses: Warehouse[] = (data ?? []).map((wh: WarehouseRecord) => ({
			id: wh.id,
			name: wh.name ?? 'Warehouse',
			parent_warehouse_id: wh.parent_warehouse_id,
			kind: wh.kind,
			active: wh.active ?? false,
		}));

		return new Response(JSON.stringify({ warehouses }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('warehouses function failed', error);
		return new Response(JSON.stringify({ error: 'Unable to load warehouses' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	}
});
