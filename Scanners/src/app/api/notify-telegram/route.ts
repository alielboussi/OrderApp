import { NextResponse } from 'next/server';

type SummaryPayload = {
  processedBy?: unknown;
  operator?: unknown;
  destLabel?: unknown;
  destinationLabel?: unknown;
  route?: unknown;
  itemsBlock?: unknown;
  items?: Array<{
    productName?: unknown;
    variationName?: unknown;
    qty?: unknown;
    scannedQty?: unknown;
    unit?: unknown;
  }>;
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
  return null;
}

function formatItemsBlock(summary: SummaryPayload) {
  const items = Array.isArray(summary.items) ? summary.items : [];
  const lines = items
    .map((item, index) => {
      const name = String(item.productName ?? `Item ${index + 1}`);
      const variation = item.variationName ? ` (${item.variationName})` : '';
      const qty = item.scannedQty ?? item.qty ?? 0;
      const unit = item.unit ?? 'unit';
      return `• ${name}${variation} — ${qty} ${unit}`.trim();
    })
    .filter(Boolean);

  if (lines.length) {
    return lines.join('\n');
  }

  if (typeof summary.itemsBlock === 'string' && summary.itemsBlock.trim().length > 0) {
    return summary.itemsBlock.trim();
  }

  return '• No line items provided';
}

function buildMessage(summary: SummaryPayload, context: 'transfer' | 'purchase' | 'damage') {
  const typeLabel = context === 'purchase' ? 'Purchase' : context === 'damage' ? 'Damage' : 'Transfer';
  const operator = String(summary.processedBy ?? summary.operator ?? 'Unknown operator');
  const destination = String(
    summary.destLabel ?? summary.destinationLabel ?? summary.route ?? 'Unknown destination'
  );
  const itemsBlock = formatItemsBlock(summary);

  return [
    `Type: ${typeLabel}`,
    `Operator: ${operator}`,
    `Outlet/Home & Department: ${destination}`,
    'Products:',
    itemsBlock
  ]
    .filter(Boolean)
    .join('\n');
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

  const message = buildMessage(summary, context);
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text: message })
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: 'Telegram send failed', detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
