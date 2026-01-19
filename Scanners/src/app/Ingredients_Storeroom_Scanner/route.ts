import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

// Bracket access to avoid compile-time inlining of stale envs.
const PROJECT_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const ANON_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';
const LOCKED_SOURCE_ID = '0c9ddd9e-d42c-475f-9232-5e9d649b0916';
const DESTINATION_CHOICES = [
  { id: '029bf13f-0fff-47f3-bc1b-32e1f1c6e00c', label: 'Main Preparation Kitchen' },
  { id: '0cdfba88-b3b9-43d5-a2a8-4e852bf9300b', label: 'Pastry Kitchen' },
  { id: '587fcdb9-c998-42d6-b88e-bbcd1a66b088', label: 'Secondary Destination' }
] as const;
const LOCKED_DEST_ID = DESTINATION_CHOICES[0]?.id ?? '029bf13f-0fff-47f3-bc1b-32e1f1c6e00c';
const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_layer_stock';
const MULTIPLY_QTY_BY_PACKAGE = true;
const OPERATOR_CONTEXT_LABELS = {
  transfer: 'Transfers',
  purchase: 'Purchases',
  damage: 'Damages'
};

// IMPORTANT: Ingredients storeroom scanner behavior mirrors the prior main warehouse scanner.
// Please coordinate with the transfers team before changing any logic in this file.

// --- Everything below is copied from Main_Warehouse_Scanner with IDs updated ---

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\u003c');
}

function describeLockedWarehouse(warehouse: WarehouseRecord | undefined, fallback: string): string {
  if (!warehouse) return fallback;
  const base = warehouse.name ?? fallback;
  return warehouse.active === false ? base + ' (inactive)' : base;
}

async function preloadLockedWarehouses(): Promise<WarehouseRecord[]> {
  const ids = [LOCKED_SOURCE_ID, LOCKED_DEST_ID].filter(Boolean);
  if (!ids.length) {
    return [];
  }
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('warehouses')
      .select('id,name,parent_warehouse_id,kind,active')
      .in('id', ids);
    if (error) {
      throw error;
    }
    return data ?? [];
  } catch (error) {
    console.error('initial warehouse preload failed', error);
    return [];
  }
}

