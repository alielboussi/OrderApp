import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

type VehicleRecord = {
  id: string;
  name: string | null;
  number_plate: string | null;
  driver_name: string | null;
  photo_urls: string[] | null;
  warehouse_id: string | null;
  active: boolean | null;
};

type VehiclePayload = {
  id?: string;
  name?: string | null;
  number_plate?: string | null;
  driver_name?: string | null;
  photo_urls?: string[] | string | null;
  warehouse_id?: string | null;
  active?: boolean | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function mapVehicle(record: VehicleRecord) {
  return {
    id: record.id,
    name: record.name ?? 'Vehicle',
    number_plate: record.number_plate ?? null,
    driver_name: record.driver_name ?? null,
    photo_urls: Array.isArray(record.photo_urls) ? record.photo_urls : [],
    warehouse_id: record.warehouse_id ?? null,
    active: record.active ?? false
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getServiceClient();
    const url = new URL(request.url);
    const includeInactiveParam = url.searchParams.get('include_inactive');
    const includeInactive = includeInactiveParam === '1' || includeInactiveParam === 'true';

    let query = supabase
      .from('vehicles')
      .select('id,name,number_plate,driver_name,photo_urls,warehouse_id,active')
      .order('name');

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const vehicles = (Array.isArray(data) ? data : [])
      .map(mapVehicle)
      .filter((vehicle, index, list) => vehicle.id && index === list.findIndex((entry) => entry.id === vehicle.id))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }));

    return NextResponse.json({ vehicles });
  } catch (error) {
    console.error('vehicles api failed', error);
    return NextResponse.json({ error: 'Unable to load vehicles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VehiclePayload;
    const name = cleanText(body.name);
    if (!name) {
      return NextResponse.json({ error: 'Vehicle name is required' }, { status: 400 });
    }

    const payload = {
      name,
      number_plate: cleanText(body.number_plate),
      driver_name: cleanText(body.driver_name),
      photo_urls: cleanStringList(body.photo_urls),
      warehouse_id: cleanUuid(body.warehouse_id),
      active: cleanBoolean(body.active, true),
      updated_at: new Date().toISOString()
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('vehicles')
      .insert(payload)
      .select('id,name,number_plate,driver_name,photo_urls,warehouse_id,active')
      .single();

    if (error) throw error;

    return NextResponse.json({ vehicle: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create vehicle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VehiclePayload;
    const id = cleanUuid(body.id);
    if (!id) {
      return NextResponse.json({ error: 'Vehicle id is required' }, { status: 400 });
    }

    const name = cleanText(body.name);
    if (!name) {
      return NextResponse.json({ error: 'Vehicle name is required' }, { status: 400 });
    }

    const photoUrls = body.photo_urls === undefined ? undefined : cleanStringList(body.photo_urls);

    const update: Record<string, unknown> = {
      name,
      number_plate: cleanText(body.number_plate),
      driver_name: cleanText(body.driver_name),
      warehouse_id: cleanUuid(body.warehouse_id),
      active: cleanBoolean(body.active, true),
      updated_at: new Date().toISOString()
    };

    if (photoUrls !== undefined) {
      update.photo_urls = photoUrls;
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('vehicles')
      .update(update)
      .eq('id', id)
      .select('id,name,number_plate,driver_name,photo_urls,warehouse_id,active')
      .single();

    if (error) throw error;

    return NextResponse.json({ vehicle: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update vehicle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
