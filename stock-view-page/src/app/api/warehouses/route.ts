import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { Warehouse } from '@/types/warehouse';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

export async function GET() {
  try {
    const supabase = getServiceClient();
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

    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error('warehouses api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouses' }, { status: 500 });
  }
}
