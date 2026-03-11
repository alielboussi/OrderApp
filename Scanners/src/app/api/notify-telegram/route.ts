import { NextResponse } from 'next/server';

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
  return null;
}

function getScannerLabel(scanner: string | null) {
  if (scanner === 'ingredients') return 'Ingredients Storeroom';
  if (scanner === 'beverages') return 'Beverages Storeroom';
  if (scanner === 'soyola') return 'Soyola Storeroom';
  if (scanner === 'supervisor') return 'Supervisor';
  return 'Supervisor';
}

function normalizeLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function formatItemsBlock(summary: SummaryPayload, context: 'transfer' | 'purchase' | 'damage') {
  const items = Array.isArray(summary.items) ? summary.items : [];
  const resolveItemUnit = (item: SummaryItem) => {
    const raw =
      item.supplierPackUom ??
      item.packUom ??
      item.packUnit ??
      item.pack_unit ??
      item.unit ??
      '';
    return String(raw ?? '').trim();
  };
  const pickSupplierUnit = (unit: unknown) => {
    const raw = String(unit ?? '').trim();
    if (!raw) return '';
    const slashIndex = raw.indexOf('/');
    if (slashIndex <= 0) return raw;
    return raw.slice(0, slashIndex).trim();
  };
  const formatUnitLabel = (unit: unknown, qty: unknown) => {
    const unitLabel = pickSupplierUnit(unit) || 'unit';
    const numeric = Number(qty ?? 0);
    if (!Number.isFinite(numeric) || numeric <= 1) return unitLabel || 'unit';
    if (!unitLabel) return 'unit';
    if (unitLabel.includes('(s)') || unitLabel.includes('(S)')) return unitLabel;
    if (unitLabel.endsWith('s') || unitLabel.endsWith('S')) return unitLabel;
    return unitLabel + '(s)';
  };

  if (items.length) {
    const grouped = new Map<string, Array<{ variation: string; qty: unknown; unit: string }>>();
    items.forEach((item, index) => {
      const baseName = String(item.productName ?? `Item ${index + 1}`);
      const rawVariation = typeof item.variationName === 'string' ? item.variationName.trim() : '';
      const variation = rawVariation && rawVariation.toLowerCase() !== 'base' ? rawVariation : 'Base';
      const qty = item.scannedQty ?? item.qty ?? 0;
      const unit = formatUnitLabel(resolveItemUnit(item), qty);
      const bucket = grouped.get(baseName) ?? [];
      bucket.push({ variation, qty, unit });
      grouped.set(baseName, bucket);
    });

    const lines: string[] = [];
    const headerPrefix = context === 'purchase' ? '🟢' : '🔴';
    grouped.forEach((entries, baseName) => {
      lines.push(`${headerPrefix} ${escapeHtml(baseName)}`);
      entries.forEach((entry) => {
        lines.push(`• ${escapeHtml(entry.variation)} — ${escapeHtml(String(entry.qty))} ${escapeHtml(entry.unit)}`);
      });
    });

    return lines.join('\n');
  }

  if (typeof summary.itemsBlock === 'string' && summary.itemsBlock.trim().length > 0) {
    return summary.itemsBlock.trim();
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

function buildMessage(summary: SummaryPayload, context: 'transfer' | 'purchase' | 'damage', scanner: string | null) {
  const typeLabel = context === 'purchase' ? 'Purchase' : context === 'damage' ? 'Damage' : 'Transfer';
  const operator = normalizeLabel(summary.processedBy) ?? normalizeLabel(summary.operator) ?? 'Unknown operator';
  const destination = String(
    summary.destLabel ?? summary.destinationLabel ?? summary.route ?? 'Unknown destination'
  );
  const dateTime = String(summary.dateTime ?? summary.window ?? '');
  const itemsBlock = formatItemsBlock(summary, context);
  const scannerLabel = getScannerLabel(scanner);

  const lines = [
    `<b>${escapeHtml(scannerLabel)}</b>`,
    `<b>Outlet/Home &amp; Department: ${escapeHtml(destination)}</b>`,
    `Type: ${escapeHtml(typeLabel)}`,
    dateTime ? `Date &amp; Time: ${escapeHtml(dateTime)}` : '',
    `Operator: ${escapeHtml(operator)}`,
    'Products:',
    escapeHtml(itemsBlock)
  ].filter(Boolean);

  return lines.join('\n');
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

  const message = buildMessage(summary, context, scanner);
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
