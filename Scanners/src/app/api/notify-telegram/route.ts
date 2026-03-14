import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

type SummaryItem = {
  productName?: unknown;
  variationName?: unknown;
  qty?: unknown;
  scannedQty?: unknown;
  unit?: unknown;
  packUom?: unknown;
  packUnit?: unknown;
  pack_unit?: unknown;
  supplierPackUom?: unknown;
  productId?: unknown;
  itemId?: unknown;
  product_id?: unknown;
  item_id?: unknown;
  variantKey?: unknown;
  variant_key?: unknown;
};

type SummaryPayload = {
  processedBy?: unknown;
  operator?: unknown;
  dateTime?: unknown;
  window?: unknown;
  destLabel?: unknown;
  destinationLabel?: unknown;
  route?: unknown;
  itemsBlock?: unknown;
  items?: SummaryItem[];
  warehouseId?: unknown;
  warehouse_id?: unknown;
  sourceWarehouseId?: unknown;
  source_warehouse_id?: unknown;
};

type NotifyRequest = {
  context?: unknown;
  summary?: unknown;
  scanner?: unknown;
};

const TELEGRAM_INGREDIENTS_BOT_TOKEN = process.env.TELEGRAM_INGREDIENTS_BOT_TOKEN;
const TELEGRAM_INGREDIENTS_CHAT_ID = process.env.TELEGRAM_INGREDIENTS_CHAT_ID;
const TELEGRAM_BEVERAGES_BOT_TOKEN = process.env.TELEGRAM_BEVERAGES_BOT_TOKEN;
const TELEGRAM_BEVERAGES_CHAT_ID = process.env.TELEGRAM_BEVERAGES_CHAT_ID;
const TELEGRAM_SOYOLA_BOT_TOKEN = process.env.TELEGRAM_SOYOLA_BOT_TOKEN;
const TELEGRAM_SOYOLA_CHAT_ID = process.env.TELEGRAM_SOYOLA_CHAT_ID;
const TELEGRAM_FLOUR_POTATOES_BOT_TOKEN = process.env.TELEGRAM_FLOUR_POTATOES_BOT_TOKEN;
const TELEGRAM_FLOUR_POTATOES_CHAT_ID = process.env.TELEGRAM_FLOUR_POTATOES_CHAT_ID;

function getScannerConfig(scanner: string | null) {
  if (scanner === 'ingredients') {
    return {
      token: TELEGRAM_INGREDIENTS_BOT_TOKEN ?? '',
      chatId: TELEGRAM_INGREDIENTS_CHAT_ID ?? ''
    };
  }
  if (scanner === 'beverages') {
    return {
      token: TELEGRAM_BEVERAGES_BOT_TOKEN ?? '',
      chatId: TELEGRAM_BEVERAGES_CHAT_ID ?? ''
    };
  }
  if (scanner === 'soyola') {
    return {
      token: TELEGRAM_SOYOLA_BOT_TOKEN ?? '',
      chatId: TELEGRAM_SOYOLA_CHAT_ID ?? ''
    };
  }
  if (scanner === 'flour-potatoes') {
    return {
      token: TELEGRAM_FLOUR_POTATOES_BOT_TOKEN ?? '',
      chatId: TELEGRAM_FLOUR_POTATOES_CHAT_ID ?? ''
    };
  }
  return null;
}

function getScannerLabel(scanner: string | null) {
  if (scanner === 'ingredients') return 'Ingredients Storeroom';
  if (scanner === 'beverages') return 'Beverages Storeroom';
  if (scanner === 'soyola') return 'Soyola Storeroom';
  if (scanner === 'flour-potatoes') return 'Flour Potatoes Storeroom';
  if (scanner === 'supervisor') return 'Supervisor';
  return 'Supervisor';
}

function normalizeLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeVariantKey(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw.length ? raw : 'base';
}