function createHtml(config: {
  sourcePillLabel: string;
  destPillLabel: string;
  sourceWarehouseName: string;
  initialWarehousesJson: string;
  initialView: 'transfer' | 'purchase' | 'damage';
}) {
  const { sourcePillLabel, destPillLabel, sourceWarehouseName, initialWarehousesJson, initialView } = config;
  const destinationChoicesJson = serializeForScript(DESTINATION_CHOICES);
  const operatorContextLabelsJson = serializeForScript(OPERATOR_CONTEXT_LABELS);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AfterTen Transfer Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color-scheme: dark;
      font-size: 13px;
      --shell-pad: 10px;
      --sticky-overlay: rgba(5, 5, 5, 0.92);
      --sticky-stack-offset: 360px;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: radial-gradient(circle at top, #1f1f1f 0%, #050505 60%);
      color: #f5f5f5;
      min-height: 100vh;
      min-width: 320px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: var(--shell-pad);
      overflow-x: hidden;
      overflow-y: auto;
      zoom: 0.78;
    }
    body[data-view="purchase"],
    body[data-view="damage"] {
      display: block;
    }
    body[data-view="purchase"] #auth-section,
    body[data-view="purchase"] #app-section,
    body[data-view="purchase"] .console-sticky,
    body[data-view="purchase"] main,
    body[data-view="damage"] #auth-section,
    body[data-view="damage"] #app-section,
    body[data-view="damage"] .console-sticky,
    body[data-view="damage"] main {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    body[data-view="purchase"] #purchase-page,
    body[data-view="damage"] #damage-page {
      display: flex;
    }
    main {
      width: 900px;
      max-width: 900px;
      min-width: 900px;
      min-height: auto;
      margin: 0 auto;
      background: rgba(0, 0, 0, 0.85);
      padding: calc(var(--shell-pad) * 0.9);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 25px 80px -30px rgba(0, 0, 0, 0.9);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h1 {
      margin-top: 0;
      font-size: 1.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    p.subtitle {
      margin-top: 4px;
      color: #b5b5b5;
      font-size: 0.95rem;
    }
    button, input, select, textarea {
      font: inherit;
    }
    .panel {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 16px;
      border: 1px solid rgba(255, 43, 72, 0.25);
      padding: clamp(12px, 2.2vw, 18px);
      margin-top: 10px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      color: #f7f7f7;
    }
    input, select, textarea {
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      border-radius: 16px;
      border: 3px solid rgba(255, 34, 67, 0.5);
      padding: 14px 16px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #ff1b2d;
      box-shadow: 0 0 12px rgba(255, 27, 45, 0.45);
      outline: none;
    }
    button,
    .button {
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 999px;
      border: none;
      padding: 14px 24px;
      letter-spacing: 0.08em;
      background: linear-gradient(100deg, #ff1b2d, #f44336, #ff004d);
      color: #fff;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    button:hover:not(:disabled),
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 30px rgba(255, 0, 77, 0.35);
    }
    button:disabled,
    .button.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .two-cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: clamp(12px, 2vw, 18px);
    }
    .message {
      padding: 14px 18px;
      border-radius: 16px;
      font-size: 0.95rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      margin-top: 12px;
    }
    .message.success {
      border-color: rgba(34, 197, 94, 0.4);
      background: rgba(34, 197, 94, 0.08);
      color: #c8ffd5;
    }
    .message.error {
      border-color: rgba(255, 82, 82, 0.6);
      background: rgba(255, 82, 82, 0.08);
      color: #ffc7c7;
    }
    #auth-section,
    #app-section {
      width: 100%;
    }
    #app-section { display: none; }
    body[data-auth="true"] #auth-section { display: none; }
    body[data-auth="true"] #app-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .brand-header {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
      flex-shrink: 0;
    }
    .brand-header img {
      width: clamp(120px, 20vw, 160px);
      height: auto;
      max-height: 140px;
      object-fit: contain;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.55));
    }
    .console-sticky {
      position: static;
      top: auto;
      z-index: auto;
      background: transparent;
      border-radius: 0;
      padding: 0 0 12px;
      box-shadow: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .console-sticky .brand-header {
      margin-bottom: 4px;
    }
    .login-submit {
      display: block;
      margin: 18px auto 0;
      min-width: 180px;
    }
    .transfer-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    #transfer-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .locked-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      padding: 10px 14px;
      text-align: center;
    }
    .locked-pill h3 {
      margin: 0 0 4px 0;
      font-size: 0.95rem;
      letter-spacing: 0.08em;
      color: #ff6b81;
      text-transform: uppercase;
    }
    .locked-pill p {
      margin: 0;
      font-size: clamp(1.35rem, 2.4vw, 1.9rem);
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: capitalize;
      line-height: 1.2;
    }
    .locked-pill--destination #dest-label {
      font-size: clamp(1.45rem, 2.6vw, 2.1rem);
    }
    .locked-pill--destination {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .destination-pill-select {
      display: block;
    }
    .destination-pill-select select {
      width: 100%;
      appearance: none;
      background: #070707;
      border: 2px solid rgba(255, 27, 45, 0.6);
      border-radius: 18px;
      padding: 12px 16px;
      color: #ff5d73;
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .destination-pill-select select:focus-visible {
      outline: none;
      border-color: #ff1b2d;
      box-shadow: 0 0 0 3px rgba(255, 27, 45, 0.35);
    }
    .destination-pill-hint {
      margin: 0;
      font-size: 0.78rem;
      color: #f7a8b7;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .operator-auth-card {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .operator-auth-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .operator-auth-head h3 {
      margin: 0;
      font-size: 1rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .operator-status-pill {
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid rgba(255, 255, 255, 0.16);
    }
    .operator-status-pill[data-state="locked"] {
      color: #ffb4c4;
      border-color: rgba(255, 76, 108, 0.5);
    }
    .operator-status-pill[data-state="unlocked"] {
      color: #bdfccf;
      border-color: rgba(34, 197, 94, 0.5);
    }
    .operator-select-label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .operator-select-label select {
      width: 100%;
      appearance: none;
      background: #070707;
      border: 2px solid rgba(255, 27, 45, 0.6);
      border-radius: 18px;
      padding: 14px 18px;
      color: #ff5d73;
      font-size: 1.3rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      cursor: pointer;
    }
    .operator-select-label select:focus-visible {
      outline: none;
      border-color: #ff1b2d;
      box-shadow: 0 0 0 3px rgba(255, 27, 45, 0.35);
    }
    .operator-select-label select option {
      background: #050505;
      color: #ff5d73;
      font-size: 1.2rem;
      text-transform: uppercase;
      padding: 12px 10px;
    }
    }
    .operator-auth-hint {
      margin: 0;
      font-size: 0.8rem;
      color: #f7a8b7;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    #cart-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
