import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

type SummaryItem = {
  productName?: unknown;
  variationName?: unknown;
  qty?: unknown;
  scannedQty?: unknown;
  unit?: unknown;
  consumptionUom?: unknown;
  consumption_uom?: unknown;
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
  reference?: unknown;
  referenceRaw?: unknown;
  dateTime?: unknown;
  window?: unknown;
  destLabel?: unknown;
  destinationLabel?: unknown;
  sourceLabel?: unknown;
  route?: unknown;
  itemsBlock?: unknown;
  items?: SummaryItem[];
  warehouseId?: unknown;
  warehouse_id?: unknown;
  sourceWarehouseId?: unknown;
  source_warehouse_id?: unknown;
  destinationWarehouseId?: unknown;
  destination_warehouse_id?: unknown;
  destWarehouseId?: unknown;
  dest_warehouse_id?: unknown;
};

type NotifyRequest = {
  context?: unknown;
  summary?: unknown;
  scanner?: unknown;
};

const TELEGRAM_INGREDIENTS_BOT_TOKEN = process.env.TELEGRAM_INGREDIENTS_BOT_TOKEN;
const TELEGRAM_INGREDIENTS_CHAT_ID = process.env.TELEGRAM_INGREDIENTS_CHAT_ID;
const TELEGRAM_COLDROOMS_BOT_TOKEN = process.env.TELEGRAM_COLDROOMS_BOT_TOKEN;
const TELEGRAM_COLDROOMS_CHAT_ID = process.env.TELEGRAM_COLDROOMS_CHAT_ID;
const TELEGRAM_BEVERAGES_BOT_TOKEN = process.env.TELEGRAM_BEVERAGES_BOT_TOKEN;
const TELEGRAM_BEVERAGES_CHAT_ID = process.env.TELEGRAM_BEVERAGES_CHAT_ID;
const TELEGRAM_SOYOLA_BOT_TOKEN = process.env.TELEGRAM_SOYOLA_BOT_TOKEN;
const TELEGRAM_SOYOLA_CHAT_ID = process.env.TELEGRAM_SOYOLA_CHAT_ID;
const TELEGRAM_QUICK_CORNER_BOT_TOKEN = process.env.TELEGRAM_QUICK_CORNER_BOT_TOKEN;
const TELEGRAM_QUICK_CORNER_CHAT_ID = process.env.TELEGRAM_QUICK_CORNER_CHAT_ID;
const TELEGRAM_FLOUR_POTATOES_BOT_TOKEN = process.env.TELEGRAM_FLOUR_POTATOES_BOT_TOKEN;
const TELEGRAM_FLOUR_POTATOES_CHAT_ID = process.env.TELEGRAM_FLOUR_POTATOES_CHAT_ID;
const TELEGRAM_FUEL_BOT_TOKEN = process.env.TELEGRAM_FUEL_BOT_TOKEN;
const TELEGRAM_FUEL_CHAT_ID = process.env.TELEGRAM_FUEL_CHAT_ID;