function resolveWarehouseId(summary: SummaryPayload): string | null {
  const candidates = [summary.warehouseId, summary.warehouse_id, summary.sourceWarehouseId, summary.source_warehouse_id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function resolveItemId(item: SummaryItem): string | null {
  const candidates = [item.productId, item.itemId, item.product_id, item.item_id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function resolveVariantKey(item: SummaryItem): string {
  const raw = item.variantKey ?? item.variant_key ?? null;
  return normalizeVariantKey(raw);
}

function resolveItemUnit(item: SummaryItem): string {
  const raw =
    item.supplierPackUom ??
    item.packUom ??
    item.packUnit ??
    item.pack_unit ??
    item.unit ??
    '';
  return String(raw ?? '').trim();
}

function pickSupplierUnit(unit: unknown): string {
  const raw = String(unit ?? '').trim();
  if (!raw) return '';
  const slashIndex = raw.indexOf('/');
  if (slashIndex <= 0) return raw;
  return raw.slice(0, slashIndex).trim();
}

function formatUnitLabel(unit: unknown, qty: unknown): string {
  const unitLabel = pickSupplierUnit(unit) || 'unit';
  const numeric = Number(qty ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 1) return unitLabel || 'unit';
  if (!unitLabel) return 'unit';
  if (unitLabel.includes('(s)') || unitLabel.includes('(S)')) return unitLabel;
  if (unitLabel.endsWith('s') || unitLabel.endsWith('S')) return unitLabel;
  return unitLabel + '(s)';
}

function formatQtyValue(value: number): string {
  if (!Number.isFinite(value)) return 'Null';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const text = rounded.toFixed(2);
  return text.replace(/\.00$/, '').replace(/0$/, '');
}

function buildItemKey(itemId: string, variantKey: string): string {
  return `${itemId}::${normalizeVariantKey(variantKey)}`;
}

function formatRemainingLine(item: SummaryItem, remainingByKey: Map<string, number | null> | null): string {
  const itemId = resolveItemId(item);
  const variantKey = resolveVariantKey(item);
  const key = itemId ? buildItemKey(itemId, variantKey) : null;
  const remainingQty = key && remainingByKey ? remainingByKey.get(key) ?? null : null;
  const unitLabel = remainingQty === null ? '' : formatUnitLabel(resolveItemUnit(item), remainingQty);
  const qtyText = remainingQty === null ? 'Null' : formatQtyValue(remainingQty);
  const combined = unitLabel ? `${qtyText} ${unitLabel}` : qtyText;
  return `<b>- Remaining Qty - (${escapeHtml(combined)})</b>`;
}

function formatDamageLine(item: SummaryItem, damageByKey: Map<string, number> | null): string {
  const itemId = resolveItemId(item);
  const variantKey = resolveVariantKey(item);
  const key = itemId ? buildItemKey(itemId, variantKey) : null;
  const damageQty = key && damageByKey ? (damageByKey.get(key) ?? 0) : null;
  const unitLabel = damageQty === null ? '' : formatUnitLabel(resolveItemUnit(item), damageQty);
  const qtyText = damageQty === null ? 'Null' : formatQtyValue(damageQty);
  const combined = unitLabel ? `${qtyText} ${unitLabel}` : qtyText;
  return `<b>- Total Damages - (${escapeHtml(combined)})</b>`;
}

function formatItemsBlock(
  summary: SummaryPayload,
  context: 'transfer' | 'purchase' | 'damage',
  remainingByKey: Map<string, number | null> | null,
  damageByKey: Map<string, number> | null
) {
  const items = Array.isArray(summary.items) ? summary.items : [];

  if (items.length) {
    const grouped = new Map<
      string,
      Array<{ variation: string; qty: unknown; unit: string; remainingLine: string; damageLine: string | null }>
    >();
    items.forEach((item, index) => {
      const baseName = String(item.productName ?? `Item ${index + 1}`);
      const rawVariation = typeof item.variationName === 'string' ? item.variationName.trim() : '';
      const variation = rawVariation && rawVariation.toLowerCase() !== 'base' ? rawVariation : 'Base';
      const qty = item.scannedQty ?? item.qty ?? 0;
      const unit = formatUnitLabel(resolveItemUnit(item), qty);
      const remainingLine = formatRemainingLine(item, remainingByKey);
      const damageLine = context === 'damage' ? formatDamageLine(item, damageByKey) : null;
      const bucket = grouped.get(baseName) ?? [];
      bucket.push({ variation, qty, unit, remainingLine, damageLine });
      grouped.set(baseName, bucket);
    });

    const lines: string[] = [];
    const headerPrefix = context === 'purchase' ? '🟢' : '🔴';
    grouped.forEach((entries, baseName) => {
      lines.push(`${headerPrefix} ${escapeHtml(baseName)}`);
      entries.forEach((entry) => {
        lines.push(`• ${escapeHtml(entry.variation)} — ${escapeHtml(String(entry.qty))} ${escapeHtml(entry.unit)}`);
        lines.push(entry.remainingLine);
        if (entry.damageLine) {
          lines.push(entry.damageLine);
        }
      });
    });

    return lines.join('\n');
  }

  if (typeof summary.itemsBlock === 'string' && summary.itemsBlock.trim().length > 0) {
    return escapeHtml(summary.itemsBlock.trim());
  }

  return '• No line items provided';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMessage(
  summary: SummaryPayload,
  context: 'transfer' | 'purchase' | 'damage',
  scanner: string | null,
  remainingByKey: Map<string, number | null> | null,
  damageByKey: Map<string, number> | null
) {
  const typeLabel = context === 'purchase' ? 'Purchase' : context === 'damage' ? 'Damage' : 'Transfer';
  const operator = normalizeLabel(summary.processedBy) ?? normalizeLabel(summary.operator) ?? 'Unknown operator';
  const destination = String(
    summary.destLabel ?? summary.destinationLabel ?? summary.route ?? 'Unknown destination'
  );
  const dateTime = String(summary.dateTime ?? summary.window ?? '');
  const itemsBlock = formatItemsBlock(summary, context, remainingByKey, damageByKey);
  const scannerLabel = getScannerLabel(scanner);

  const lines = [
    `<b>${escapeHtml(scannerLabel)}</b>`,
    `<b>Outlet/Home &amp; Department: ${escapeHtml(destination)}</b>`,
    `Type: ${escapeHtml(typeLabel)}`,
    dateTime ? `Date &amp; Time: ${escapeHtml(dateTime)}` : '',
    `Operator: ${escapeHtml(operator)}`,
    'Products:',
    itemsBlock
  ].filter(Boolean);

  return lines.join('\n');
}

async function loadRemainingByKey(
  supabase: ReturnType<typeof getServiceClient>,
  summary: SummaryPayload,
  items: SummaryItem[]
): Promise<Map<string, number | null>> {
  const remainingByKey = new Map<string, number | null>();
  const warehouseId = resolveWarehouseId(summary);
  if (!warehouseId) return remainingByKey;
  const itemIds = Array.from(new Set(items.map((item) => resolveItemId(item)).filter(Boolean))) as string[];
  if (!itemIds.length) return remainingByKey;

  const { data, error } = await supabase
    .from('warehouse_stock_items')
    .select('item_id,variant_key,net_units')
    .eq('warehouse_id', warehouseId)
    .in('item_id', itemIds);

  if (error || !Array.isArray(data)) {
    return remainingByKey;
  }

  data.forEach((row) => {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : null;
    if (!itemId) return;
    const variantKey = normalizeVariantKey(row?.variant_key ?? 'base');
    const rawQty = typeof row?.net_units === 'number' ? row.net_units : Number(row?.net_units);
    const qty = Number.isFinite(rawQty) ? rawQty : null;
    remainingByKey.set(buildItemKey(itemId, variantKey), qty);
  });

  return remainingByKey;
}

async function loadDamageTotalsByKey(
  supabase: ReturnType<typeof getServiceClient>,
  summary: SummaryPayload,
  items: SummaryItem[]
): Promise<Map<string, number>> {
  const damageByKey = new Map<string, number>();
  const warehouseId = resolveWarehouseId(summary);
  if (!warehouseId) return damageByKey;
  const itemIds = Array.from(new Set(items.map((item) => resolveItemId(item)).filter(Boolean))) as string[];
  if (!itemIds.length) return damageByKey;

  const { data, error } = await supabase
    .from('stock_ledger')
    .select('item_id,variant_key,delta_units')
    .eq('warehouse_id', warehouseId)
    .eq('location_type', 'warehouse')
    .eq('reason', 'damage')
    .in('item_id', itemIds);

  if (error || !Array.isArray(data)) {
    return damageByKey;
  }

  data.forEach((row) => {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : null;
    if (!itemId) return;
    const variantKey = normalizeVariantKey(row?.variant_key ?? 'base');
    const rawDelta = typeof row?.delta_units === 'number' ? row.delta_units : Number(row?.delta_units);
    if (!Number.isFinite(rawDelta)) return;
    const key = buildItemKey(itemId, variantKey);
    const next = (damageByKey.get(key) ?? 0) + Math.abs(rawDelta);
    damageByKey.set(key, next);
  });

  return damageByKey;
}

export async function POST(request: Request) {
  let body: NotifyRequest = {};
  try {
    body = (await request.json()) as NotifyRequest;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload', detail: String(error) }, { status: 400 });
  }

  const summary = (body.summary && typeof body.summary === 'object') ? (body.summary as SummaryPayload) : null;
  const contextRaw = typeof body.context === 'string' ? body.context : 'transfer';
  const context = contextRaw === 'purchase' || contextRaw === 'damage' ? contextRaw : 'transfer';
  const scanner = typeof body.scanner === 'string' ? body.scanner : null;

  if (!summary) {
    return NextResponse.json({ error: 'Missing summary payload' }, { status: 400 });
  }

  const config = getScannerConfig(scanner);
  if (!config) {
    return NextResponse.json({ error: 'Unknown scanner configuration' }, { status: 400 });
  }
  if (!config.token || !config.chatId) {
    return NextResponse.json({ error: 'Missing Telegram configuration' }, { status: 500 });
  }

  const supabase = getServiceClient();
  const items = Array.isArray(summary.items) ? summary.items : [];
  const remainingByKey = await loadRemainingByKey(supabase, summary, items);
  const damageByKey = context === 'damage' ? await loadDamageTotalsByKey(supabase, summary, items) : null;
  const message = buildMessage(summary, context, scanner, remainingByKey, damageByKey);
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text: message, parse_mode: 'HTML' })
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: 'Telegram send failed', detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
