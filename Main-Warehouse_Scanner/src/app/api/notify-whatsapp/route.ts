import { NextResponse } from 'next/server';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const WHATSAPP_TO_NUMBERS = process.env.WHATSAPP_TO_NUMBER;
const WHATSAPP_TEMPLATE_SID = process.env.WHATSAPP_TEMPLATE_SID ?? process.env.WHATSAPP_CONTENT_SID;

type TransferItem = {
  productName?: unknown;
  variationName?: unknown;
  label?: unknown;
  qty?: unknown;
  unit?: unknown;
};

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

function buildContentVariables(payload: Record<string, unknown>) {
  const reference = String(payload.reference ?? payload.referenceRaw ?? 'N/A');
  const processedBy = String(payload.processedBy ?? payload.operator ?? 'Unknown operator');
  const source = String(payload.sourceLabel ?? 'Unknown source');
  const dest = String(payload.destLabel ?? 'Unknown destination');
  const route = String(payload.route ?? `${source} -> ${dest}`);
  const windowText = String(
    payload.dateTime ?? payload.window ?? payload.scheduleWindow ?? new Date().toLocaleString('en-US')
  );
  const itemsBlock = formatItemsBlock(payload);

  return {
    '1': reference,
    '2': processedBy,
    '3': route,
    '4': windowText,
    '5': itemsBlock,
  };
}

function buildPlaintextMessage(payload: Record<string, unknown>) {
  const vars = buildContentVariables(payload);
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

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload', detail: String(error) }, { status: 400 });
  }

  const recipients = WHATSAPP_TO_NUMBERS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No WhatsApp recipients configured' }, { status: 400 });
  }

  const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const useTemplate = Boolean(WHATSAPP_TEMPLATE_SID);
  const contentVariables = useTemplate ? JSON.stringify(buildContentVariables(payload)) : null;
  const fallbackBody = useTemplate ? null : buildPlaintextMessage(payload);
  const results: Array<{ to: string; ok: boolean; detail?: string }> = [];

  for (const to of recipients) {
    const params = new URLSearchParams({
      From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      To: `whatsapp:${to}`,
    });
    if (useTemplate && WHATSAPP_TEMPLATE_SID && contentVariables) {
      params.set('ContentSid', WHATSAPP_TEMPLATE_SID);
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