function getScannerConfig(scanner: string | null) {
  if (scanner === 'ingredients') {
    return {
      token: TELEGRAM_INGREDIENTS_BOT_TOKEN ?? '',
      chatId: TELEGRAM_INGREDIENTS_CHAT_ID ?? ''
    };
  }
  if (scanner === 'coldrooms') {
    return {
      token: TELEGRAM_COLDROOMS_BOT_TOKEN ?? '',
      chatId: TELEGRAM_COLDROOMS_CHAT_ID ?? ''
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
  if (scanner === 'quick-corner') {
    return {
      token: TELEGRAM_QUICK_CORNER_BOT_TOKEN ?? '',
      chatId: TELEGRAM_QUICK_CORNER_CHAT_ID ?? ''
    };
  }
  if (scanner === 'flour-potatoes') {
    return {
      token: TELEGRAM_FLOUR_POTATOES_BOT_TOKEN ?? '',
      chatId: TELEGRAM_FLOUR_POTATOES_CHAT_ID ?? ''
    };
  }
  if (scanner === 'fuel') {
    return {
      token: TELEGRAM_FUEL_BOT_TOKEN ?? '',
      chatId: TELEGRAM_FUEL_CHAT_ID ?? ''
    };
  }
  return null;
}

function getScannerLabel(scanner: string | null) {
  if (scanner === 'ingredients') return 'Ingredients Storeroom';
  if (scanner === 'coldrooms') return 'Coldrooms Storeroom';
  if (scanner === 'beverages') return 'Beverages Storeroom';
  if (scanner === 'soyola') return 'Soyola Storeroom';
  if (scanner === 'quick-corner') return 'Quick Corner';
  if (scanner === 'flour-potatoes') return 'Flour Potatoes Storeroom';
  if (scanner === 'fuel') return 'Fuel Storeroom';
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

function resolveWarehouseId(summary: SummaryPayload, context: 'transfer' | 'purchase' | 'damage'): string | null {
  const sourceCandidates = [summary.warehouseId, summary.warehouse_id, summary.sourceWarehouseId, summary.source_warehouse_id];
  const ordered = sourceCandidates;
  for (const candidate of ordered) {
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

function resolveConsumptionUnit(item: SummaryItem): string {
  const raw = item.consumptionUom ?? item.consumption_uom ?? '';
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

function formatRemainingLine(
  item: SummaryItem,
  remainingByKey: Map<string, number | null> | null,
  consumptionUomByKey: Map<string, string> | null
): string {
  const itemId = resolveItemId(item);
  const variantKey = resolveVariantKey(item);
  const key = itemId ? buildItemKey(itemId, variantKey) : null;
  const remainingQty = key && remainingByKey ? remainingByKey.get(key) ?? null : null;
  const preferredUnit = (key && consumptionUomByKey ? consumptionUomByKey.get(key) : null) || resolveConsumptionUnit(item);
  const unitLabel = remainingQty === null ? '' : formatUnitLabel(preferredUnit || resolveItemUnit(item), remainingQty);
  const qtyText = remainingQty === null ? 'Null' : formatQtyValue(remainingQty);
  const combined = unitLabel ? `${qtyText} ${unitLabel}` : qtyText;
  return `<b>- Remaining Qty - ${escapeHtml(combined)}</b>`;
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
  damageByKey: Map<string, number> | null,
  consumptionUomByKey: Map<string, string> | null
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
      const variation = rawVariation && rawVariation.toLowerCase() !== 'base' ? rawVariation : baseName;
      const qty = item.scannedQty ?? item.qty ?? 0;
      const unit = formatUnitLabel(resolveItemUnit(item), qty);
      const remainingLine = formatRemainingLine(item, remainingByKey, consumptionUomByKey);
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
  damageByKey: Map<string, number> | null,
  consumptionUomByKey: Map<string, string> | null
) {
  const now = new Date();
  const serverDateTime =
    now.toLocaleDateString('en-US', { timeZone: 'Africa/Lagos' }) +
    ' ' +
    now.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });
  const typeLabel = context === 'purchase' ? 'Purchase' : context === 'damage' ? 'Damage' : 'Transfer';
  const operator = normalizeLabel(summary.processedBy) ?? normalizeLabel(summary.operator) ?? 'Unknown operator';
  const reference = normalizeLabel(summary.reference) ?? normalizeLabel(summary.referenceRaw);
  const supplierName = normalizeLabel(summary.sourceLabel);
  const destination = String(summary.destLabel ?? summary.destinationLabel ?? 'Unknown destination');
  const sourceLabel = normalizeLabel(summary.sourceLabel) ?? 'Unknown source';
  const dateTime = serverDateTime;
  const itemsBlock = formatItemsBlock(summary, context, remainingByKey, damageByKey, consumptionUomByKey);
  const scannerLabel = getScannerLabel(scanner);

  const lines = [
    `<b>${escapeHtml(scannerLabel)}</b>`,
    `From: ${escapeHtml(sourceLabel)}`,
    `To: ${escapeHtml(destination)}`,
    `Type: ${escapeHtml(typeLabel)}`,
    context === 'purchase' && reference ? `Reference / Invoice #: ${escapeHtml(reference)}` : '',
    context === 'purchase' && supplierName ? `Supplier: ${escapeHtml(supplierName)}` : '',
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
  items: SummaryItem[],
  context: 'transfer' | 'purchase' | 'damage'
): Promise<Map<string, number | null>> {
  const remainingByKey = new Map<string, number | null>();
  const warehouseId = resolveWarehouseId(summary, context);
  if (!warehouseId) return remainingByKey;
  const itemIds = Array.from(new Set(items.map((item) => resolveItemId(item)).filter(Boolean))) as string[];
  if (!itemIds.length) return remainingByKey;

  const { data: periodRows, error: periodError } = await supabase
    .from('warehouse_stock_periods')
    .select('id,opened_at')
    .eq('warehouse_id', warehouseId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1);

  if (periodError || !Array.isArray(periodRows)) {
    return remainingByKey;
  }

  const period = periodRows[0] ?? null;
  if (!period?.id) return remainingByKey;

  const parseQty = (value: unknown): number | null => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const { data: countRows, error: countError } = await supabase
    .from('warehouse_stock_counts')
    .select('item_id,variant_key,counted_qty,counted_at')
    .eq('period_id', period.id)
    .in('item_id', itemIds);

  if (countError || !Array.isArray(countRows)) {
    return remainingByKey;
  }

  const latestCountMap = new Map<string, number>();
  const latestCountAtMap = new Map<string, number>();
  countRows.forEach((row) => {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : null;
    if (!itemId) return;
    const variantKey = normalizeVariantKey(row?.variant_key ?? 'base');
    const qty = parseQty(row?.counted_qty);
    if (qty === null) return;
    const key = buildItemKey(itemId, variantKey);
    const countedAt = typeof row?.counted_at === 'string' ? Date.parse(row.counted_at) : NaN;
    const existingAt = latestCountAtMap.get(key);
    const shouldUpdate = Number.isNaN(countedAt)
      ? existingAt === undefined
      : (existingAt ?? -Infinity) < countedAt;
    if (shouldUpdate) {
      latestCountMap.set(key, qty);
      if (!Number.isNaN(countedAt)) latestCountAtMap.set(key, countedAt);
    }
  });

  const ledgerReasons = ['warehouse_transfer', 'outlet_sale', 'damage', 'recipe_consumption', 'purchase_receipt'];
  const openedAt = typeof period.opened_at === 'string' ? period.opened_at : null;
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('stock_ledger')
    .select('item_id,variant_key,delta_units,occurred_at')
    .eq('location_type', 'warehouse')
    .eq('warehouse_id', warehouseId)
    .in('reason', ledgerReasons)
    .in('item_id', itemIds)
    .gte('occurred_at', openedAt ?? '1970-01-01T00:00:00Z');

  if (ledgerError || !Array.isArray(ledgerRows)) {
    return remainingByKey;
  }

  const movementMap = new Map<string, number>();
  ledgerRows.forEach((row) => {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : null;
    if (!itemId) return;
    const variantKey = normalizeVariantKey(row?.variant_key ?? 'base');
    const delta = parseQty(row?.delta_units);
    if (delta === null) return;
    const key = buildItemKey(itemId, variantKey);
    const occurredAt = typeof row?.occurred_at === 'string' ? Date.parse(row.occurred_at) : NaN;
    const baselineAt = latestCountAtMap.get(key) ?? (openedAt ? Date.parse(openedAt) : NaN);
    if (!Number.isNaN(occurredAt) && !Number.isNaN(baselineAt) && occurredAt < baselineAt) return;
    movementMap.set(key, (movementMap.get(key) ?? 0) + delta);
  });

  const requestedKeys = new Set<string>();
  items.forEach((item) => {
    const itemId = resolveItemId(item);
    if (!itemId) return;
    const variantKey = resolveVariantKey(item);
    requestedKeys.add(buildItemKey(itemId, variantKey));
  });

  requestedKeys.forEach((key) => {
    const openingQty = latestCountMap.get(key);
    const movementQty = movementMap.get(key);
    if (openingQty === undefined && movementQty === undefined) {
      remainingByKey.set(key, null);
      return;
    }
    remainingByKey.set(key, (openingQty ?? 0) + (movementQty ?? 0));
  });

  return remainingByKey;
}

async function loadConsumptionUomByKey(
  supabase: ReturnType<typeof getServiceClient>,
  items: SummaryItem[]
): Promise<Map<string, string>> {
  const consumptionByKey = new Map<string, string>();
  const itemIds = Array.from(new Set(items.map((item) => resolveItemId(item)).filter(Boolean))) as string[];
  if (!itemIds.length) return consumptionByKey;

  const variantKeys = new Set<string>();
  items.forEach((item) => {
    const variantKey = resolveVariantKey(item);
    if (variantKey && variantKey !== 'base') {
      variantKeys.add(variantKey);
    }
  });

  const { data: itemRows } = await supabase
    .from('catalog_items')
    .select('id,consumption_uom')
    .in('id', itemIds);

  const itemUomById = new Map<string, string>();
  if (Array.isArray(itemRows)) {
    itemRows.forEach((row) => {
      const id = typeof row?.id === 'string' ? row.id : null;
      const uom = typeof row?.consumption_uom === 'string' ? row.consumption_uom.trim() : '';
      if (id && uom) itemUomById.set(id, uom);
    });
  }

  if (variantKeys.size) {
    const { data: variantRows } = await supabase
      .from('catalog_variants')
      .select('id,item_id,consumption_uom')
      .in('id', Array.from(variantKeys));

    if (Array.isArray(variantRows)) {
      variantRows.forEach((row) => {
        const variantId = typeof row?.id === 'string' ? row.id : null;
        const itemId = typeof row?.item_id === 'string' ? row.item_id : null;
        const uom = typeof row?.consumption_uom === 'string' ? row.consumption_uom.trim() : '';
        if (!variantId || !itemId) return;
        const key = buildItemKey(itemId, variantId);
        if (uom) {
          consumptionByKey.set(key, uom);
        } else {
          const fallback = itemUomById.get(itemId);
          if (fallback) consumptionByKey.set(key, fallback);
        }
      });
    }
  }

  itemIds.forEach((itemId) => {
    const key = buildItemKey(itemId, 'base');
    const uom = itemUomById.get(itemId);
    if (uom && !consumptionByKey.has(key)) {
      consumptionByKey.set(key, uom);
    }
  });

  return consumptionByKey;
}

async function loadDamageTotalsByKey(
  supabase: ReturnType<typeof getServiceClient>,
  summary: SummaryPayload,
  items: SummaryItem[],
  context: 'transfer' | 'purchase' | 'damage'
): Promise<Map<string, number>> {
  const damageByKey = new Map<string, number>();
  const warehouseId = resolveWarehouseId(summary, context);
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
  const remainingByKey = await loadRemainingByKey(supabase, summary, items, context);
  const damageByKey = context === 'damage' ? await loadDamageTotalsByKey(supabase, summary, items, context) : null;
  const consumptionUomByKey = await loadConsumptionUomByKey(supabase, items);
  const message = buildMessage(summary, context, scanner, remainingByKey, damageByKey, consumptionUomByKey);
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
