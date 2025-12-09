import { NextResponse } from 'next/server';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const WHATSAPP_TO_NUMBERS = process.env.WHATSAPP_TO_NUMBER;
const WHATSAPP_TEMPLATE_SID = process.env.WHATSAPP_TEMPLATE_SID ?? process.env.WHATSAPP_CONTENT_SID;
const DEFAULT_TRANSFER_TEMPLATE_SID = 'HX8f3e00b8bcb694cb99e7683da36e286b';
const DEFAULT_PURCHASE_TEMPLATE_SID = 'HXd33e07ec3e00e28026bcc8fa5d88bebe';
const WHATSAPP_TRANSFER_TEMPLATE_SID =
  process.env.WHATSAPP_TRANSFER_TEMPLATE_SID ?? WHATSAPP_TEMPLATE_SID ?? DEFAULT_TRANSFER_TEMPLATE_SID;
const WHATSAPP_PURCHASE_TEMPLATE_SID =
  process.env.WHATSAPP_PURCHASE_TEMPLATE_SID ?? WHATSAPP_TEMPLATE_SID ?? DEFAULT_PURCHASE_TEMPLATE_SID;

type TransferItem = {
  productName?: unknown;
  variationName?: unknown;
  label?: unknown;
  qty?: unknown;
  unit?: unknown;
};

function formatMoney(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatItemsBlock(payload: Record<string, unknown>) {
  if (typeof payload.itemsBlock === 'string' && payload.itemsBlock.trim().length > 0) {
    return payload.itemsBlock;
  }
  const rawItems = Array.isArray(payload.items)
    ? (payload.items as TransferItem[])
    : ([
        {
          productName: payload.productName,
          variationName: payload.variationName,
          qty: payload.qty,
          unit: payload.unit,
        },
      ] satisfies TransferItem[]);

  const lines = rawItems
    .map((item, index) => {
      const productName = String(item.productName ?? item.label ?? `Item ${index + 1}`);
      const variation = item.variationName ? ` (${item.variationName})` : '';
      const qtyValue = item.qty ?? '0';
      const unit = item.unit ?? 'unit';
      return `• ${productName}${variation} — ${qtyValue} ${unit}`.trim();
    })
    .filter(Boolean);

  if (!lines.length) {
    return '• No line items provided';
  }

  return lines.join('\n');
}

function buildContentVariables(
  payload: Record<string, unknown>,
  context: 'transfer' | 'purchase' = 'transfer'
) {
  const reference = String(payload.reference ?? payload.referenceRaw ?? 'N/A');
  const processedBy = String(payload.processedBy ?? payload.operator ?? 'Unknown operator');
  const source = String(payload.sourceLabel ?? 'Unknown source');
  const dest = String(payload.destLabel ?? 'Unknown destination');
  const route = String(payload.route ?? `${source} -> ${dest}`);
  const windowText = String(
    payload.dateTime ?? payload.window ?? payload.scheduleWindow ?? new Date().toLocaleString('en-US')
  );
  const itemsBlock = formatItemsBlock(payload);

  if (context === 'purchase') {
    const grossLabel = formatMoney(payload.totalGross);
    const metaParts = [`Window: ${windowText}`, `Operator: ${processedBy}`];
    if (grossLabel) {
      metaParts.push('Gross: ' + grossLabel);
    }
    const metaLine = metaParts.join(' • ');
    return {
      '1': 'Purchase ' + reference,
      '2': route + ' • ' + metaLine,
      '3': itemsBlock,
    };
  }

  return {
    '1': reference,
    '2': processedBy,
    '3': route,
    '4': windowText,
    '5': itemsBlock,
  };
}

function buildPlaintextMessage(payload: Record<string, unknown>, context: 'transfer' | 'purchase' = 'transfer') {
  if (context === 'purchase') {
    const reference = String(payload.reference ?? payload.referenceRaw ?? 'N/A');
    const source = String(payload.sourceLabel ?? 'Supplier');
    const dest = String(payload.destLabel ?? 'Warehouse');
    const operator = String(payload.processedBy ?? payload.operator ?? 'Unknown operator');
    const windowText = String(
      payload.dateTime ?? payload.window ?? payload.scheduleWindow ?? new Date().toLocaleString('en-US')
    );
    const grossLabel = formatMoney(payload.totalGross);
    const metaParts = [`Window: ${windowText}`, `Operator: ${operator}`];
    if (grossLabel) {
      metaParts.push('Gross: ' + grossLabel);
    }
    const itemsBlock = formatItemsBlock(payload);
    return [
      `Purchase Ref: ${reference}`,
      `Route: ${source} -> ${dest}`,
      metaParts.join(' | '),
      '',
      itemsBlock,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const vars = buildContentVariables(payload, 'transfer');
  return [
    `Transfer Ref: ${vars['1']}`,
    `Operator: ${vars['2']}`,
    `Route: ${vars['3']}`,
    `Window: ${vars['4']}`,
    '',
    vars['5'],
  ]
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: Request) {
  const missingEnv: string[] = [];
  if (!TWILIO_ACCOUNT_SID) missingEnv.push('TWILIO_ACCOUNT_SID');
  if (!TWILIO_AUTH_TOKEN) missingEnv.push('TWILIO_AUTH_TOKEN');
  if (!TWILIO_WHATSAPP_NUMBER) missingEnv.push('TWILIO_WHATSAPP_NUMBER');
  if (!WHATSAPP_TO_NUMBERS) missingEnv.push('WHATSAPP_TO_NUMBER');
  if (missingEnv.length) {
    return NextResponse.json(
      {
        error: 'Missing Twilio WhatsApp configuration',
        missingEnv,
      },
      { status: 500 }
    );
  }

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = (await request.json()) as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload', detail: String(error) }, { status: 400 });
  }

  const summaryPayload =
    requestBody.summary && typeof requestBody.summary === 'object'
      ? (requestBody.summary as Record<string, unknown>)
      : requestBody;
  const contextInput = typeof requestBody.context === 'string' ? requestBody.context : undefined;
  const context: 'transfer' | 'purchase' = contextInput === 'purchase' ? 'purchase' : 'transfer';

  const toNumbers = WHATSAPP_TO_NUMBERS ?? '';
  const recipients = toNumbers
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No WhatsApp recipients configured' }, { status: 400 });
  }

  const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const templateSid = context === 'purchase' ? WHATSAPP_PURCHASE_TEMPLATE_SID : WHATSAPP_TRANSFER_TEMPLATE_SID;
  const useTemplate = Boolean(templateSid);
  const contentVariables = useTemplate ? JSON.stringify(buildContentVariables(summaryPayload, context)) : null;
  const fallbackBody = useTemplate ? null : buildPlaintextMessage(summaryPayload, context);
  const results: Array<{ to: string; ok: boolean; detail?: string }> = [];

  for (const to of recipients) {
    const params = new URLSearchParams({
      From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      To: `whatsapp:${to}`,
    });
    if (useTemplate && templateSid && contentVariables) {
      params.set('ContentSid', templateSid);
      params.set('ContentVariables', contentVariables);
    } else if (fallbackBody) {
      params.set('Body', fallbackBody);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const detail = await response.text();
      results.push({ to, ok: false, detail });
    } else {
      results.push({ to, ok: true });
    }
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: 'One or more WhatsApp sends failed', failed },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sent: results });
}
