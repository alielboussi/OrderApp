import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

// Bracket access to avoid compile-time inlining of stale envs.
const PROJECT_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const ANON_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';
const LOCKED_SOURCE_ID = '587fcdb9-c998-42d6-b88e-bbcd1a66b088';
const DESTINATION_CHOICES = [] as const;
const LOCKED_DEST_ID = '';
const STOCK_VIEW_ENV = process.env.STOCK_VIEW_NAME ?? '';
const STOCK_VIEW_NAME = STOCK_VIEW_ENV && STOCK_VIEW_ENV !== 'warehouse_layer_stock'
  ? STOCK_VIEW_ENV
  : 'warehouse_stock_items';
const ALLOWED_DESTINATION_IDS = [
  'c77376f7-1ede-4518-8180-b3efeecda128',
  '0cdfba88-b3b9-43d5-a2a8-4e852bf9300b'
] as const;
const STORAGE_HOME_ALLOWED_IDS = [
  '89e4a592-1385-4b40-9685-2178f124a9da',
  '94f86655-bed8-404c-8614-007a846f89f2',
  '9d0a3a83-1fea-45a8-8771-25cc1db9f07e',
  'd829d739-7311-4647-af91-cad33c21280e',
  '587fcdb9-c998-42d6-b88e-bbcd1a66b088'
] as const;
const MULTIPLY_QTY_BY_PACKAGE = true;
type GlobalWithOperatorSession = typeof globalThis & { OPERATOR_SESSION_TTL_MS?: number };
const globalWithOperatorSession = globalThis as GlobalWithOperatorSession;
const OPERATOR_SESSION_TTL_MS = globalWithOperatorSession.OPERATOR_SESSION_TTL_MS ?? 20 * 60 * 1000; // 20 minutes
globalWithOperatorSession.OPERATOR_SESSION_TTL_MS = OPERATOR_SESSION_TTL_MS;
const OPERATOR_CONTEXT_LABELS = {
  transfer: 'Transfers',
  purchase: 'Purchases',
  damage: 'Damages'
};

// IMPORTANT: Behavior for this scanner was finalized on 2025-12-09 for kiosk parity.
// Please coordinate with the transfers team before changing any logic in this file,
// as late edits risk breaking the now-approved workflows.

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
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
  return JSON.stringify(value).replace(/</g, '\\u003c');
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
      .select('id,name,parent_warehouse_id,active')
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
  initialView: 'transfer' | 'damage';
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
      width: 960px;
      max-width: 960px;
      min-width: 960px;
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
    .search-field {
      margin-top: 8px;
    }
    .ingredient-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255, 43, 72, 0.25);
      background: rgba(255, 255, 255, 0.02);
    }
    .ingredient-head h3 {
      margin: 0;
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .ingredient-head p {
      margin: 4px 0 0;
      color: #b9b9b9;
      font-size: 0.85rem;
    }
    .ingredient-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .ingredient-card {
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 10px;
      background: rgba(10, 10, 12, 0.6);
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .ingredient-card:hover {
      border-color: rgba(255, 43, 72, 0.6);
      transform: translateY(-1px);
    }
    .ingredient-card-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: #fff;
    }
    .ingredient-card-meta {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      color: #ff9fb1;
      text-transform: uppercase;
    }
    .ingredient-empty {
      margin: 0;
      color: #c4c4c4;
      font-size: 0.85rem;
      display: none;
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
    .console-actions {
      display: flex;
      justify-content: flex-end;
    }
    .logout-button {
      min-width: 140px;
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
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    .destination-select-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
      width: 100%;
    }
    .destination-pill-select {
      display: block;
      text-align: center;
      width: 100%;
    }
    .destination-pill-select .destination-pill-hint {
      display: block;
      margin-bottom: 6px;
      text-align: center;
    }
    .destination-pill-select select {
      width: 100%;
      appearance: none;
      background: #070707;
      border: 2px solid rgba(255, 27, 45, 0.6);
      border-radius: 18px;
      padding: 12px 16px;
      color: #ff5d73;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .destination-pill-select select option {
      font-size: 1.35rem;
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
      font-size: 1.7rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      cursor: pointer;
    }
    .operator-pill-button,
    .destination-pill-button {
      width: 100%;
      appearance: none;
      background: #070707;
      border: 2px solid rgba(255, 27, 45, 0.6);
      border-radius: 18px;
      padding: 14px 18px;
      color: #ff5d73;
      font-size: 1.7rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    }
    .operator-pill-button:disabled,
    .destination-pill-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .operator-pill-button:hover:not(:disabled),
    .destination-pill-button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 18px rgba(255, 27, 45, 0.25);
    }
    .operator-hidden-select,
    .destination-hidden-select {
      display: none;
    }
    .select-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(6px);
      z-index: 1200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .select-modal.active {
      display: flex;
    }
    .select-modal-card {
      width: min(820px, 94vw);
      max-height: 84vh;
      overflow: hidden;
      border-radius: 20px;
      background: rgba(8, 8, 12, 0.96);
      border: 1px solid rgba(255, 27, 45, 0.35);
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
    }
    .select-modal-header {
      padding: 18px 20px 12px;
      font-size: 1.2rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #ffe5ea;
      border-bottom: 1px solid rgba(255, 27, 45, 0.2);
    }
    .select-modal-grid {
      padding: 16px 20px 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      overflow: auto;
    }
    .select-card {
      border: 1px solid rgba(255, 27, 45, 0.35);
      background: rgba(14, 14, 18, 0.9);
      color: #f8fafc;
      padding: 16px;
      border-radius: 16px;
      font-size: 1rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
    }
    .select-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 27, 45, 0.7);
      box-shadow: 0 18px 30px rgba(255, 27, 45, 0.25);
    }
    .select-modal-actions {
      padding: 0 20px 18px;
      display: flex;
      justify-content: flex-end;
    }
    .select-modal-close {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #f8fafc;
      border-radius: 999px;
      padding: 8px 16px;
      font-weight: 600;
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
      font-size: 1.55rem;
      text-transform: uppercase;
      padding: 12px 10px;
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
      position: relative;
      overflow: visible;
      padding: 0 0 8px;
      background: transparent;
      border: none;
      margin-top: 12px;
    }
    #scanner-wedge,
    #login-wedge {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      caret-color: transparent !important;
      outline: none !important;
      border: none !important;
    }
    .cart-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 4px;
    }
    .cart-summary {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .scanned-qty-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 72px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px dashed rgba(255, 255, 255, 0.3);
      background: transparent;
      color: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    }
    .scanned-qty-button:hover,
    .scanned-qty-button:focus-visible {
      border-color: rgba(255, 107, 148, 0.8);
      color: #ff9fba;
      outline: none;
      background: rgba(255, 255, 255, 0.04);
    }
    .qty-hint {
      font-size: 0.85rem;
      color: #fbb6c7;
      margin: 0;
      display: none;
    }
    .qty-cost-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      font-weight: 600;
      font-size: 0.9rem;
    }
      position: static;
      background: rgba(5, 5, 5, 0.92);
      padding: 10px 12px 14px;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      color: #f7a8b7;
      z-index: 1;
    }
    .cart-table th,
    .cart-table td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
      font-size: 0.9rem;
    }
    .cart-table tbody td {
      padding-top: 14px;
      background: transparent;
    }
    #cart-empty {
      margin: 12px 0;
      color: #c4c4c4;
      font-size: 0.9rem;
    }
    .cart-row-actions button {
      background: transparent;
      border: 1px solid rgba(255, 97, 136, 0.6);
      color: #ff97b6;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .cart-row-actions button:hover {
      border-color: #ff6b94;
      color: #ff6b94;
    }
    #cart-count {
      font-size: 0.85rem;
      color: #f1c1cf;
    }
    #qty-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    #variant-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1005;
    }
    #variant-modal-card {
      width: min(520px, calc(100vw - 48px));
      background: #060606;
      border: 2px solid #ff1b2d;
      border-radius: 20px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 80vh;
      overflow: auto;
    }
    .variant-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .variant-modal-header h3 {
      margin: 0;
    }
    .variant-modal-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .variant-row {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .variant-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .variant-uom {
      font-size: 0.8rem;
      letter-spacing: 0.14em;
      color: #ff6b81;
      text-transform: uppercase;
    }
    .variant-qty-controls {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .variant-qty-controls input {
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      border-radius: 12px;
      border: 2px solid rgba(255, 34, 67, 0.5);
      padding: 8px 10px;
      text-align: center;
    }
    .variant-qty-button {
      border-radius: 999px;
      border: 2px solid rgba(255, 34, 67, 0.6);
      background: transparent;
      color: #fff;
      padding: 6px 10px;
      font-weight: 700;
      cursor: pointer;
    }
    .variant-add-button {
      width: 100%;
      padding: 8px 12px;
      border-radius: 999px;
      border: none;
      background: #ff1b2d;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    #qty-form {
      width: min(420px, calc(100vw - 48px));
      background: #060606;
      border: 2px solid #ff1b2d;
      border-radius: 20px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
    #qty-title {
      margin: 0;
      font-size: 1.1rem;
      letter-spacing: 0.05em;
    }
    #qty-uom {
      font-size: 1.5rem;
      letter-spacing: 0.15em;
      color: #ff6b81;
      margin: 4px 0 12px 0;
    }
    #qty-input {
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      border-radius: 16px;
      border: 3px solid rgba(255, 34, 67, 0.5);
      padding: 12px 16px;
      font-size: 1.2rem;
      text-align: center;
    }
    .qty-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .qty-actions button {
      flex: 1;
      min-width: 160px;
    }
    #operator-passcode-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1100;
    }
    #operator-passcode-modal.active {
      display: flex;
    }
    #operator-passcode-form {
      width: min(420px, calc(100vw - 48px));
      background: #050505;
      border: 2px solid #7c3aed;
      border-radius: 20px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
    #operator-passcode-form h3 {
      margin: 0;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    #operator-modal-context {
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      color: #f7a8b7;
      text-transform: uppercase;
      margin: 0;
    }
    #operator-passcode-input {
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      border-radius: 16px;
      border: 3px solid rgba(124, 58, 237, 0.5);
      padding: 12px 16px;
      font-size: 1.1rem;
      text-align: center;
      letter-spacing: 0.2em;
    }
    .operator-modal-error {
      min-height: 1.2em;
      font-size: 0.85rem;
      color: #ffb4c4;
      margin: 0;
    }
    .operator-modal-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .operator-modal-actions button {
      flex: 1;
      min-width: 120px;
    }
    #purchase-page,
    #damage-page {
      display: none;
      flex-direction: column;
      gap: 14px;
      width: 960px;
      max-width: 960px;
      min-width: 960px;
      min-height: auto;
      margin: 0 auto;
      background: rgba(0, 0, 0, 0.85);
      padding: calc(var(--shell-pad) * 1.0);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 25px 80px -30px rgba(0, 0, 0, 0.9);
    }
    .purchase-header-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .damage-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .purchase-route-info {
      margin-top: 8px;
    }
    .damage-route-info {
      margin-top: 8px;
    }
    .purchase-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .damage-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      border-color: rgba(34, 197, 94, 0.35);
    }
    .purchase-header {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .damage-header {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .purchase-shell {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .damage-shell {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .purchase-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(240px, 1fr));
      gap: clamp(12px, 2vw, 18px);
      align-items: end;
    }
    .purchase-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .purchase-grid input,
    .purchase-grid select {
      min-height: 40px;
      box-sizing: border-box;
    }
    .reference-field {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #purchase-reference {
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    #purchase-supplier,
    #purchase-supplier option {
      font-size: 24px;
    }
    .purchase-grid label textarea {
      min-height: 88px;
      resize: vertical;
    }
    .search-field {
      position: relative;
    }
    .purchase-field-actions,
    .reference-actions {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .keyboard-toggle {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 0.75rem;
    }
    .purchase-inline-keyboard {
      position: fixed;
      left: 50%;
      top: 90px !important;
      bottom: auto !important;
      transform: translateX(-50%) !important;
      width: min(520px, calc(100vw - 32px));
      max-width: 520px;
      z-index: 35;
    }
    .purchase-inline-numpad {
      position: fixed;
      left: 50%;
      top: 90px !important;
      bottom: auto !important;
      transform: translateX(-50%) !important;
      z-index: 60;
    }
    .purchase-inline-keyboard {
      padding: 8px;
      gap: 6px;
    }
    .purchase-inline-keyboard button {
      min-height: 38px;
      font-size: 0.82rem;
      padding: 8px 6px;
    }
    .purchase-inline-numpad button {
      min-height: 38px;
      font-size: 0.82rem;
      padding: 8px 6px;
    }
    .purchase-timestamp-hint {
      margin: 0;
      font-size: 0.85rem;
      color: #f7a8b7;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .purchase-cart-section {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: clamp(12px, 2vw, 18px);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .virtual-numpad {
      display: none;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.75);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    }
    .virtual-numpad.active {
      display: grid;
    }
    .virtual-numpad button {
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.04);
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      letter-spacing: 0.08em;
      cursor: pointer;
    }
    .virtual-numpad button:hover,
    .virtual-numpad button:focus-visible {
      border-color: rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }
    .virtual-numpad button[data-action="clear"],
    .virtual-numpad button[data-action="delete"],
    .virtual-numpad button[data-action="close"] {
      background: rgba(255, 43, 72, 0.08);
      border-color: rgba(255, 43, 72, 0.4);
    }
    .virtual-keyboard {
      display: none;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 10px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.92);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 28px 72px rgba(0, 0, 0, 0.7);
      max-width: 820px;
      width: min(820px, calc(100vw - 32px));
      justify-items: stretch;
      position: fixed;
      left: 50%;
      top: 45%;
      transform: translate(-50%, -50%);
      z-index: 40;
    }
    .virtual-keyboard.active {
      display: grid;
    }
    .virtual-keyboard button {
      padding: 14px 10px;
      min-height: 54px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: 0.04em;
      cursor: pointer;
    }
    .virtual-keyboard button:hover,
    .virtual-keyboard button:focus-visible {
      border-color: rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }
    .virtual-keyboard button[data-action] {
      background: rgba(86, 126, 255, 0.12);
      border-color: rgba(86, 126, 255, 0.45);
    }
    .virtual-keyboard button.wide-2 {
      grid-column: span 2;
    }
    .virtual-keyboard button.wide-3 {
      grid-column: span 3;
    }
    .virtual-keyboard button.wide-4 {
      grid-column: span 4;
    }
    .virtual-keyboard button.wide-5 {
      grid-column: span 5;
    }
    .keyboard-trigger {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      border-radius: 12px;
      padding: 10px 14px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .keyboard-trigger:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      transform: translateY(-1px);
    }
    .purchase-header {
      align-items: center;
      text-align: center;
    }
    .purchase-header-bar {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .purchase-route-info {
      text-align: center;
    }
    #purchase-open {
      background: linear-gradient(100deg, #6b46c1, #7c3aed, #8b5cf6);
      border-color: rgba(139, 92, 246, 0.6);
      color: #fff;
    }
    .purchase-summary {
      background: rgba(255, 255, 255, 0.02);
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 16px;
    }
    .scanned-qty-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 10px;
      padding: 8px 10px;
      text-align: center;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .scanned-qty-input:focus {
      outline: none;
      border-color: rgba(255, 27, 45, 0.6);
      box-shadow: 0 0 8px rgba(255, 27, 45, 0.4);
    }
    .purchase-summary h4 {
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.9rem;
      color: #f7a8b7;
    }
    .purchase-summary ul {
      margin: 0;
      padding-left: 16px;
      max-height: 180px;
      overflow-y: auto;
      font-size: 0.9rem;
    }
    .purchase-summary li + li {
      margin-top: 6px;
    }
    #purchase-summary-empty {
      margin: 0;
      color: #c8c8c8;
      font-size: 0.9rem;
    }
    .purchase-warehouse-hint {
      margin: 0;
      font-size: 0.85rem;
      color: #f7a8b7;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .purchase-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    .purchase-actions button,
    .purchase-actions .button {
      flex: 1;
      min-width: 180px;
    }
    #purchase-scanner-wedge {
      opacity: 0;
      position: fixed;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }
    .numpad {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .numpad button {
      padding: 14px 0;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.04);
      color: #fff;
      font-size: 1.2rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .numpad button:hover {
      border-color: rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.08);
    }
    .numpad button[data-action="enter"] {
      grid-column: span 2;
      background: linear-gradient(100deg, #ff1b2d, #ff004d);
      border-color: rgba(255, 0, 77, 0.6);
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .console-headline {
      text-align: center;
    }
    .console-headline h1 {
      font-size: 1.8rem;
      margin: 0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .transfer-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 8px;
    }
    .transfer-actions button,
    .transfer-actions .button {
      min-width: clamp(190px, 34%, 260px);
    }
    .damage-panel {
      margin-top: 12px;
      border-color: rgba(34, 197, 94, 0.35);
    }
    .damage-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 6px;
    }
    .damage-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .button-green {
      background: linear-gradient(120deg, #10b981, #22c55e, #16a34a);
      color: #032012;
      border: 1px solid rgba(34, 197, 94, 0.5);
      box-shadow: 0 18px 30px rgba(34, 197, 94, 0.25);
    }
    .button-green:hover:not(:disabled) {
      box-shadow: 0 18px 36px rgba(34, 197, 94, 0.35);
      transform: translateY(-2px);
    }
    .active-mode {
      border-color: rgba(34, 197, 94, 0.6) !important;
      box-shadow: 0 18px 38px rgba(34, 197, 94, 0.18);
    }
    .damage-hint {
      margin: 2px 0 0 0;
      color: #b7f7d1;
      font-size: 0.9rem;
    }
    .button-outline {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.35);
      color: #ffe2e8;
      box-shadow: none;
    }
    .button-outline:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      box-shadow: none;
      transform: translateY(-1px);
    }
    .toast {
      position: fixed;
      bottom: 32px;
      right: 32px;
      padding: 14px 18px;
      border-radius: 16px;
      border: 1px solid transparent;
      background: rgba(0, 0, 0, 0.85);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
      opacity: 0;
      pointer-events: none;
      transform: translateY(16px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      font-size: 0.95rem;
      min-width: 240px;
      text-align: center;
      z-index: 1200;
    }
    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.success {
      border-color: rgba(34, 197, 94, 0.5);
      color: #c8ffd5;
    }
    .toast.error {
      border-color: rgba(255, 99, 132, 0.6);
      color: #ffd6dc;
    }
    @media (max-width: 1080px) {
      main {
        width: min(820px, calc(100vw - 20px));
      }
    }
    @media (max-width: 720px) {
      body {
        align-items: flex-start;
        padding: 16px;
      }
      main {
        width: 100%;
        padding: 16px;
      }
      button {
        width: 100%;
      }
      .toast {
        left: 16px;
        right: 16px;
        bottom: 16px;
      }
    }
  </style>
</head>
<body data-view="${initialView}" data-auth="true">
  <input id="scanner-wedge" type="text" autocomplete="off" style="opacity:0; position:fixed; width:1px; height:1px; top:0; left:0;" />
  <main>
    <section id="auth-section" class="panel" style="display:none !important;">
      <header class="brand-header">
        <img src="/afterten-logo.png" alt="AfterTen logo" />
      </header>
      <h1>Operator Login</h1>
      <p class="subtitle">Scan your badge QR or use email/password to enter the transfer bay.</p>
      <form id="login-form">
        <div class="two-cols">
          <label>Work Email
            <input type="email" id="login-email" placeholder="you@example.com" autocomplete="username" required />
          </label>
          <label>Password
            <input type="password" id="login-password" placeholder="********" autocomplete="current-password" required />
          </label>
        </div>
        <input id="login-wedge" type="text" autocomplete="off" style="position:absolute; opacity:0; height:0;" />
        <p class="scanner-hint">Badge scanners are live. Hover a code to auto-fill credentials.</p>
        <button type="submit" class="login-submit">Sign in</button>
        <div id="login-status" class="message" style="display:none"></div>
      </form>
    </section>

    <section id="app-section">
      <div class="console-sticky">
        <header class="brand-header brand-header--app">
          <img src="/afterten-logo.png" alt="AfterTen logo" />
        </header>
        <header class="console-headline">
          <h1>Warehouse Transfer Console</h1>
        </header>
        <div class="console-actions">
          <button type="button" class="button button-outline logout-button" data-logout="true">Log out</button>
        </div>
        <article class="panel route-locker">
          <div class="two-cols">
            <div class="locked-pill">
              <h3>From</h3>
              <p id="source-label">${escapeHtml(sourcePillLabel)}</p>
            </div>
            <div class="locked-pill locked-pill--destination">
              <h3>To</h3>
              <p id="dest-label">${escapeHtml(destPillLabel)}</p>
              <div class="destination-select-grid">
                <label class="destination-pill-select">
                  <span class="destination-pill-hint">Outlets</span>
                  <button type="button" id="destination-picker" class="destination-pill-button">Choose destination</button>
                  <select id="console-destination-select" class="destination-hidden-select">
                    <option value="">Select...</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </article>
      </div>

      <article class="panel transfer-panel">
        <form id="transfer-form">
          <section class="operator-auth-card" data-context="transfer">
            <div class="operator-auth-head">
              <h3>Transfer Operator</h3>
              <span id="transfer-operator-status" class="operator-status-pill" data-state="locked">Locked</span>
            </div>
            <label class="operator-select-label">Select operator
              <button type="button" id="transfer-operator-picker" class="operator-pill-button">Select operator</button>
              <select id="transfer-operator-select" class="operator-hidden-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Transfers stay locked until a valid operator signs in. Sessions auto-expire after 20 minutes.</p>
          </section>
          <section class="ingredient-panel">
            <div class="ingredient-head">
              <h3>Ingredients</h3>
              <p>Tap an ingredient or variant to enter quantity.</p>
            </div>
            <div id="ingredient-grid" class="ingredient-grid" aria-live="polite"></div>
            <p id="ingredient-empty" class="ingredient-empty">No ingredients available.</p>
          </section>
          <section id="cart-section">
            <div class="cart-head">
              <div>
                <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem;">Transfer Cart</h3>
              </div>
              <div class="cart-summary">
                <span id="cart-count">0 items</span>
              </div>
            </div>
            <table class="cart-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Variation</th>
                  <th scope="col">Scanned Qty</th>
                  <th scope="col">Qty</th>
                  <th scope="col">UOM</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody id="cart-body"></tbody>
            </table>
            <p id="cart-empty">No items scanned yet.</p>
          </section>


          <div class="transfer-actions">
            <button type="submit" id="transfer-submit">Submit Transfer</button>
            <a id="damage-open" class="button button-green" href="?view=damage" role="button">Log Damages</a>
          </div>
        </form>
      </article>

    </section>
  </main>

  <div id="result-toast" class="toast" role="status" aria-live="polite"></div>

  <div id="destination-modal" class="select-modal" aria-hidden="true">
    <div class="select-modal-card" role="dialog" aria-modal="true" aria-labelledby="destination-modal-title">
      <div class="select-modal-header" id="destination-modal-title">Choose destination</div>
      <div class="select-modal-grid" id="destination-modal-options"></div>
      <div class="select-modal-actions">
        <button type="button" class="select-modal-close" data-modal-close="destination-modal">Close</button>
      </div>
    </div>
  </div>

  <div id="operator-modal" class="select-modal" aria-hidden="true">
    <div class="select-modal-card" role="dialog" aria-modal="true" aria-labelledby="operator-modal-title">
      <div class="select-modal-header" id="operator-modal-title">Select operator</div>
      <div class="select-modal-grid" id="operator-modal-options"></div>
      <div class="select-modal-actions">
        <button type="button" class="select-modal-close" data-modal-close="operator-modal">Close</button>
      </div>
    </div>
  </div>

  <div id="supplier-modal" class="select-modal" aria-hidden="true">
    <div class="select-modal-card" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title">
      <div class="select-modal-header" id="supplier-modal-title">Select supplier</div>
      <div class="select-modal-grid" id="supplier-modal-options"></div>
      <div class="select-modal-actions">
        <button type="button" class="select-modal-close" data-modal-close="supplier-modal">Close</button>
      </div>
    </div>
  </div>

  <div id="qty-modal">
    <form id="qty-form">
      <h3 id="qty-title">Enter quantity</h3>
      <p id="qty-uom">UNIT</p>
      <p id="qty-hint" class="qty-hint"></p>
      <input type="number" id="qty-input" min="0" step="0.01" placeholder="0" required />
      <div class="numpad" id="qty-numpad" aria-label="Quantity keypad">
        <button type="button" data-key="7">7</button>
        <button type="button" data-key="8">8</button>
        <button type="button" data-key="9">9</button>
        <button type="button" data-key="4">4</button>
        <button type="button" data-key="5">5</button>
        <button type="button" data-key="6">6</button>
        <button type="button" data-key="1">1</button>
        <button type="button" data-key="2">2</button>
        <button type="button" data-key="3">3</button>
        <button type="button" data-action="clear">CLR</button>
        <button type="button" data-key="0">0</button>
        <button type="button" data-action="enter">Enter</button>
      </div>
      <div class="qty-actions">
        <button type="button" id="qty-cancel">Cancel</button>
      </div>
    </form>
  </div>

  <div id="variant-modal" aria-hidden="true">
    <div id="variant-modal-card">
      <div class="variant-modal-header">
        <h3 id="variant-modal-title">Select variant</h3>
        <button type="button" id="variant-modal-close">Close</button>
      </div>
      <div id="variant-modal-body" class="variant-modal-body"></div>
      <div class="numpad" id="variant-numpad" aria-label="Variant quantity keypad">
        <button type="button" data-key="7">7</button>
        <button type="button" data-key="8">8</button>
        <button type="button" data-key="9">9</button>
        <button type="button" data-key="4">4</button>
        <button type="button" data-key="5">5</button>
        <button type="button" data-key="6">6</button>
        <button type="button" data-key="1">1</button>
        <button type="button" data-key="2">2</button>
        <button type="button" data-key="3">3</button>
        <button type="button" data-action="clear">CLR</button>
        <button type="button" data-key="0">0</button>
        <button type="button" data-action="enter">Enter</button>
      </div>
    </div>
  </div>

  <div id="operator-passcode-modal" aria-hidden="true">
    <form id="operator-passcode-form">
      <h3 id="operator-modal-title">Unlock Console</h3>
      <p id="operator-modal-context">Scan or type the operator password to continue.</p>
      <input type="password" id="operator-passcode-input" placeholder="Scan or type password" autocomplete="current-password" />
      <p id="operator-modal-error" class="operator-modal-error"></p>
      <div class="operator-modal-actions">
        <button type="button" id="operator-modal-cancel">Cancel</button>
      </div>
    </form>
  </div>

  <section id="purchase-page">
    <header class="panel purchase-header">
      <div class="purchase-header-bar">
        <div class="brand-header">
          <img src="/afterten-logo.png" alt="AfterTen logo" />
        </div>
      </div>
      <div class="purchase-route-info">
        <p class="purchase-warehouse-hint">Intake warehouse: <span id="purchase-warehouse-label">${escapeHtml(sourceWarehouseName)}</span></p>
      </div>
    </header>
    <article class="panel purchase-panel">
      <form id="purchase-form">
        <div class="purchase-shell">
          <section class="operator-auth-card" data-context="purchase">
            <div class="operator-auth-head">
              <h3>Purchase Operator</h3>
              <span id="purchase-operator-status" class="operator-status-pill" data-state="locked">Locked</span>
            </div>
            <label class="operator-select-label">Select operator
              <button type="button" id="purchase-operator-picker" class="operator-pill-button">Select operator</button>
              <select id="purchase-operator-select" class="operator-hidden-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Unlock purchases with the assigned Supabase password. Sessions auto-expire after 20 minutes.</p>
          </section>
          <h3>Purchase Intake</h3>
          <div class="purchase-grid">
            <label>Supplier
              <button type="button" id="purchase-supplier-picker" class="operator-pill-button">Select supplier</button>
              <select id="purchase-supplier" class="operator-hidden-select">
                <option value="">Select supplier</option>
              </select>
            </label>
            <label class="search-field">Item search
              <input id="purchase-item-search" type="text" placeholder="Search items or scan barcode" autocomplete="off" />
            </label>
            <div class="reference-field">
              <label>Reference / Invoice #
                <input type="text" id="purchase-reference" placeholder="INV-12345" required />
              </label>
              <div id="reference-numpad-digits" class="virtual-numpad purchase-inline-numpad" aria-hidden="true">
                <button type="button" data-key="7">7</button>
                <button type="button" data-key="8">8</button>
                <button type="button" data-key="9">9</button>
                <button type="button" data-key="4">4</button>
                <button type="button" data-key="5">5</button>
                <button type="button" data-key="6">6</button>
                <button type="button" data-key="1">1</button>
                <button type="button" data-key="2">2</button>
                <button type="button" data-key="3">3</button>
                <button type="button" data-action="clear">CLR</button>
                <button type="button" data-key="0">0</button>
                <button type="button" data-action="enter">Enter</button>
                <button type="button" data-action="delete">DEL</button>
                <button type="button" data-key="-">-</button>
                <button type="button" data-key="/">/</button>
                <button type="button" data-action="close">Close</button>
              </div>
            </div>
          </div>
          <section class="purchase-cart-section">
            <div class="cart-head">
              <div>
                <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem;">Purchase Cart</h3>
                <p class="purchase-warehouse-hint" style="margin-top:4px;">Stock posts to <span id="purchase-cart-warehouse">${escapeHtml(sourceWarehouseName)}</span></p>
              </div>
              <div class="cart-summary">
                <span id="purchase-cart-count">0 items</span>
              </div>
            </div>
            <table class="cart-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Variation</th>
                  <th scope="col">Scanned Qty</th>
                  <th scope="col">Qty</th>
                  <th scope="col">UOM</th>
                  <th scope="col">Unit Cost</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody id="purchase-cart-body"></tbody>
            </table>
            <p id="purchase-cart-empty">No items scanned yet.</p>
          </section>
          <div class="purchase-actions">
            <a id="purchase-back" class="button button-outline" href="/Beverages_Storeroom_Scanner" role="button">Back to Transfers</a>
            <button type="submit" id="purchase-submit">Record Purchase</button>
            <button type="button" class="button button-outline logout-button" data-logout="true">Log out</button>
          </div>
        </div>
      </form>
    </article>
  </section>

  <section id="damage-page">
    <header class="panel damage-header">
      <div class="damage-header-bar">
        <div class="brand-header">
          <img src="/afterten-logo.png" alt="AfterTen logo" />
        </div>
        <div class="damage-route-info">
          <p class="damage-hint" style="margin:0;">Scans deduct from <span id="damage-warehouse-label">${escapeHtml(sourceWarehouseName)}</span>.</p>
        </div>
      </div>
    </header>
    <article class="panel damage-panel" id="damage-panel">
      <form id="damage-form">
        <div class="damage-shell">
          <section class="operator-auth-card" data-context="damage">
            <div class="operator-auth-head">
              <h3>Damage Operator</h3>
              <span id="damage-operator-status" class="operator-status-pill" data-state="locked">Locked</span>
            </div>
            <label class="operator-select-label">Select operator
              <button type="button" id="damage-operator-picker" class="operator-pill-button">Select operator</button>
              <select id="damage-operator-select" class="operator-hidden-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Damages stay locked until an operator signs in. Auto-lock after 20 minutes.</p>
          </section>
          <h3>Log Damages</h3>
          <section class="ingredient-panel">
            <div class="ingredient-head">
              <h3>Ingredients</h3>
              <p>Tap an ingredient to log damages.</p>
            </div>
            <div id="damage-ingredient-grid" class="ingredient-grid" aria-live="polite"></div>
            <p id="damage-ingredient-empty" class="ingredient-empty">No ingredients available.</p>
          </section>
          <div class="cart-head">
            <div>
              <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem;">Damages Cart</h3>
              <p class="damage-hint" style="margin-top:4px;">Scans deduct from <span id="damage-cart-warehouse">${escapeHtml(sourceWarehouseName)}</span></p>
            </div>
            <div class="cart-summary">
              <span id="damage-cart-count">0 items</span>
            </div>
          </div>
          <table class="cart-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Variation</th>
                <th scope="col">Scanned Qty</th>
                <th scope="col">Qty</th>
                <th scope="col">UOM</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody id="damage-cart-body"></tbody>
          </table>
          <p id="damage-cart-empty">No damages logged yet.</p>
          <label>Damage Note (optional)
            <input type="text" id="damage-note" placeholder="e.g. Broken on arrival" />
            <div id="damage-notes-keyboard" class="virtual-keyboard" aria-hidden="true">
              <!-- Row 1 -->
              <button type="button" data-key="Q">Q</button>
              <button type="button" data-key="W">W</button>
              <button type="button" data-key="E">E</button>
              <button type="button" data-key="R">R</button>
              <button type="button" data-key="T">T</button>
              <button type="button" data-key="Y">Y</button>
              <button type="button" data-key="U">U</button>
              <button type="button" data-key="I">I</button>
              <button type="button" data-key="O">O</button>
              <button type="button" data-key="P">P</button>
              <!-- Row 2 -->
              <button type="button" data-key="A">A</button>
              <button type="button" data-key="S">S</button>
              <button type="button" data-key="D">D</button>
              <button type="button" data-key="F">F</button>
              <button type="button" data-key="G">G</button>
              <button type="button" data-key="H">H</button>
              <button type="button" data-key="J">J</button>
              <button type="button" data-key="K">K</button>
              <button type="button" data-key="L">L</button>
              <button type="button" data-key=";" aria-label="Semicolon">;</button>
              <!-- Row 3 -->
              <button type="button" data-key="Z">Z</button>
              <button type="button" data-key="X">X</button>
              <button type="button" data-key="C">C</button>
              <button type="button" data-key="V">V</button>
              <button type="button" data-key="B">B</button>
              <button type="button" data-key="N">N</button>
              <button type="button" data-key="M">M</button>
              <button type="button" data-key="," aria-label="Comma">,</button>
              <button type="button" data-key="." aria-label="Period">.</button>
              <button type="button" data-key="/" aria-label="Slash">/</button>
              <!-- Row 4 -->
              <button type="button" class="wide-5" data-action="space">Space</button>
              <button type="button" class="wide-3" data-action="delete">Backspace</button>
              <button type="button" data-key="-" aria-label="Dash">-</button>
              <button type="button" data-key="'" aria-label="Apostrophe">'</button>
              <!-- Row 5 -->
              <button type="button" class="wide-5" data-action="clear">Clear</button>
              <button type="button" class="wide-5" data-action="close">Close</button>
            </div>
          </label>
          <div class="damage-actions">
            <a id="damage-back" class="button button-outline" href="/Beverages_Storeroom_Scanner" role="button">Back to Transfers</a>
            <button type="submit" id="damage-submit" class="button-green">Log Damages</button>
            <button type="button" class="button button-outline logout-button" data-logout="true">Log out</button>
          </div>
        </div>
      </form>
    </article>
  </section>

  <script src="/vendor/supabase.min.js"></script>
  <script>
    (function () {
    const SUPABASE_URL_RAW = ${JSON.stringify(PROJECT_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY)};
    const SUPABASE_PROXY_PATH = '/api/supabase-proxy';
    const SUPABASE_URL = (() => {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return window.location.origin + SUPABASE_PROXY_PATH;
      }
      return SUPABASE_URL_RAW;
    })();
    const STOCK_VIEW_NAME = ${JSON.stringify(STOCK_VIEW_NAME)};
    const MULTIPLY_QTY_BY_PACKAGE = ${JSON.stringify(MULTIPLY_QTY_BY_PACKAGE)};
    const INITIAL_WAREHOUSES = ${initialWarehousesJson};
    const OPERATOR_CONTEXT_LABELS = ${operatorContextLabelsJson};
    const DESTINATION_CHOICES = ${destinationChoicesJson};
    const ALLOWED_DESTINATION_IDS = ${serializeForScript(ALLOWED_DESTINATION_IDS)};
    const STORAGE_HOME_ALLOWED_IDS = ${serializeForScript(STORAGE_HOME_ALLOWED_IDS)};
    const OPERATOR_SESSION_TTL_MS = ${OPERATOR_SESSION_TTL_MS};
    window.OPERATOR_SESSION_TTL_MS = OPERATOR_SESSION_TTL_MS;
    const SCANNER_NAME = 'Supervisor';
    const SCANNER_ID = '493e58d7-a974-4251-a8b7-19e5f39c48cb';
    const SESSION_STORAGE_KEY = 'beverage-kiosk-session-v2';
    const PASSWORD_STORAGE_KEY = 'beverage-password-verifier-v2';
    const REQUIRED_ROLE = 'supervisor';
    const REQUIRED_ROLE_ID = 'eef421e0-ce06-4518-93c4-6bb6525f6742';
    const ADMIN_ROLE_ID = '6b9e657a-6131-4a0b-8afa-0ce260f8ed0c';
    const BACKOFFICE_ROLE_ID = 'de9f2075-9c97-4da1-a2a0-59ed162947e7';
    const ALLOWED_USER_IDS = ['fd52f4c1-2403-4670-bdd6-97b4ca7580aa'];
    const ALLOWED_ROLE_SLUGS = ['supervisor', 'administrator'];
    const REQUIRED_ROLE_LABEL = 'Supervisor';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      document.body.innerHTML = '<main><p style="color:#fecaca">Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p></main>';
    } else {
      if (window.__beverageAppInitialized) {
        console.debug('Beverage scanner already initialized; skipping duplicate bootstrap');
        return;
      }
      window.__beverageAppInitialized = true;
      const supabaseClients = (window.__supabaseClients = window.__supabaseClients || {});
      const supabaseClientCache = (window.__supabaseClientCache = window.__supabaseClientCache || {});

      (function patchConsoleWarnOnce() {
        if (window.__supabaseWarnPatched) return;
        window.__supabaseWarnPatched = true;
        const originalWarn = console.warn.bind(console);
        console.warn = (...args) => {
          const msg = typeof args[0] === 'string' ? args[0] : '';
          if (msg.includes('Multiple GoTrueClient instances detected')) return;
          originalWarn(...args);
        };
      })();

      function getSupabaseClient(cacheKey, options) {
        if (supabaseClientCache[cacheKey]) return supabaseClientCache[cacheKey];
        const GoTrue = window.supabase?.GoTrueClient;
        if (GoTrue?.nextInstanceID && Object.prototype.hasOwnProperty.call(GoTrue.nextInstanceID, cacheKey)) {
          delete GoTrue.nextInstanceID[cacheKey];
        }
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
        supabaseClientCache[cacheKey] = client;
        return client;
      }

      const supabase = supabaseClients.beverageSession ?? getSupabaseClient(SESSION_STORAGE_KEY, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: SESSION_STORAGE_KEY
        }
      });
      supabaseClients.beverageSession = supabase;

      const passwordVerifier = supabaseClients.beveragePassword ?? getSupabaseClient(PASSWORD_STORAGE_KEY, {
        auth: {
          detectSessionInUrl: false,
          persistSession: false,
          autoRefreshToken: false,
          storageKey: PASSWORD_STORAGE_KEY
        }
      });
      supabaseClients.beveragePassword = passwordVerifier;

      const initialWarehouses = Array.isArray(INITIAL_WAREHOUSES) ? INITIAL_WAREHOUSES : [];
      const lockedSourceId = ${JSON.stringify(LOCKED_SOURCE_ID)};

      const state = {
        session: null,
        warehouses: initialWarehouses,
        products: [],
        ingredients: [],
        variations: new Map(),
        variationIndex: new Map(),
        mode: 'transfer',
        transferCart: [],
        damageCart: [],
        purchaseCart: [],
        pendingEntry: null,
        pendingEditIndex: null,
        pendingContext: 'transfer',
        loading: false,
        operatorProfile: null,
        lockedSource: null,
        lockedDest: null,
        suppliers: [],
        operators: [],
        destinationOptions: Array.isArray(DESTINATION_CHOICES) ? DESTINATION_CHOICES : [],
        destinationSelection: null,
        purchaseForm: {
          supplierId: '',
          referenceCode: ''
        },
        purchaseSubmitting: false,
        damageSubmitting: false,
        damageNote: '',
        operatorSessions: {
          transfer: null,
          purchase: null,
          damage: null
        },
        operatorSessionTimers: {
          transfer: null,
          purchase: null,
          damage: null
        },
        pendingOperatorSelection: null,
        operatorUnlocking: false,
        networkOffline: false
      };

      state.lockedSource = state.warehouses.find((w) => w.id === lockedSourceId) ?? null;
      state.lockedDest = null;
      console.log('initial warehouses snapshot', state.warehouses);

      function reportClientReady() {
        console.log('client script ready');
        showLoginInfo('Client ready. Waiting for session...');
      }

      function markOfflineIfNetworkError(error) {
        const message = error?.message || '';
        if (message.includes('Failed to fetch') || message.includes('ENOTFOUND') || message.includes('ERR_NAME_NOT_RESOLVED')) {
          state.networkOffline = true;
        }
      }

      window.addEventListener('error', (event) => {
        console.error('window error', event.error || event.message);
        showLoginError('Client error: ' + (event.message || 'Unknown error'));
      });

      window.addEventListener('unhandledrejection', (event) => {
        console.error('unhandled rejection', event.reason);
        showLoginError('Client promise error: ' + (event.reason?.message || event.reason || 'Unknown error'));
      });

      const rootElement = document.documentElement;
      const consoleSticky = document.querySelector('.console-sticky');

      function updateStickyOffset() {
        if (!rootElement || !consoleSticky) return;
        const computed = window.getComputedStyle(consoleSticky);
        if (computed.display === 'none' || consoleSticky.offsetHeight === 0) return;
        const pad = parseFloat(window.getComputedStyle(rootElement).getPropertyValue('--shell-pad')) || 0;
        const stickyTop = Math.max(pad - 6, 0);
        const offset = stickyTop + consoleSticky.offsetHeight + 12;
        rootElement.style.setProperty('--sticky-stack-offset', offset + 'px');
      }

      window.addEventListener('resize', () => {
        window.requestAnimationFrame(updateStickyOffset);
      });
      updateStickyOffset();

      const loginForm = document.getElementById('login-form');
      const loginStatus = document.getElementById('login-status');
      const loginWedge = document.getElementById('login-wedge');
      const transferForm = document.getElementById('transfer-form');
      const transferPanelEl = document.querySelector('.transfer-panel');
      const appSection = document.getElementById('app-section');
      const mainShell = document.querySelector('main');
      const resultToast = document.getElementById('result-toast');
      let resultToastTimeoutId = null;

      function showResult(message, isError = false) {
        if (!resultToast) return;
        resultToast.textContent = message;
        resultToast.classList.remove('success', 'error', 'visible');
        resultToast.classList.add(isError ? 'error' : 'success', 'visible');
        if (resultToastTimeoutId) {
          clearTimeout(resultToastTimeoutId);
        }
        resultToastTimeoutId = window.setTimeout(() => {
          resultToast.classList.remove('visible');
        }, 5000);
      }
      const transferSubmit = document.getElementById('transfer-submit');
      const sourceLabel = document.getElementById('source-label');
      const destLabel = document.getElementById('dest-label');
      const scannerWedge = document.getElementById('scanner-wedge');
      const itemSearchInput = document.getElementById('item-search');
      const ingredientGrid = document.getElementById('ingredient-grid');
      const ingredientEmpty = document.getElementById('ingredient-empty');
      const damageIngredientGrid = document.getElementById('damage-ingredient-grid');
      const damageIngredientEmpty = document.getElementById('damage-ingredient-empty');
      const damageItemSearchInput = document.getElementById('damage-item-search');
      const cartBody = document.getElementById('cart-body');
      const cartEmpty = document.getElementById('cart-empty');
      const cartCount = document.getElementById('cart-count');
      const damagePanel = document.getElementById('damage-panel');
      const damageForm = document.getElementById('damage-form');
      const damageCartBody = document.getElementById('damage-cart-body');
      const damageCartEmpty = document.getElementById('damage-cart-empty');
      const damageCartCount = document.getElementById('damage-cart-count');
      const damageSubmit = document.getElementById('damage-submit');
      const damageNote = document.getElementById('damage-note');
      const damageWarehouseLabel = document.getElementById('damage-warehouse-label');
      const damageCartWarehouse = document.getElementById('damage-cart-warehouse');
      const damageBackButton = document.getElementById('damage-back');
      const damagePage = document.getElementById('damage-page');
      const damageNotesKeyboard = document.getElementById('damage-notes-keyboard');
      const qtyModal = document.getElementById('qty-modal');
      const qtyForm = document.getElementById('qty-form');
      const qtyInput = document.getElementById('qty-input');
      const qtyUom = document.getElementById('qty-uom');
      const qtyTitle = document.getElementById('qty-title');
      const qtyCancel = document.getElementById('qty-cancel');
      const qtyNumpad = document.getElementById('qty-numpad');
      const qtyHint = document.getElementById('qty-hint');
      const qtySubmitButton = qtyForm?.querySelector('button[type="submit"]');
      const variantModal = document.getElementById('variant-modal');
      const variantModalBody = document.getElementById('variant-modal-body');
      const variantModalTitle = document.getElementById('variant-modal-title');
      const variantNumpad = document.getElementById('variant-numpad');
      let activeVariantQtyInput = null;
      let activeVariantAddButton = null;
      const variantModalClose = document.getElementById('variant-modal-close');
      const purchaseOpenButton = document.getElementById('purchase-open');
      const damageOpenButton = document.getElementById('damage-open');
      const purchasePage = document.getElementById('purchase-page');
      const purchaseForm = document.getElementById('purchase-form');
      const purchaseSupplier = document.getElementById('purchase-supplier');
      const purchaseSupplierPicker = document.getElementById('purchase-supplier-picker');
      const purchaseReference = document.getElementById('purchase-reference');
      const purchaseItemSearchInput = document.getElementById('purchase-item-search');
      const referenceNumpadDigits = document.getElementById('reference-numpad-digits');
      const purchaseSummaryList = document.getElementById('purchase-summary-list');
      const purchaseSummaryEmpty = document.getElementById('purchase-summary-empty');
      const purchaseWarehouseLabel = document.getElementById('purchase-warehouse-label');
      const purchaseCartWarehouse = document.getElementById('purchase-cart-warehouse');
      const purchaseBackButton = document.getElementById('purchase-back');
      const purchaseSubmit = document.getElementById('purchase-submit');
      const purchaseCartBody = document.getElementById('purchase-cart-body');
      const purchaseCartEmpty = document.getElementById('purchase-cart-empty');
      const purchaseCartCount = document.getElementById('purchase-cart-count');
      const badgeScanBtn = null;
      const focusLoginWedgeBtn = null;
      let itemSearchDebounceId = null;
      let lastSearchTerm = '';
      let ingredientPickerEl = null;
      const operatorSelects = {
        transfer: document.getElementById('transfer-operator-select'),
        purchase: document.getElementById('purchase-operator-select'),
        damage: document.getElementById('damage-operator-select')
      };
      const operatorPickers = {
        transfer: document.getElementById('transfer-operator-picker'),
        purchase: document.getElementById('purchase-operator-picker'),
        damage: document.getElementById('damage-operator-picker')
      };
      const destinationSelect = document.getElementById('console-destination-select');
      const destinationPicker = document.getElementById('destination-picker');
      const destinationModal = document.getElementById('destination-modal');
      const destinationModalOptions = document.getElementById('destination-modal-options');
      const operatorSelectModal = document.getElementById('operator-modal');
      const operatorSelectModalOptions = document.getElementById('operator-modal-options');
      const supplierModal = document.getElementById('supplier-modal');
      const supplierModalOptions = document.getElementById('supplier-modal-options');
      let activeOperatorContext = 'transfer';
      const operatorStatusLabels = {
        transfer: document.getElementById('transfer-operator-status'),
        purchase: document.getElementById('purchase-operator-status'),
        damage: document.getElementById('damage-operator-status')
      };
      const operatorPasscodeModal = document.getElementById('operator-passcode-modal');
      const operatorModalForm = document.getElementById('operator-passcode-form');
      const operatorModalTitle = document.getElementById('operator-modal-title');
      const operatorModalContext = document.getElementById('operator-modal-context');
      const operatorPasswordInput = document.getElementById('operator-passcode-input');
      const operatorModalError = document.getElementById('operator-modal-error');
      const operatorModalCancel = document.getElementById('operator-modal-cancel');
      const logoutButtons = document.querySelectorAll('[data-logout="true"]');

      const VALID_VIEWS = ['transfer', 'damage'];

      function syncViewQuery(view) {
        if (typeof window === 'undefined' || !window.history?.replaceState) return;
        const url = new URL(window.location.href);
        if (view === 'transfer') {
          url.searchParams.delete('view');
        } else {
          url.searchParams.set('view', view);
        }
        const nextUrl = url.pathname + (url.search ? url.search : '') + url.hash;
        window.history.replaceState(null, '', nextUrl);
      }

      function syncViewVisibility(view) {
        const isPurchase = false;
        const isDamage = view === 'damage';
        const isTransfer = view === 'transfer';
        if (mainShell) {
          mainShell.style.display = isTransfer ? '' : 'none';
        }
        if (appSection) {
          appSection.style.display = isTransfer ? '' : 'none';
        }
        if (purchasePage) {
          purchasePage.hidden = true;
          purchasePage.style.display = 'none';
          purchasePage.setAttribute('aria-hidden', 'true');
        }
        if (damagePage) {
          damagePage.hidden = !isDamage;
          damagePage.style.display = isDamage ? 'flex' : 'none';
          damagePage.setAttribute('aria-hidden', isDamage ? 'false' : 'true');
        }
        if (isTransfer) {
          window.requestAnimationFrame(updateStickyOffset);
        }
      }

      function applyViewState(next) {
        const view = VALID_VIEWS.includes(next) ? next : 'transfer';
        document.body.dataset.view = view;
        document.body.setAttribute('data-view', view);
        document.body.classList.toggle('view-purchase', false);
        document.body.classList.toggle('view-damage', view === 'damage');
        syncViewVisibility(view);
        syncViewQuery(view);
        setMode(view);
      }

      applyViewState(document.body.dataset.view === 'damage' ? 'damage' : 'transfer');

      function setLockedWarehouseLabels(sourceWarehouse, destWarehouse, options) {
        const opts = options || {};
        const sourceMissingText = opts.sourceMissingText !== undefined
          ? opts.sourceMissingText
          : 'Source not found (verify Supabase record)';
        const destMissingText = opts.destMissingText !== undefined
          ? opts.destMissingText
          : 'Destination not found (verify Supabase record)';
        if (sourceLabel) {
          sourceLabel.textContent = sourceWarehouse
            ? (sourceWarehouse.name ?? 'Source warehouse') + (sourceWarehouse.active === false ? ' (inactive)' : '')
            : sourceMissingText;
        }
        if (destLabel) {
          destLabel.textContent = destWarehouse
            ? (destWarehouse.name ?? 'Destination warehouse') + (destWarehouse.active === false ? ' (inactive)' : '')
            : destMissingText;
        }
        if (sourceWarehouse) {
          const sourceName = sourceWarehouse.name ?? 'Warehouse';
          if (purchaseWarehouseLabel) {
            purchaseWarehouseLabel.textContent = sourceName;
          }
          if (purchaseCartWarehouse) {
            purchaseCartWarehouse.textContent = sourceName;
          }
          if (damageWarehouseLabel) {
            damageWarehouseLabel.textContent = sourceName;
          }
          if (damageCartWarehouse) {
            damageCartWarehouse.textContent = sourceName;
          }
        }
      }

      setLockedWarehouseLabels(state.lockedSource, state.lockedDest, {
        sourceMissingText: state.lockedSource ? undefined : 'Loading...',
        destMissingText: state.lockedDest ? undefined : 'Choose destination'
      });

      window.setTimeout(() => {
        focusActiveScanner();
      }, 200);
      let scanBuffer = '';
      let scanFlushTimeoutId = null;
      const SCAN_FLUSH_DELAY_MS = 90;
      let referenceNumpadHideTimeoutId = null;
      let damageKeyboardSuppressed = false;
      let operatorPasswordAutoSubmitTimeoutId = null;

      const cartElements = {
        transfer: {
          body: cartBody,
          empty: cartEmpty,
          count: cartCount
        },
        damage: {
          body: damageCartBody,
          empty: damageCartEmpty,
          count: damageCartCount
        },
        purchase: {
          body: purchaseCartBody,
          empty: purchaseCartEmpty,
          count: purchaseCartCount
        }
      };

      updateQtyHint(null);
      resetPurchaseForm();
      setMode('transfer');

      function normalizeKey(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim().replace(/[^0-9a-z]/gi, '').toLowerCase();
      }

      function ensureIngredientPickerStyles() {
        if (document.getElementById('ingredient-picker-styles')) return;
        const style = document.createElement('style');
        style.id = 'ingredient-picker-styles';
        style.textContent = [
          '.recipe-picker-overlay {',
          '  position: fixed;',
          '  inset: 0;',
          '  background: rgba(0,0,0,0.65);',
          '  display: flex;',
          '  align-items: center;',
          '  justify-content: center;',
          '  z-index: 9999;',
          '  padding: 16px;',
          '}',
          '.recipe-picker {',
          '  width: min(480px, 90vw);',
          '  background: #0c0c10;',
          '  border: 1px solid rgba(255, 43, 72, 0.35);',
          '  border-radius: 16px;',
          '  box-shadow: 0 25px 60px rgba(0,0,0,0.55);',
          '  padding: 18px 16px;',
          '  color: #f6f6f6;',
          '  font-family: inherit;',
          '}',
          '.recipe-picker h3 {',
          '  margin: 0 0 6px;',
          '  font-size: 1.1rem;',
          '  letter-spacing: 0.06em;',
          '  text-transform: uppercase;',
          '}',
          '.recipe-picker p {',
          '  margin: 0 0 12px;',
          '  color: #c8cbd6;',
          '  font-size: 0.95rem;',
          '}',
          '.recipe-picker .list {',
          '  display: flex;',
          '  flex-direction: column;',
          '  gap: 10px;',
          '  margin: 10px 0 16px;',
          '}',
          '.recipe-picker button.pick {',
          '  width: 100%;',
          '  border: 1px solid rgba(255, 43, 72, 0.45);',
          '  background: linear-gradient(120deg, #1b1b22, #111118);',
          '  color: #fefefe;',
          '  border-radius: 12px;',
          '  padding: 12px 14px;',
          '  text-align: left;',
          '  cursor: pointer;',
          '  display: flex;',
          '  justify-content: space-between;',
          '  align-items: center;',
          '  gap: 12px;',
          '}',
          '.recipe-picker button.pick:hover {',
          '  border-color: #ff2b48;',
          '  transform: translateY(-1px);',
          '}',
          '.recipe-picker .qty-chip {',
          '  background: rgba(255,43,72,0.15);',
          '  color: #ff9faf;',
          '  border: 1px solid rgba(255,43,72,0.3);',
          '  border-radius: 999px;',
          '  padding: 4px 10px;',
          '  font-size: 0.85rem;',
          '  white-space: nowrap;',
          '}',
          '.recipe-picker .actions {',
          '  display: flex;',
          '  justify-content: flex-end;',
          '}',
          '.recipe-picker button.cancel {',
          '  border: 1px solid rgba(255, 255, 255, 0.15);',
          '  background: #16161d;',
          '  color: #f4f4f6;',
          '  border-radius: 10px;',
          '  padding: 10px 14px;',
          '  cursor: pointer;',
          '}',
          '.recipe-picker button.cancel:hover {',
          '  border-color: rgba(255,255,255,0.35);',
          '}'
        ].join('\\n');
        document.head.appendChild(style);
      }

      function closeIngredientPicker() {
        if (ingredientPickerEl) {
          ingredientPickerEl.dataset.stayOpen = 'false';
          if (ingredientPickerEl.parentElement) {
            ingredientPickerEl.parentElement.removeChild(ingredientPickerEl);
          }
        }
        ingredientPickerEl = null;
      }

      function openIngredientPicker(product, components) {
        closeIngredientPicker();
        ensureIngredientPickerStyles();
        const overlay = document.createElement('div');
        overlay.className = 'recipe-picker-overlay';
        overlay.dataset.stayOpen = 'true';

        const panel = document.createElement('div');
        panel.className = 'recipe-picker';

        const title = document.createElement('h3');
        title.textContent = 'Select ingredient';
        const subtitle = document.createElement('p');
        subtitle.textContent = 'For ' + (product?.name ?? 'Product') + ' - enter qty for a component';

        const list = document.createElement('div');
        list.className = 'list';

        components.forEach((comp) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pick';
          const name = comp?.ingredient?.name ?? 'Ingredient';
          const qty = Number(comp?.qtyPerUnit) || 0;
          const unit = (comp?.qtyUnit ?? '').toString() || (comp?.ingredient?.consumption_uom ?? comp?.ingredient?.uom ?? 'unit');
          btn.innerHTML = '<span>' + name + '</span><span class="qty-chip">' + qty + ' ' + unit + '</span>';
          btn.addEventListener('click', () => {
            if (ingredientPickerEl) {
              ingredientPickerEl.style.display = 'none';
            }
            promptQuantity(comp.ingredient, comp.variation ?? null, state.mode, null);
          });
          list.appendChild(btn);
        });

        const actions = document.createElement('div');
        actions.className = 'actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'cancel';
        cancel.textContent = 'Close';
        cancel.addEventListener('click', () => closeIngredientPicker());
        actions.appendChild(cancel);

        panel.appendChild(title);
        panel.appendChild(subtitle);
        panel.appendChild(list);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) closeIngredientPicker();
        });
        document.body.appendChild(overlay);
        ingredientPickerEl = overlay;
      }

      function normalizeVariantKeyLocal(value) {
        const raw = value === undefined || value === null ? '' : String(value).trim();
        return raw || 'base';
      }

      function buildEntryForProduct(product, variation) {
        const packageSize = resolvePackageSize(product, variation);
        const stockUom = (variation?.transfer_unit || variation?.uom || product.transfer_unit || product.uom || 'unit').toString();
        const consumptionUom = (variation?.consumption_uom || product.consumption_uom || product.uom || stockUom).toString();
        return {
          productId: product.id,
          productName: product.name ?? 'Product',
          itemKind: product.item_kind ?? 'finished',
          variationId: variation?.id ?? null,
          variationName: variation?.name ?? null,
          uom: stockUom.toUpperCase(),
          stockUom: stockUom.toUpperCase(),
          consumptionUom: consumptionUom.toUpperCase(),
          packageSize,
          unitCost: null
        };
      }

      function closeVariantModal() {
        if (!variantModal) return;
        variantModal.style.display = 'none';
        variantModal.setAttribute('aria-hidden', 'true');
        activeVariantQtyInput = null;
        activeVariantAddButton = null;
        focusActiveScanner();
      }

      function openVariantModal(product, preferredVariation = null, context = state.mode, recipeComponents = null) {
        if (!variantModal || !variantModalBody || !variantModalTitle) {
          promptQuantity(product, preferredVariation, context, recipeComponents);
          return;
        }
        state.pendingContext = context;
        state.pendingEntry = null;
        state.pendingEditIndex = null;
        activeVariantQtyInput = null;
        activeVariantAddButton = null;
        variantModalTitle.textContent = product.name ?? 'Product';
        variantModalBody.innerHTML = '';

        if (Array.isArray(recipeComponents) && recipeComponents.length) {
          recipeComponents.forEach((comp) => {
            const ingredient = comp.ingredient;
            if (!ingredient) return;
            const entry = buildEntryForProduct(ingredient, comp.variation ?? null);
            if (context === 'damage') {
              entry.packageSize = 1;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'variant-row';

            const header = document.createElement('div');
            header.className = 'variant-row-header';
            const name = document.createElement('div');
            name.textContent = ingredient.name ?? 'Ingredient';
            const uom = document.createElement('div');
            uom.className = 'variant-uom';
            uom.textContent = formatUomPair(entry);
            header.appendChild(name);
            header.appendChild(uom);

            const controls = document.createElement('div');
            controls.className = 'variant-qty-controls';
            const decBtn = document.createElement('button');
            decBtn.type = 'button';
            decBtn.className = 'variant-qty-button';
            decBtn.textContent = '-';
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0';
            qtyInput.step = '0.01';
            qtyInput.placeholder = '0';
            const incBtn = document.createElement('button');
            incBtn.type = 'button';
            incBtn.className = 'variant-qty-button';
            incBtn.textContent = '+';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'variant-add-button';
            addBtn.textContent = 'Add';
            const activateRow = () => {
              activeVariantQtyInput = qtyInput;
              activeVariantAddButton = addBtn;
            };

            const setQty = (value) => {
              const numeric = Number(value);
              qtyInput.value = Number.isFinite(numeric) ? numeric.toString() : '0';
            };

            decBtn.addEventListener('click', () => {
              activateRow();
              const current = Number(qtyInput.value || 0);
              setQty(Math.max(0, current - 1));
            });
            incBtn.addEventListener('click', () => {
              activateRow();
              const current = Number(qtyInput.value || 0);
              setQty(current + 1);
            });
            qtyInput.addEventListener('focus', activateRow);
            qtyInput.addEventListener('click', activateRow);

            controls.appendChild(decBtn);
            controls.appendChild(qtyInput);
            controls.appendChild(incBtn);
            addBtn.addEventListener('click', () => {
              const rawQty = Number(qtyInput.value || 0);
              const effectiveQty = computeEffectiveQty(rawQty, entry);
              if (effectiveQty === null) {
                showResult('Enter a valid quantity', true);
                return;
              }
              addCartItem({ ...entry, qty: effectiveQty, scannedQty: rawQty }, context);
              showResult(
                'Queued ' + (entry.productName ?? 'Product') + ' - ' + describeQty(entry, rawQty, effectiveQty),
                false
              );
              qtyInput.value = '';
            });

            if (!activeVariantQtyInput) {
              activateRow();
            }

            wrapper.appendChild(header);
            wrapper.appendChild(controls);
            wrapper.appendChild(addBtn);
            variantModalBody.appendChild(wrapper);
          });
        } else {
          const variations = state.variations.get(product.id) ?? [];
          const isIngredient = (product.item_kind || '').toLowerCase() === 'ingredient';
          const hasVariants = variations.length > 0;
          let rows = isIngredient || !hasVariants
            ? [{ key: 'base', variation: null, label: 'Base' }]
            : variations.map((variation) => ({ key: variation.id, variation, label: variation.name || 'Variant' }));
          if (preferredVariation) {
            rows = [{
              key: preferredVariation.id,
              variation: preferredVariation,
              label: preferredVariation.name || 'Variant'
            }];
          }

          rows.forEach((row) => {
            const entry = buildEntryForProduct(product, row.variation);
            if (context === 'damage') {
              entry.packageSize = 1;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'variant-row';

            const header = document.createElement('div');
            header.className = 'variant-row-header';
            const name = document.createElement('div');
            name.textContent = row.label;
            const uom = document.createElement('div');
            uom.className = 'variant-uom';
            uom.textContent = formatUomPair(entry);
            header.appendChild(name);
            header.appendChild(uom);

            const controls = document.createElement('div');
            controls.className = 'variant-qty-controls';
            const decBtn = document.createElement('button');
            decBtn.type = 'button';
            decBtn.className = 'variant-qty-button';
            decBtn.textContent = '-';
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0';
            qtyInput.step = '0.01';
            qtyInput.placeholder = '0';
            const incBtn = document.createElement('button');
            incBtn.type = 'button';
            incBtn.className = 'variant-qty-button';
            incBtn.textContent = '+';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'variant-add-button';
            addBtn.textContent = 'Add';
            const activateRow = () => {
              activeVariantQtyInput = qtyInput;
              activeVariantAddButton = addBtn;
            };

            const setQty = (value) => {
              const numeric = Number(value);
              qtyInput.value = Number.isFinite(numeric) ? numeric.toString() : '0';
            };

            if (preferredVariation && row.variation?.id === preferredVariation.id) {
              setQty(1);
            }

            decBtn.addEventListener('click', () => {
              activateRow();
              const current = Number(qtyInput.value || 0);
              setQty(Math.max(0, current - 1));
            });
            incBtn.addEventListener('click', () => {
              activateRow();
              const current = Number(qtyInput.value || 0);
              setQty(current + 1);
            });
            qtyInput.addEventListener('focus', activateRow);
            qtyInput.addEventListener('click', activateRow);

            controls.appendChild(decBtn);
            controls.appendChild(qtyInput);
            controls.appendChild(incBtn);
            addBtn.addEventListener('click', () => {
              const rawQty = Number(qtyInput.value || 0);
              const effectiveQty = computeEffectiveQty(rawQty, entry);
              if (effectiveQty === null) {
                showResult('Enter a valid quantity', true);
                return;
              }
              addCartItem({ ...entry, qty: effectiveQty, scannedQty: rawQty }, context);
              showResult(
                'Queued ' + (entry.productName ?? 'Product') + ' - ' + describeQty(entry, rawQty, effectiveQty),
                false
              );
              qtyInput.value = '';
            });

            if (!activeVariantQtyInput) {
              activateRow();
            }

            wrapper.appendChild(header);
            wrapper.appendChild(controls);
            wrapper.appendChild(addBtn);
            variantModalBody.appendChild(wrapper);
          });
        }

        variantModal.style.display = 'flex';
        variantModal.setAttribute('aria-hidden', 'false');
      }

      function submitQtyForm() {
        if (!qtyForm) return;
        if (typeof qtyForm.requestSubmit === 'function') {
          qtyForm.requestSubmit();
        } else {
          qtyForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }

      function submitVariantQty() {
        if (activeVariantAddButton instanceof HTMLButtonElement) {
          activeVariantAddButton.click();
        }
      }

      function appendQtyDigit(digit) {
        if (!qtyInput) return;
        qtyInput.value = (qtyInput.value ?? '') + digit;
        qtyInput.focus();
      }

      function resetQtyInput() {
        if (!qtyInput) return;
        qtyInput.value = '';
        qtyInput.focus();
      }

      function appendVariantQtyDigit(digit) {
        if (!activeVariantQtyInput) return;
        activeVariantQtyInput.value = (activeVariantQtyInput.value ?? '') + digit;
        activeVariantQtyInput.focus();
      }

      function resetVariantQtyInput() {
        if (!activeVariantQtyInput) return;
        activeVariantQtyInput.value = '';
        activeVariantQtyInput.focus();
      }

      if (qtyNumpad) {
        qtyNumpad.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          const digit = target.dataset.key;
          const action = target.dataset.action;
          if (digit !== undefined) {
            appendQtyDigit(digit);
            return;
          }
          if (action === 'clear') {
            resetQtyInput();
            return;
          }
          if (action === 'enter' && qtyInput && qtyInput.value !== '') {
            submitQtyForm();
          }
        });
      }

      if (variantNumpad) {
        variantNumpad.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          const digit = target.dataset.key;
          const action = target.dataset.action;
          if (digit !== undefined) {
            appendVariantQtyDigit(digit);
            return;
          }
          if (action === 'clear') {
            resetVariantQtyInput();
            return;
          }
          if (action === 'enter' && activeVariantQtyInput && activeVariantQtyInput.value !== '') {
            submitVariantQty();
          }
        });
      }

      function collectDescendantIds(warehouses, rootId) {
        if (!rootId) return [];
        const tree = warehouses.reduce((acc, wh) => {
          const parent = wh.parent_warehouse_id ?? '__root__';
          if (!acc[parent]) acc[parent] = [];
          acc[parent].push(wh);
          return acc;
        }, {});
        const visited = new Set();
        const queue = [rootId];
        while (queue.length) {
          const current = queue.shift();
          if (!current || visited.has(current)) continue;
          visited.add(current);
          const children = tree[current] ?? [];
          for (const child of children) {
            queue.push(child.id);
          }
        }
        return Array.from(visited);
      }

      let latestStorageHomes = [];

      async function fetchProductsForWarehouse(warehouseIds) {
        if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
          return [];
        }

        if (state.networkOffline) {
          console.warn('Skipping product fetch: network offline');
          return [];
        }

        const loadStockAndDefaults = async () => {
          const activeDestId = state.destinationSelection;
          const allowedWarehouses = [lockedSourceId, activeDestId].filter(Boolean);
          const [stockResult, destStockResult, defaultItemsResult, outletRouteResult, storageHomesResult] = await Promise.all([
            supabase.from(STOCK_VIEW_NAME).select('warehouse_id,product_id:item_id').in('warehouse_id', warehouseIds),
            activeDestId
              ? supabase.from(STOCK_VIEW_NAME).select('warehouse_id,product_id:item_id').eq('warehouse_id', activeDestId)
              : Promise.resolve({ data: [], error: null }),
            activeDestId
              ? supabase
                  .from('catalog_items')
                  .select('id')
                  .eq('default_warehouse_id', activeDestId)
                  .eq('active', true)
                  .eq('outlet_order_visible', true)
              : Promise.resolve({ data: [], error: null }),
            activeDestId
              ? supabase
                  .from('outlet_item_routes')
                  .select('item_id, variant_key')
                  .eq('warehouse_id', activeDestId)
                  .eq('deduct_enabled', true)
              : Promise.resolve({ data: [], error: null }),
            allowedWarehouses.length
              ? supabase
                  .from('item_storage_homes')
                  .select('item_id, normalized_variant_key, storage_warehouse_id')
                  .in('storage_warehouse_id', allowedWarehouses)
              : Promise.resolve({ data: [], error: null })
          ]);

          if (stockResult.error) throw stockResult.error;
          if (destStockResult.error) throw destStockResult.error;
          if (defaultItemsResult.error) throw defaultItemsResult.error;
          if (outletRouteResult.error) throw outletRouteResult.error;
          if (storageHomesResult.error) throw storageHomesResult.error;

          latestStorageHomes = Array.isArray(storageHomesResult.data) ? storageHomesResult.data : [];

          const sourceIds = new Set();
          (stockResult.data ?? []).forEach((row) => {
            if (row?.product_id) sourceIds.add(row.product_id);
          });
          const destIds = new Set();
          (destStockResult.data ?? []).forEach((row) => {
            if (row?.product_id) destIds.add(row.product_id);
          });

          const productsWithWarehouseVariations = new Set();
          const defaultItemIds = (defaultItemsResult.data ?? []).map((row) => row?.id).filter(Boolean);
          (defaultItemsResult.data ?? []).forEach((row) => {
            if (row?.id) destIds.add(row.id);
          });

          let defaultVariants = [];
          if (defaultItemIds.length) {
            const { data: variantData, error: variantError } = await supabase
              .from('catalog_variants')
              .select('id,item_id,default_warehouse_id,locked_from_warehouse_id,active')
              .in('item_id', defaultItemIds);
            if (variantError) throw variantError;
            defaultVariants = Array.isArray(variantData) ? variantData : [];
          }

          defaultVariants.forEach((variant) => {
            const variantDefault = variant?.default_warehouse_id ?? variant?.locked_from_warehouse_id ?? null;
            const variantActive = variant?.active !== false;
            if (variantDefault === activeDestId && variantActive && variant?.item_id) {
              destIds.add(variant.item_id);
              productsWithWarehouseVariations.add(variant.item_id);
            }
          });

          latestStorageHomes.forEach((home) => {
            if (home?.storage_warehouse_id === activeDestId && home?.item_id) {
              destIds.add(home.item_id);
              if (home.normalized_variant_key && home.normalized_variant_key !== 'base') {
                productsWithWarehouseVariations.add(home.item_id);
              }
            }
            if (home?.storage_warehouse_id === lockedSourceId && home?.item_id) {
              sourceIds.add(home.item_id);
              if (home.normalized_variant_key && home.normalized_variant_key !== 'base') {
                productsWithWarehouseVariations.add(home.item_id);
              }
            }
          });

          (outletRouteResult.data ?? []).forEach((route) => {
            if (route?.item_id) {
              destIds.add(route.item_id);
              productsWithWarehouseVariations.add(route.item_id);
            }
          });

          const productIds = new Set();
          if (destIds.size > 0) {
            sourceIds.forEach((id) => {
              if (destIds.has(id)) productIds.add(id);
            });
          } else {
            sourceIds.forEach((id) => productIds.add(id));
          }

          return { productIds, productsWithWarehouseVariations };
        };

        const loadProducts = async (productIds, productsWithWarehouseVariations) => {
          if (!productIds.size) return [];
          const { data: products, error: prodErr } = await supabase
            .from('catalog_items')
            .select(
              'id,name,has_variations,item_kind,uom:purchase_pack_unit,consumption_uom,sku,supplier_sku,package_contains:units_per_purchase_pack,transfer_unit,transfer_quantity'
            )
            .in('id', Array.from(productIds))
            .eq('active', true)
            .eq('outlet_order_visible', true)
            .order('name');
          if (prodErr) throw prodErr;

          const { data: variantRows, error: variantErr } = await supabase
            .from('catalog_variants')
            .select('id,item_id,default_warehouse_id,locked_from_warehouse_id,active')
            .in('item_id', Array.from(productIds))
            .eq('outlet_order_visible', true);
          if (variantErr) throw variantErr;

          const variantsByItem = new Map();
          (variantRows ?? []).forEach((variant) => {
            if (!variant?.item_id) return;
            const list = variantsByItem.get(variant.item_id) ?? [];
            list.push(variant);
            variantsByItem.set(variant.item_id, list);
          });

          return (products ?? []).map((product) => {
            if (!product?.id) return product;
            const variants = variantsByItem.get(product.id) ?? [];
            const hasWarehouseVariant = variants.some((variant) => {
              const variantDefault = variant?.default_warehouse_id ?? variant?.locked_from_warehouse_id ?? null;
              if (variantDefault !== lockedSourceId) return false;
              return variant?.active !== false;
            });

            const hasStorageHomeVariant = latestStorageHomes.some(
              (home) =>
                home.item_id === product.id &&
                home.storage_warehouse_id === lockedSourceId &&
                home.normalized_variant_key &&
                home.normalized_variant_key !== 'base'
            );

            if (productsWithWarehouseVariations.has(product.id) || hasWarehouseVariant || hasStorageHomeVariant) {
              return { ...product, has_variations: true };
            }
            return product;
          });
        };

        try {
          const { productIds, productsWithWarehouseVariations } = await loadStockAndDefaults();
          return await loadProducts(productIds, productsWithWarehouseVariations);
        } catch (error) {
          markOfflineIfNetworkError(error);
          console.warn('Product fetch failed, attempting minimal fallback', error);
          // Provide a minimal stub so the UI can continue showing destination labels even if Supabase is unreachable.
          return [];
        }
      }

      function indexVariationKey(key, variation) {
        if (!key || typeof key !== 'string') return;
        state.variationIndex.set(key, variation);
        const lower = key.toLowerCase();
        state.variationIndex.set(lower, variation);
        const compact = normalizeKey(key);
        if (compact) {
          state.variationIndex.set(compact, variation);
        }
      }

      async function preloadVariations(productIds) {
        state.variations = new Map();
        state.variationIndex = new Map();
        if (!Array.isArray(productIds) || productIds.length === 0) {
          return;
        }
        const { data, error } = await supabase
          .from('catalog_variants')
          .select(
            'id,item_id,name,purchase_pack_unit,transfer_unit,consumption_uom,sku,supplier_sku,units_per_purchase_pack,transfer_quantity,default_warehouse_id,locked_from_warehouse_id,active'
          )
          .in('item_id', productIds)
          .eq('outlet_order_visible', true);
        if (error) throw error;

        const activeDestId = state.destinationSelection;
        const allowedVariantWarehouses = new Set([lockedSourceId, activeDestId].filter(Boolean));

        const storageHomeMap = new Map();
        latestStorageHomes.forEach((home) => {
          if (home?.item_id && home?.normalized_variant_key && home?.storage_warehouse_id) {
            storageHomeMap.set(home.item_id + '::' + home.normalized_variant_key, home.storage_warehouse_id);
          }
        });

        (data ?? []).forEach((variant) => {
          if (!variant?.item_id || !variant?.id) return;
          if (variant?.active === false) return;
          const normalizedKey = normalizeVariantKeyLocal(variant?.id ?? '');
          const variantWarehouse =
            storageHomeMap.get(variant.item_id + '::' + normalizedKey) ??
            variant?.default_warehouse_id ??
            variant?.locked_from_warehouse_id ??
            null;
          if (variantWarehouse && !allowedVariantWarehouses.has(variantWarehouse)) return;

          const key = normalizedKey || 'base';
          const variation = {
            id: key,
            product_id: variant.item_id,
            name: (variant?.name ?? '').toString() || 'Variant',
            uom: (variant?.purchase_pack_unit ?? variant?.transfer_unit ?? 'each').toString(),
            consumption_uom: (variant?.consumption_uom ?? variant?.purchase_pack_unit ?? 'each').toString(),
            sku: typeof variant?.sku === 'string' ? variant.sku : null,
            supplier_sku: typeof variant?.supplier_sku === 'string' ? variant.supplier_sku : null,
            package_contains: typeof variant?.units_per_purchase_pack === 'number' ? variant.units_per_purchase_pack : null,
            transfer_unit: (variant?.transfer_unit ?? variant?.purchase_pack_unit ?? 'each').toString(),
            transfer_quantity:
              typeof variant?.transfer_quantity === 'number'
                ? variant.transfer_quantity
                : Number(variant?.transfer_quantity) || 1
          };

          const list = state.variations.get(variant.item_id) ?? [];
          list.push(variation);
          state.variations.set(variant.item_id, list);

          if (key) {
            indexVariationKey(key, variation);
          }
          if (typeof variation.sku === 'string' && variation.sku.trim()) {
            indexVariationKey(variation.sku, variation);
          }
          if (typeof variation.supplier_sku === 'string' && variation.supplier_sku.trim()) {
            indexVariationKey(variation.supplier_sku, variation);
          }
        });
      }

      async function safePreloadVariations(productIds) {
        if (state.networkOffline) {
          console.warn('Skipping variation preload: network offline');
          state.variations = new Map();
          state.variationIndex = new Map();
          return;
        }
        try {
          await preloadVariations(productIds);
        } catch (error) {
          markOfflineIfNetworkError(error);
          console.warn('Variation preload failed; continuing without variation index', error);
          state.variations = new Map();
          state.variationIndex = new Map();
        }
      }

      function focusActiveScanner() {
        if (!scannerWedge) return;
        if (qtyModal?.style.display === 'flex') return;
        if (variantModal?.style.display === 'flex') return;
        if (document.body.dataset.view === 'purchase') return;
        scannerWedge.focus();
      }

      function shouldHoldScannerFocus(element) {
        const active = element instanceof HTMLElement ? element : document.activeElement;
        if (!active || active === document.body) return false;
        if (active === operatorPasswordInput) return true;
        if (active === purchaseReference) return true;
        if (active === damageNote) return true;
        if (active === itemSearchInput) return true;
        if (active === damageItemSearchInput) return true;
        if (active === purchaseItemSearchInput) return true;
        if (destinationSelect && (active === destinationSelect || active.closest('.destination-pill-select'))) {
          return true;
        }
        if (active instanceof HTMLElement) {
          if (active.closest('#operator-passcode-modal')) return true;
          if (active.closest('.operator-auth-card')) return true;
        }
        return false;
      }

      function queueScanFlush() {
        if (!scannerWedge) return;
        window.clearTimeout(scanFlushTimeoutId);
        if (!scanBuffer) return;
        scanFlushTimeoutId = window.setTimeout(() => {
          const payload = scanBuffer.trim();
          scanBuffer = '';
          scannerWedge.value = '';
          if (!payload) return;
          handleProductScan(payload).catch((error) => console.warn('scan handling failed', error));
        }, SCAN_FLUSH_DELAY_MS);
      }

      function commitScanBuffer() {
        if (!scannerWedge) return;
        window.clearTimeout(scanFlushTimeoutId);
        const payload = (scanBuffer || scannerWedge.value || '').trim();
        scanBuffer = '';
        scannerWedge.value = '';
        if (!payload) return;
        handleProductScan(payload).catch((error) => console.warn('scan handling failed', error));
      }

      function formatQtyLabel(qty, uom) {
        const numeric = Number(qty ?? 0);
        const formattedQty = Number.isFinite(numeric) ? numeric : 0;
        const unit = (uom || 'unit').toUpperCase();
        return formattedQty + ' ' + unit;
      }

      function formatUomPair(entry) {
        const stock = (entry?.stockUom || entry?.uom || 'UNIT').toString().toUpperCase();
        const cons = (entry?.consumptionUom || entry?.uom || 'UNIT').toString().toUpperCase();
        if (stock === cons) return stock;
        return 'STOCK: ' + stock + ' / CONS: ' + cons;
      }

      function formatAmount(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function computeLineTotal(entry) {
        const unitCost = Number(entry?.unitCost);
        const qtyValue = Number(entry?.qty);
        if (!Number.isFinite(unitCost) || !Number.isFinite(qtyValue)) {
          return null;
        }
        return unitCost * qtyValue;
      }

      function groupCartItemsForReceipt(entries) {
        const map = new Map();
        entries.forEach((entry, index) => {
          const key = entry.productId || 'product-' + index;
          if (!map.has(key)) {
            map.set(key, {
              productName: entry.productName ?? 'Product',
              baseItems: [],
              variations: []
            });
          }
          const bucket = map.get(key);
          if (entry.variationId) {
            bucket.variations.push(entry);
          } else {
            bucket.baseItems.push(entry);
          }
        });
        return Array.from(map.values());
      }

      function resolvePackageSize(product, variation) {
        const variationPack = Number(variation?.package_contains);
        if (Number.isFinite(variationPack) && variationPack > 0) {
          return variationPack;
        }
        const productPack = Number(product?.package_contains);
        if (Number.isFinite(productPack) && productPack > 0) {
          return productPack;
        }
        return 1;
      }

      function computeEffectiveQty(rawQty, entry) {
        const qtyNumber = Number(rawQty);
        if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
          return null;
        }
        const isIngredient = isIngredientLike(entry);
        const multiplier = MULTIPLY_QTY_BY_PACKAGE && isIngredient ? entry.packageSize ?? 1 : 1;
        return qtyNumber * multiplier;
      }

      function describeQty(entry, baseQty, effectiveQty) {
        const unitLabel = entry.uom ?? 'UNIT';
        const isIngredient = isIngredientLike(entry);
        if (MULTIPLY_QTY_BY_PACKAGE && isIngredient && entry.packageSize > 1) {
          return baseQty + ' pack(s) -> ' + effectiveQty + ' ' + unitLabel;
        }
        return effectiveQty + ' ' + unitLabel;
      }

      function mapCartSnapshotToLineItems(cartSnapshot) {
        return cartSnapshot.map((item, index) => ({
          productName: item.productName ?? 'Item ' + (index + 1),
          variationName: item.variationName ?? 'Base',
          qty: item.qty,
          scannedQty: item.scannedQty ?? item.qty,
          unit: item.uom ?? 'unit',
          unitCost: item.unitCost ?? null
        }));
      }

      function buildItemsBlockFromLines(lineItems) {
        return lineItems
          .map((item, index) => {
            const variationLabel = item.variationName ? ' (' + item.variationName + ')' : '';
            const qtyLabel = item.qty ?? 0;
            const unitLabel = item.unit ?? 'unit';
            const costLabel = formatAmount(item.unitCost);
            const base = '- ' + (item.productName ?? 'Item ' + (index + 1)) + variationLabel + ' - ' + qtyLabel + ' ' + unitLabel;
            return costLabel ? base + ' @ ' + costLabel : base;
          })
          .join('\\n');
      }

      function updateQtyHint(entry) {
        if (!qtyHint) return;
        if (!entry || !(MULTIPLY_QTY_BY_PACKAGE && entry.packageSize > 1)) {
          qtyHint.style.display = 'none';
          qtyHint.textContent = '';
          return;
        }
        qtyHint.textContent = 'Each = ' + entry.packageSize + ' ' + (entry.uom ?? 'UNIT');
        qtyHint.style.display = 'block';
      }

      function getCart(context = state.mode) {
        if (context === 'purchase') return state.purchaseCart;
        if (context === 'damage') return state.damageCart;
        return state.transferCart;
      }

      function setCart(context, next) {
        if (context === 'purchase') {
          state.purchaseCart = next;
        } else if (context === 'damage') {
          state.damageCart = next;
        } else {
          state.transferCart = next;
        }
      }

      function defaultPurchaseFormState() {
        return {
          supplierId: '',
          referenceCode: ''
        };
      }

      function resetPurchaseForm() {
        state.purchaseForm = defaultPurchaseFormState();
        if (purchaseSupplier) {
          purchaseSupplier.value = '';
          purchaseSupplier.disabled = state.suppliers.length === 0;
        }
        updateSupplierPickerLabel();
        if (purchaseReference) {
          purchaseReference.value = '';
        }
        syncReferenceValue('');
        updatePurchaseSummary();
      }

      function setMode(next) {
        const target = ['transfer', 'damage'].includes(next) ? next : 'transfer';
        state.mode = target;
        document.body.dataset.mode = target;
        transferPanelEl?.classList.toggle('active-mode', target === 'transfer');
        damagePanel?.classList.toggle('active-mode', target === 'damage');
      }

      function formatOperatorLabel(context) {
        return OPERATOR_CONTEXT_LABELS[context] ?? 'Console';
      }

      function renderOperatorOptions() {
        Object.entries(operatorSelects).forEach(([context, select]) => {
          if (!select) return;
          const existingValue = select.value;
          select.innerHTML = '';
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = state.operators.length ? 'Select operator' : 'No operators available';
          select.appendChild(placeholder);
          state.operators.forEach((operator) => {
            if (!operator?.id) return;
            const option = document.createElement('option');
            option.value = operator.id;
            option.textContent = operator.displayName;
            select.appendChild(option);
          });
          const session = getValidOperatorSession(context, { silent: true, skipStatusUpdate: true });
          const sessionValue = session?.operatorId ?? '';
          select.value = sessionValue || existingValue;
          select.disabled = !state.operators.length;
          updateOperatorPickerLabel(context);
        });
        updateOperatorStatus('transfer');
        updateOperatorStatus('purchase');
        updateOperatorStatus('damage');
      }

      function getOperatorLabelById(id) {
        const op = state.operators.find((operator) => operator?.id === id);
        return op?.displayName ?? null;
      }

      function updateOperatorPickerLabel(context) {
        const picker = operatorPickers[context];
        const select = operatorSelects[context];
        if (!picker || !select) return;
        const selectedId = select.value || '';
        const label = selectedId ? getOperatorLabelById(selectedId) : null;
        picker.textContent = label || 'Select operator';
        picker.disabled = !state.operators.length;
      }

      function renderOperatorCards(context) {
        if (!operatorSelectModalOptions) return;
        operatorSelectModalOptions.innerHTML = '';
        if (!state.operators.length) {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.className = 'select-card';
          empty.textContent = 'No operators available';
          empty.disabled = true;
          operatorSelectModalOptions.appendChild(empty);
          return;
        }
        state.operators.forEach((operator) => {
          if (!operator?.id) return;
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'select-card';
          card.textContent = operator.displayName ?? 'Operator';
          card.addEventListener('click', () => {
            const select = operatorSelects[context];
            if (select) {
              select.value = operator.id;
            }
            handleOperatorSelection(context, operator.id);
            closeSelectModal(operatorSelectModal);
          });
          operatorSelectModalOptions.appendChild(card);
        });
      }

      function renderDestinationOptions() {
        if (!destinationSelect) return;
        const existingValue = destinationSelect.value;
        destinationSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = state.destinationOptions.length ? 'Choose destination' : 'No destinations';
        destinationSelect.appendChild(placeholder);
        state.destinationOptions.forEach((option) => {
          if (!option?.id) return;
          const opt = document.createElement('option');
          opt.value = option.id;
          opt.textContent = option.label ?? 'Destination';
          destinationSelect.appendChild(opt);
        });
        const savedValue = state.destinationSelection ?? existingValue;
        destinationSelect.value = savedValue || '';
        destinationSelect.disabled = !state.destinationOptions.length;
        if (destinationPicker) {
          destinationPicker.textContent = getSelectedDestination()?.label ?? 'Choose destination';
          destinationPicker.disabled = !state.destinationOptions.length;
        }
        renderDestinationCards();
        syncDestinationPillLabel();
      }

      function openSelectModal(modal) {
        if (!modal) return;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
      }

      function closeSelectModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      }

      function renderDestinationCards() {
        if (!destinationModalOptions) return;
        destinationModalOptions.innerHTML = '';
        if (!state.destinationOptions.length) {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.className = 'select-card';
          empty.textContent = 'No destinations';
          empty.disabled = true;
          destinationModalOptions.appendChild(empty);
          return;
        }
        state.destinationOptions.forEach((option) => {
          if (!option?.id) return;
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'select-card';
          card.textContent = option.label ?? 'Destination';
          card.addEventListener('click', () => {
            if (destinationSelect) {
              destinationSelect.value = option.id;
            }
            handleDestinationSelection(option.id);
            closeSelectModal(destinationModal);
          });
          destinationModalOptions.appendChild(card);
        });
      }

      function showOperatorPrompt(context) {
        activeOperatorContext = context;
        renderOperatorCards(context);
        openSelectModal(operatorSelectModal);
      }

      function getValidOperatorSession(context, options = {}) {
        const { silent = false, skipStatusUpdate = false } = options;
        const session = state.operatorSessions[context];
        if (!session) return null;
        if (session.expiresAt <= Date.now()) {
          state.operatorSessions[context] = null;
          if (!silent) {
            showResult(formatOperatorLabel(context) + ' session expired. Please sign in again.', true);
          }
          if (!skipStatusUpdate) {
            updateOperatorStatus(context);
          }
          return null;
        }
        return session;
      }

      function updateOperatorStatus(context) {
        const select = operatorSelects[context];
        const status = operatorStatusLabels[context];
        const session = getValidOperatorSession(context, { silent: true, skipStatusUpdate: true });
        const unlocked = Boolean(session);
        if (status) {
          status.textContent = unlocked ? 'Unlocked: ' + session.displayName : 'Locked';
          status.dataset.state = unlocked ? 'unlocked' : 'locked';
        }
        if (select && select.value !== (unlocked ? session.operatorId : '')) {
          select.value = unlocked ? session.operatorId : '';
        }
        updateOperatorPickerLabel(context);
        enforceOperatorLocks();
      }

      function enforceOperatorLocks() {
        const destinationSelected = Boolean(getSelectedDestination());
        const transferUnlocked = Boolean(getValidOperatorSession('transfer', { silent: true, skipStatusUpdate: true }));
        if (transferSubmit) {
          transferSubmit.disabled = state.loading || !transferUnlocked || !destinationSelected;
        }
        const purchaseUnlocked = Boolean(getValidOperatorSession('purchase', { silent: true, skipStatusUpdate: true }));
        if (purchaseSubmit) {
          purchaseSubmit.disabled = state.purchaseSubmitting || !purchaseUnlocked || !destinationSelected;
        }
        const damageUnlocked = Boolean(getValidOperatorSession('damage', { silent: true, skipStatusUpdate: true }));
        if (damageSubmit) {
          damageSubmit.disabled = state.damageSubmitting || !damageUnlocked || !destinationSelected;
        }
      }

      function scheduleOperatorExpiryTimeout(context) {
        if (!state.operatorSessionTimers?.hasOwnProperty(context)) return;
        const timers = state.operatorSessionTimers;
        window.clearTimeout(timers[context]);
        timers[context] = null;
        const session = state.operatorSessions[context];
        if (!session) return;
        const delay = Math.max(session.expiresAt - Date.now(), 0);
        timers[context] = window.setTimeout(() => {
          const activeSession = state.operatorSessions[context];
          if (!activeSession || activeSession.expiresAt !== session.expiresAt) {
            return;
          }
          timers[context] = null;
          getValidOperatorSession(context);
        }, delay);
      }

      function clearOperatorSession(context, notify = false) {
        const hadSession = Boolean(state.operatorSessions[context]);
        state.operatorSessions[context] = null;
        if (state.operatorSessionTimers?.hasOwnProperty(context)) {
          window.clearTimeout(state.operatorSessionTimers[context]);
          state.operatorSessionTimers[context] = null;
        }
        if (operatorSelects[context]) {
          operatorSelects[context].value = '';
        }
        updateOperatorStatus(context);
        if (notify && hadSession) {
          showResult(formatOperatorLabel(context) + ' locked.', false);
        }
        syncDestinationPillLabel();
      }

      async function handleLogout() {
        clearOperatorSession('transfer', false);
        clearOperatorSession('purchase', false);
        clearOperatorSession('damage', false);
        state.session = null;
        state.operatorProfile = null;
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('Logout failed', error);
        }
        showResult('Logged out.', false);
        applyViewState('transfer');
        window.setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 50);
      }

      function setOperatorSession(context, operator) {
        state.operatorSessions[context] = {
          operatorId: operator.id,
          displayName: operator.displayName,
          expiresAt: Date.now() + OPERATOR_SESSION_TTL_MS
        };
        scheduleOperatorExpiryTimeout(context);
        updateOperatorStatus(context);
      }

      function ensureOperatorUnlocked(context, shouldPrompt = true) {
        if (getValidOperatorSession(context)) {
          return true;
        }
        if (shouldPrompt) {
          showResult(formatOperatorLabel(context) + ' locked. Select an operator to continue.', true);
          showOperatorPrompt(context);
        }
        return false;
      }

      function getDestinationOptionById(id) {
        if (!id) return null;
        const optionFromState = state.destinationOptions.find((option) => option.id === id);
        if (optionFromState) return optionFromState;
        const warehouseRecord = state.warehouses.find((w) => w.id === id);
        if (warehouseRecord) {
          return { id: warehouseRecord.id, label: warehouseRecord.name ?? 'Destination warehouse' };
        }
        return null;
      }

      function getSelectedDestination() {
        const id = state.destinationSelection;
        if (!id) return null;
        const option = getDestinationOptionById(id);
        if (option) return option;
        return { id, label: 'Destination warehouse' };
      }

      function showDestinationPrompt() {
        openSelectModal(destinationModal);
      }

      function ensureDestinationSelected(context, shouldPrompt = true) {
        if (getSelectedDestination()) {
          return true;
        }
        if (shouldPrompt) {
          showResult('Select a destination warehouse for ' + formatOperatorLabel(context) + '.', true);
          showDestinationPrompt();
        }
        return false;
      }

      function syncDestinationPillLabel() {
        if (!destLabel) return;
        const selection = getSelectedDestination();
        if (selection) {
          destLabel.textContent = selection.label;
        } else {
          destLabel.textContent = 'Choose destination';
        }
      }

      function handleDestinationSelection(warehouseId) {
        const trimmed = warehouseId || '';
        if (!trimmed) {
          state.destinationSelection = null;
          state.lockedDest = null;
          if (destinationSelect && destinationSelect.value !== '') {
            destinationSelect.value = '';
          }
          if (destinationPicker) {
            destinationPicker.textContent = 'Choose destination';
          }
          syncDestinationPillLabel();
          enforceOperatorLocks();
          return;
        }
        const option = getDestinationOptionById(trimmed);
        if (!option) {
          showResult('Destination unavailable. Refresh directory.', true);
          renderDestinationOptions();
          return;
        }
        state.destinationSelection = trimmed;
        state.lockedDest = state.warehouses.find((w) => w.id === trimmed) ?? null;
        if (destinationSelect && destinationSelect.value !== trimmed) {
          destinationSelect.value = trimmed;
        }
        if (destinationPicker) {
          destinationPicker.textContent = option.label ?? 'Choose destination';
        }
        syncDestinationPillLabel();
        enforceOperatorLocks();
      }

      function openOperatorModal(context, operator) {
        if (!operatorPasscodeModal || !operatorModalForm) return;
        operatorModalTitle.textContent = 'Unlock ' + formatOperatorLabel(context);
        operatorModalContext.textContent = 'Scan password for ' + operator.displayName + '.';
        operatorPasswordInput.value = '';
        operatorModalError.textContent = '';
        window.clearTimeout(operatorPasswordAutoSubmitTimeoutId);
        state.operatorUnlocking = false;
        state.pendingOperatorSelection = { context, operator };
        operatorPasscodeModal.classList.add('active');
        operatorPasscodeModal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => operatorPasswordInput?.focus(), 10);
      }

      function closeOperatorModal() {
        if (!operatorPasscodeModal) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && operatorPasscodeModal.contains(active)) {
          active.blur();
        }
        operatorPasscodeModal.classList.remove('active');
        operatorPasscodeModal.setAttribute('aria-hidden', 'true');
        operatorPasswordInput.value = '';
        operatorModalError.textContent = '';
        window.clearTimeout(operatorPasswordAutoSubmitTimeoutId);
        state.operatorUnlocking = false;
        state.pendingOperatorSelection = null;
        focusActiveScanner();
      }

      function cancelPendingOperatorSelection() {
        const pending = state.pendingOperatorSelection;
        closeOperatorModal();
        if (!pending) return;
        const session = getValidOperatorSession(pending.context, { silent: true, skipStatusUpdate: true });
        const select = operatorSelects[pending.context];
        if (select) {
          select.value = session?.operatorId ?? '';
        }
      }

      async function submitOperatorUnlock(options = {}) {
        const { silentMissing = false } = options;
        if (!state.pendingOperatorSelection || state.operatorUnlocking) return;
        const pending = state.pendingOperatorSelection;
        const password = operatorPasswordInput?.value?.trim();
        if (!password) {
          if (!silentMissing) {
            operatorModalError.textContent = 'Password required.';
            operatorPasswordInput?.focus();
          }
          return;
        }
        state.operatorUnlocking = true;
        operatorModalError.textContent = '';
        try {
          const isValid = await verifyOperatorPassword(pending.operator, password);
          if (!isValid) {
            operatorModalError.textContent = 'Password incorrect.';
            operatorPasswordInput?.select();
            state.operatorUnlocking = false;
            return;
          }
          setOperatorSession(pending.context, pending.operator);
          closeOperatorModal();
          showResult(formatOperatorLabel(pending.context) + ' unlocked by ' + pending.operator.displayName + '.', false);
        } catch (error) {
          operatorModalError.textContent = error.message ?? 'Unable to verify password.';
        } finally {
          state.operatorUnlocking = false;
        }
      }

      // Auto-submit disabled to avoid noisy password errors; unlock only on button/Enter.
      function queueOperatorAutoUnlock() {
        window.clearTimeout(operatorPasswordAutoSubmitTimeoutId);
        return;
      }

      function handleOperatorSelection(context, operatorId) {
        if (!operatorId) {
          clearOperatorSession(context, false);
          return;
        }
        const operator = state.operators.find((entry) => entry.id === operatorId);
        if (!operator) {
          showResult('Operator unavailable. Refresh directory.', true);
          renderOperatorOptions();
          return;
        }
        openOperatorModal(context, operator);
      }

      async function verifyOperatorPassword(operator, password) {
        if (!operator?.email) {
          throw new Error('Operator email missing. Ask an administrator to update the directory.');
        }
        const { data, error } = await passwordVerifier.auth.signInWithPassword({
          email: operator.email,
          password
        });
        if (error) {
          throw new Error(error.message ?? 'Verification failed');
        }
        await passwordVerifier.auth.signOut().catch(() => undefined);
        if (data?.session?.user?.id !== operator.authUserId) {
          throw new Error('Operator profile mismatch. Contact an administrator.');
        }
        return true;
      }


      function renderSupplierOptions() {
        if (!purchaseSupplier) return;
        purchaseSupplier.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = state.suppliers.length ? 'Select supplier' : 'No active suppliers';
        purchaseSupplier.appendChild(placeholder);
        if (!state.suppliers.length) {
          purchaseSupplier.disabled = true;
          state.purchaseForm.supplierId = '';
          purchaseSupplier.value = '';
          updateSupplierPickerLabel();
          return;
        }
        purchaseSupplier.disabled = false;
        state.suppliers.forEach((supplier) => {
          if (!supplier?.id) return;
          const option = document.createElement('option');
          option.value = supplier.id;
          option.textContent = supplier.name ?? supplier.supplier_name ?? supplier.display_name ?? 'Supplier';
          purchaseSupplier.appendChild(option);
        });
        const hasExisting = state.suppliers.some((supplier) => supplier?.id === state.purchaseForm.supplierId);
        purchaseSupplier.value = hasExisting ? state.purchaseForm.supplierId : '';
        if (!hasExisting) {
          state.purchaseForm.supplierId = '';
        }
        updateSupplierPickerLabel();
      }

      function getSupplierLabelById(id) {
        const supplier = state.suppliers.find((entry) => entry?.id === id);
        return supplier?.name ?? supplier?.supplier_name ?? supplier?.display_name ?? null;
      }

      function updateSupplierPickerLabel() {
        if (!purchaseSupplierPicker) return;
        const selectedId = purchaseSupplier?.value ?? '';
        const label = selectedId ? getSupplierLabelById(selectedId) : null;
        purchaseSupplierPicker.textContent = label || (state.suppliers.length ? 'Select supplier' : 'No suppliers');
        purchaseSupplierPicker.disabled = !state.suppliers.length;
      }

      function renderSupplierCards() {
        if (!supplierModalOptions) return;
        supplierModalOptions.innerHTML = '';
        if (!state.suppliers.length) {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.className = 'select-card';
          empty.textContent = 'No suppliers available';
          empty.disabled = true;
          supplierModalOptions.appendChild(empty);
          return;
        }
        state.suppliers.forEach((supplier) => {
          if (!supplier?.id) return;
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'select-card';
          card.textContent = supplier.name ?? supplier.supplier_name ?? supplier.display_name ?? 'Supplier';
          card.addEventListener('click', () => {
            if (purchaseSupplier) {
              purchaseSupplier.value = supplier.id;
            }
            state.purchaseForm.supplierId = supplier.id;
            updateSupplierPickerLabel();
            closeSelectModal(supplierModal);
          });
          supplierModalOptions.appendChild(card);
        });
      }

      function updatePurchaseSummary() {
        if (!purchaseSummaryList || !purchaseSummaryEmpty) return;
        purchaseSummaryList.innerHTML = '';
        const cart = getCart('purchase');
        if (!cart.length) {
          purchaseSummaryEmpty.style.display = 'block';
          return;
        }
        purchaseSummaryEmpty.style.display = 'none';
        cart.forEach((item) => {
          const line = document.createElement('li');
          const variationLabel = item.variationName ? ' (' + item.variationName + ')' : '';
          const qtyLabel = formatQtyLabel(item.qty, item.uom);
          const costLabel = formatAmount(item.unitCost);
          const baseText = (item.productName ?? 'Product') + variationLabel + ' - ' + qtyLabel;
          line.textContent = costLabel ? baseText + ' @ ' + costLabel : baseText;
          purchaseSummaryList.appendChild(line);
        });
      }

      function showReferenceNumpad() {
        showReferenceNumpadDigits();
      }

      function showReferenceNumpadDigits() {
        if (!referenceNumpadDigits) return;
        window.clearTimeout(referenceNumpadHideTimeoutId);
        referenceNumpadDigits.style.display = 'grid';
        referenceNumpadDigits.classList.add('active');
        referenceNumpadDigits.setAttribute('aria-hidden', 'false');
      }

      function hideReferenceNumpad() {
        if (!referenceNumpadDigits) return;
        referenceNumpadDigits.style.display = 'none';
        referenceNumpadDigits.classList.remove('active');
        referenceNumpadDigits.setAttribute('aria-hidden', 'true');
      }

      function forceCloseReferenceNumpad(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        hideReferenceNumpad();
        purchaseReference?.blur();
        focusActiveScanner();
      }

      function scheduleReferenceNumpadHide() {
        window.clearTimeout(referenceNumpadHideTimeoutId);
        referenceNumpadHideTimeoutId = window.setTimeout(() => {
          const active = document.activeElement;
          if (referenceNumpadDigits?.contains(active)) return;
          hideReferenceNumpad();
        }, 120);
      }

      function syncReferenceValue(value) {
        const upper = (value ?? '').toUpperCase();
        state.purchaseForm.referenceCode = upper;
        if (purchaseReference && purchaseReference.value !== upper) {
          const start = purchaseReference.selectionStart;
          const end = purchaseReference.selectionEnd;
          purchaseReference.value = upper;
          if (typeof start === 'number' && typeof end === 'number') {
            purchaseReference.setSelectionRange(start, end);
          }
        }
      }

      function insertReferenceText(text) {
        if (!purchaseReference || !text) return;
        const input = purchaseReference;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const current = input.value ?? '';
        const next = (current.slice(0, start) + text + current.slice(end)).toUpperCase();
        input.value = next;
        const caret = start + text.length;
        input.setSelectionRange(caret, caret);
        syncReferenceValue(next);
        input.focus();
      }

      function deleteReferenceChar() {
        if (!purchaseReference) return;
        const input = purchaseReference;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        if (start === 0 && end === 0) return;
        if (start !== end) {
          const current = input.value ?? '';
          const next = (current.slice(0, start) + current.slice(end)).toUpperCase();
          input.value = next;
          input.setSelectionRange(start, start);
          syncReferenceValue(next);
          input.focus();
          return;
        }
        const current = input.value ?? '';
        const newStart = Math.max(0, start - 1);
        const next = (current.slice(0, newStart) + current.slice(end)).toUpperCase();
        input.value = next;
        input.setSelectionRange(newStart, newStart);
        syncReferenceValue(next);
        input.focus();
      }

      // Damage note virtual keyboard (kept ASCII-clean)
      function showDamageNotesKeyboard() {
        if (!damageNotesKeyboard || damageKeyboardSuppressed) return;
        damageNotesKeyboard.style.display = 'grid';
        damageNotesKeyboard.classList.add('active');
        damageNotesKeyboard.setAttribute('aria-hidden', 'false');
      }

      function hideDamageNotesKeyboard() {
        if (!damageNotesKeyboard) return;
        damageNotesKeyboard.style.display = 'none';
        damageNotesKeyboard.classList.remove('active');
        damageNotesKeyboard.setAttribute('aria-hidden', 'true');
      }

      function insertDamageNoteText(text) {
        if (!damageNote || !text) return;
        const start = damageNote.selectionStart ?? damageNote.value.length;
        const end = damageNote.selectionEnd ?? damageNote.value.length;
        const current = damageNote.value ?? '';
        const next = current.slice(0, start) + text + current.slice(end);
        damageNote.value = next;
        const caret = start + text.length;
        damageNote.setSelectionRange(caret, caret);
        state.damageNote = next;
        damageNote.focus();
      }

      function deleteDamageNoteChar() {
        if (!damageNote) return;
        const start = damageNote.selectionStart ?? damageNote.value.length;
        const end = damageNote.selectionEnd ?? damageNote.value.length;
        if (start === 0 && end === 0) return;
        const current = damageNote.value ?? '';
        const hasSelection = start !== end;
        const next = hasSelection
          ? current.slice(0, start) + current.slice(end)
          : current.slice(0, Math.max(0, start - 1)) + current.slice(end);
        const caret = hasSelection ? start : Math.max(0, start - 1);
        damageNote.value = next;
        damageNote.setSelectionRange(caret, caret);
        state.damageNote = next;
        damageNote.focus();
      }

      function handleDamageNotesAction(action) {
        if (!action) return;
        if (action === 'space') {
          insertDamageNoteText(' ');
          return;
        }
        if (action === 'enter') {
          insertDamageNoteText(String.fromCharCode(10));
          return;
        }
        if (action === 'delete') {
          deleteDamageNoteChar();
          return;
        }
        if (action === 'clear') {
          if (damageNote) {
            damageNote.value = '';
            damageNote.setSelectionRange(0, 0);
            state.damageNote = '';
            damageNote.focus();
          }
          return;
        }
        if (action === 'close') {
          damageKeyboardSuppressed = true;
          hideDamageNotesKeyboard();
          damageNote?.blur();
          focusActiveScanner();
          return;
        }
      }

      function enterPurchaseMode() {}

      function exitPurchaseMode() {}

      function enterDamageMode() {
        setMode('damage');
        applyViewState('damage');
        renderCart('damage');
        if (damageNote) {
          damageNote.value = state.damageNote ?? '';
        }
        focusActiveScanner();
      }

      function exitDamageMode() {
        applyViewState('transfer');
        setMode('transfer');
        hideDamageNotesKeyboard();
        focusActiveScanner();
      }

      function promptQuantity(product, variation, context = state.mode, recipeComponents = null) {
        if (!qtyModal || !qtyInput) return;
        const entry = buildEntryForProduct(product, variation);
        if (context === 'damage' && !recipeComponents) {
          entry.packageSize = 1;
        }
        state.pendingEntry = recipeComponents ? { ...entry, recipeComponents } : entry;
        state.pendingEditIndex = null;
        state.pendingContext = context;
        if (qtySubmitButton) {
          qtySubmitButton.textContent = 'Add Item';
        }
        if (recipeComponents && recipeComponents.length) {
          qtyTitle.textContent = 'Ingredients for ' + (product.name ?? 'Product');
          qtyUom.textContent = 'FINISHED UNITS';
          qtyInput.step = '1';
        } else {
          qtyTitle.textContent = variation?.name
            ? (product.name ?? 'Product') + ' - ' + variation.name
            : product.name ?? 'Product';
          qtyUom.textContent = formatUomPair(entry);
          qtyInput.step = '0.01';
        }

        updateQtyHint(entry);
        qtyInput.value = '';
        qtyModal.style.display = 'flex';
        setTimeout(() => qtyInput.focus(), 10);
      }

      function closeQtyPrompt() {
        if (!qtyModal) return;
        const context = state.pendingContext || state.mode;
        if (context === 'purchase') {
          if (purchaseItemSearchInput) purchaseItemSearchInput.value = '';
        } else if (context === 'damage') {
          if (damageItemSearchInput) damageItemSearchInput.value = '';
        } else {
          if (itemSearchInput) itemSearchInput.value = '';
        }
        qtyModal.style.display = 'none';
        state.pendingEntry = null;
        state.pendingEditIndex = null;
        state.pendingContext = state.mode;
        if (qtySubmitButton) {
          qtySubmitButton.textContent = 'Add Item';
        }
        updateQtyHint(null);
        if (ingredientPickerEl && ingredientPickerEl.dataset.stayOpen === 'true') {
          ingredientPickerEl.style.display = 'flex';
        }
        focusActiveScanner();
      }

      function editCartQuantity(context, index) {
        if (!qtyModal || !qtyInput) return;
        const cart = getCart(context);
        const target = cart[index];
        if (!target) return;
        state.pendingEntry = { ...target };
        if (context === 'damage') {
          state.pendingEntry.packageSize = 1;
        }
        state.pendingEditIndex = index;
        state.pendingContext = context;
        qtyTitle.textContent = target.variationName
          ? (target.productName ?? 'Product') + ' - ' + target.variationName
          : target.productName ?? 'Product';
        qtyUom.textContent = formatUomPair(target);
        qtyInput.value = (target.scannedQty ?? target.qty ?? 0).toString();
        updateQtyHint(target);
        qtyModal.style.display = 'flex';
        if (qtySubmitButton) {
          qtySubmitButton.textContent = 'Update Item';
        }
        setTimeout(() => qtyInput.focus(), 10);
      }

      function addCartItem(entry, context) {
        const scannedQty = Number(entry.scannedQty ?? entry.qty ?? 0);
        const cart = getCart(context);
        const existing = cart.find(
          (item) => item.productId === entry.productId && item.variationId === entry.variationId
        );
        if (existing) {
          existing.qty += entry.qty;
          const priorScanned = Number(existing.scannedQty ?? 0);
          existing.scannedQty = priorScanned + scannedQty;
          if (entry.unitCost != null) {
            existing.unitCost = entry.unitCost;
          }
        } else {
          cart.push({ ...entry, scannedQty, unitCost: entry.unitCost ?? null });
        }
        renderCart(context);
      }

      function updateCartScannedQty(context, index, rawValue) {
        const cart = getCart(context);
        const target = cart[index];
        if (!target) return;
        const effective = computeEffectiveQty(rawValue, target);
        if (effective == null || effective <= 0) {
          showResult('Enter a valid quantity', true);
          renderCart(context);
          return;
        }
        target.scannedQty = Number(rawValue);
        target.qty = effective;
        renderCart(context);
      }

      function removeCartItem(context, index) {
        const cart = getCart(context);
        if (index < 0 || index >= cart.length) return;
        cart.splice(index, 1);
        renderCart(context);
      }

      function renderCart(context = state.mode) {
        const elements = cartElements[context];
        if (!elements?.body || !elements?.empty || !elements?.count) return;
        const cart = getCart(context);
        elements.body.innerHTML = '';
        if (!cart.length) {
          elements.empty.style.display = 'block';
        } else {
          elements.empty.style.display = 'none';
          cart.forEach((item, index) => {
            const row = document.createElement('tr');
            const productCell = document.createElement('td');
            productCell.textContent = item.productName ?? 'Product';
            const variationCell = document.createElement('td');
            variationCell.textContent = item.variationName ? item.variationName : '-';
            const scannedCell = document.createElement('td');
            const scannedInput = document.createElement('input');
            scannedInput.type = 'text';
            scannedInput.readOnly = true;
            scannedInput.className = 'scanned-qty-input';
            scannedInput.value = (item.scannedQty ?? item.qty ?? 0).toString();
            scannedInput.title = 'Tap to adjust scanned quantity';
            scannedInput.addEventListener('click', () => {
              editCartQuantity(context, index);
            });
            scannedInput.addEventListener('keydown', (event) => {
              const key = event.key?.toLowerCase();
              if (key === 'enter' || key === ' ') {
                event.preventDefault();
                editCartQuantity(context, index);
              }
            });
            scannedCell.appendChild(scannedInput);
            const qtyCell = document.createElement('td');
            qtyCell.textContent = (item.qty ?? 0).toString();
            const uomCell = document.createElement('td');
            uomCell.textContent = item.uom ?? 'UNIT';
            if (context === 'purchase') {
              const costCell = document.createElement('td');
              costCell.textContent = formatAmount(item.unitCost) ?? '-';
              row.appendChild(productCell);
              row.appendChild(variationCell);
              row.appendChild(scannedCell);
              row.appendChild(qtyCell);
              row.appendChild(uomCell);
              row.appendChild(costCell);
            } else {
              row.appendChild(productCell);
              row.appendChild(variationCell);
              row.appendChild(scannedCell);
              row.appendChild(qtyCell);
              row.appendChild(uomCell);
            }
            const actionsCell = document.createElement('td');
            actionsCell.className = 'cart-row-actions';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => {
              removeCartItem(context, index);
            });
            actionsCell.appendChild(removeBtn);
            row.appendChild(actionsCell);
            elements.body.appendChild(row);
          });
        }
        const count = cart.length;
        elements.count.textContent = count + (count === 1 ? ' item' : ' items');
        if (context === 'purchase') {
          updatePurchaseSummary();
        }
      }

      function isIngredientLike(product) {
        const kind = (product?.item_kind || product?.itemKind || '').toString().toLowerCase();
        return kind === 'ingredient';
      }

      function resolveIngredientList() {
        const all = Array.isArray(state.ingredients) ? state.ingredients : [];
        return all.filter((product) => isIngredientLike(product));
      }

      function renderIngredientGrid(context) {
        const grid = context === 'damage' ? damageIngredientGrid : ingredientGrid;
        const empty = context === 'damage' ? damageIngredientEmpty : ingredientEmpty;
        if (!grid || !empty) return;
        grid.innerHTML = '';
        const list = resolveIngredientList();
        if (!list.length) {
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        list.forEach((product) => {
          if (!product?.id) return;
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'ingredient-card';

          const name = document.createElement('div');
          name.className = 'ingredient-card-name';
          name.textContent = product.name ?? 'Ingredient';

          const entry = buildEntryForProduct(product, null);
          const meta = document.createElement('div');
          meta.className = 'ingredient-card-meta';
          meta.textContent = formatUomPair(entry);

          card.appendChild(name);
          card.appendChild(meta);

          card.addEventListener('click', () => {
            if (product.has_variations) {
              openVariantModal(product, null, context, null);
              return;
            }
            promptQuantity(product, null, context, null);
          });

          grid.appendChild(card);
        });
      }

      async function fetchWarehousesMetadata() {
        const lockedIds = Array.from(new Set([lockedSourceId].filter(Boolean)));

        const loadViaRpc = async () => {
          const { data, error } = await supabase.rpc('console_locked_warehouses', {
            p_include_inactive: false,
            p_locked_ids: lockedIds.length ? lockedIds : null
          });
          if (error) throw error;
          return Array.isArray(data) ? data : [];
        };

        const loadViaServiceApi = async () => {
          const params = new URLSearchParams();
          if (lockedIds.length) {
            lockedIds.forEach((id) => params.append('locked_id', id));
          }
          params.set('include_inactive', '0');
          const query = params.toString();
          const querySuffix = query ? '?' + query : '';
          const response = await fetch('/api/warehouses' + querySuffix, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            const message = detail || 'warehouses api failed with status ' + response.status;
            throw new Error(message);
          }
          const payload = await response.json().catch(() => ({}));
          const list = Array.isArray(payload?.warehouses) ? payload.warehouses : [];
          return list.map((record) => ({
            id: record?.id,
            name: record?.name,
            parent_warehouse_id: record?.parent_warehouse_id,
            active: record?.active
          }));
        };

        const loadViaTable = async () => {
          const selectColumns = 'id,name,parent_warehouse_id,active';
          const { data, error } = await supabase.from('warehouses').select(selectColumns).order('name');
          if (error) throw error;
          const rows = (Array.isArray(data) ? data : []).map((row) => ({ ...row, active: row?.active ?? true }));
          if (!lockedIds.length) return rows;
          const missingIds = lockedIds.filter((id) => id && !rows.some((row) => row?.id === id));
          if (!missingIds.length) return rows;
          const { data: lockedRows, error: lockedErr } = await supabase.from('warehouses').select(selectColumns).in('id', missingIds);
          if (lockedErr) throw lockedErr;
          const hydratedLockedRows = (Array.isArray(lockedRows) ? lockedRows : []).map((row) => ({
            ...row,
            active: row?.active ?? true
          }));
          return rows.concat(hydratedLockedRows);
        };

        try {
          return await loadViaServiceApi();
        } catch (apiError) {
          markOfflineIfNetworkError(apiError);
          console.warn('warehouses API fallback failed, falling back to direct table', apiError);
          try {
            return await loadViaTable();
          } catch (tableError) {
            markOfflineIfNetworkError(tableError);
            console.warn('warehouses table fallback failed, using cached/locked ids', tableError);
            if (Array.isArray(state.warehouses) && state.warehouses.length) {
              return state.warehouses;
            }
            const fallbackList = lockedIds.map((id) => {
              const choice = (DESTINATION_CHOICES || []).find((opt) => opt?.id === id);
              return {
                id,
                name: choice?.label || 'Warehouse',
                parent_warehouse_id: null,
                active: true
              };
            });
            return fallbackList;
          }
        }
      }

      async function fetchOperators() {
        if (state.networkOffline) {
          console.warn('Skipping operator fetch: network offline');
          state.operators = [];
          renderOperatorOptions();
          return;
        }

        const normalizeOperators = (input) =>
          (Array.isArray(input) ? input : [])
            .map((entry) => ({
              id: entry?.id,
              displayName: entry?.display_name ?? entry?.name ?? 'Operator',
              authUserId: entry?.auth_user_id ?? null,
              email: entry?.email ?? null
            }))
            .filter((entry) => entry.id);

        const loadViaRpc = async () => {
          const { data, error } = await supabase.rpc('console_operator_directory');
          if (error) {
            throw error;
          }
          return data;
        };

        const loadViaOperatorApi = async () => {
          const response = await fetch('/api/operators', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin'
          });
          if (!response.ok) {
            throw new Error('operators api failed with status ' + response.status);
          }
          const payload = await response.json();
          return payload?.operators ?? [];
        };

        try {
          let rawList = [];
          try {
            rawList = await loadViaRpc();
          } catch (rpcError) {
            console.warn('console_operator_directory rpc failed, attempting operator API fallback', rpcError);
            rawList = await loadViaOperatorApi();
          }
          state.operators = normalizeOperators(rawList);
          renderOperatorOptions();
        } catch (error) {
          markOfflineIfNetworkError(error);
          console.warn('Failed to load operator directory', error);
          showResult('Unable to load operator directory. Unlocks unavailable.', true);
          state.operators = [];
          renderOperatorOptions();
        }
      }

      async function fetchSuppliers() {
        const skipDirect = state.networkOffline;
        if (skipDirect) {
          console.warn('Supplier fetch: network offline (skipping direct Supabase queries)');
        }

        const matchesScannerArea = (supplier) => supplier?.scanner_id === SCANNER_ID;

        const linkTableSelect = (withScanner) =>
          withScanner
            ? 'supplier:suppliers(id,name,contact_name,contact_phone,contact_email,active,scanner_id,scanner:scanners(name))'
            : 'supplier:suppliers(id,name,contact_name,contact_phone,contact_email,active)';
        const supplierSelect = (withScanner) =>
          withScanner
            ? 'id,name,contact_name,contact_phone,contact_email,active,scanner_id,scanner:scanners(name)'
            : 'id,name,contact_name,contact_phone,contact_email,active';

        const loadViaRpc = async (warehouseId) => {
          if (!warehouseId) return [];
          const { data, error, status } = await supabase.rpc('suppliers_for_warehouse', { p_warehouse_id: warehouseId });
          if (error) {
            const wrapped = new Error(error.message ?? 'suppliers_for_warehouse RPC failed');
            wrapped.status = status;
            wrapped.code = error.code;
            throw wrapped;
          }
          return Array.isArray(data) ? data : [];
        };

        const loadViaLinkTable = async (warehouseId) => {
          if (!warehouseId) return [];
          let { data, error, status } = await supabase
            .from('product_supplier_links')
            .select(linkTableSelect(true))
            .eq('warehouse_id', warehouseId)
            .eq('active', true);
          if (error && (error.message?.includes('scanner') || error.message?.includes('scanners'))) {
            ({ data, error, status } = await supabase
              .from('product_supplier_links')
              .select(linkTableSelect(false))
              .eq('warehouse_id', warehouseId)
              .eq('active', true));
          }
          if (error) {
            const wrapped = new Error(error.message ?? 'product_supplier_links fetch failed');
            wrapped.status = status;
            wrapped.code = error.code;
            throw wrapped;
          }
          return (Array.isArray(data) ? data : []).map((row) => row?.supplier).filter(Boolean);
        };

        const loadAllSuppliers = async () => {
          let { data, error, status } = await supabase
            .from('suppliers')
            .select(supplierSelect(true))
            .eq('active', true);
          if (error && (error.message?.includes('scanner') || error.message?.includes('scanners'))) {
            ({ data, error, status } = await supabase
              .from('suppliers')
              .select(supplierSelect(false))
              .eq('active', true));
          }
          if (error) {
            const wrapped = new Error(error.message ?? 'suppliers fetch failed');
            wrapped.status = status;
            wrapped.code = error.code;
            throw wrapped;
          }
          return Array.isArray(data) ? data : [];
        };

        const loadViaApi = async () => {
          const response = await fetch('/api/suppliers', { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            const wrapped = new Error(info.error || 'suppliers api failed');
            wrapped.status = response.status;
            throw wrapped;
          }
          const payload = await response.json().catch(() => ({}));
          return Array.isArray(payload?.suppliers) ? payload.suppliers : [];
        };

        const mergeSuppliers = (baseList, extraList) => {
          const map = new Map();
          (Array.isArray(baseList) ? baseList : []).forEach((supplier) => {
            if (supplier?.id) map.set(supplier.id, supplier);
          });
          (Array.isArray(extraList) ? extraList : []).forEach((supplier) => {
            if (supplier?.id && !map.has(supplier.id)) {
              map.set(supplier.id, supplier);
            }
          });
          return Array.from(map.values());
        };

        let list = [];
        let lastError = null;

        if (!skipDirect) {
          try {
            list = await loadViaRpc(lockedSourceId);
          } catch (error) {
            lastError = error;
            console.warn('Primary supplier fetch failed, attempting link-table fallback', error);
          }
        }

        if (!skipDirect && !list.length) {
          try {
            list = await loadViaLinkTable(lockedSourceId);
          } catch (error) {
            lastError = error;
            console.warn('Link-table supplier fetch failed, attempting all active suppliers', error);
          }
        }

        if (!skipDirect && !list.length) {
          try {
            list = await loadAllSuppliers();
          } catch (error) {
            lastError = error;
            console.warn('All-suppliers fetch failed', error);
          }
        }

        let apiList = [];
        try {
          apiList = await loadViaApi();
        } catch (error) {
          lastError = error;
          console.warn('Suppliers api fallback failed', error);
        }

        const merged = mergeSuppliers(list, apiList);
        state.suppliers = merged.filter((s) => s && s.active !== false && matchesScannerArea(s));
        renderSupplierOptions();

        if (!state.suppliers.length && lastError) {
          markOfflineIfNetworkError(lastError);
          throw lastError;
        }
      }

      async function fetchIngredientCatalog() {
        if (state.networkOffline) {
          console.warn('Skipping ingredient catalog fetch: network offline');
          return [];
        }
        const storageHomeIds = Array.isArray(STORAGE_HOME_ALLOWED_IDS) ? STORAGE_HOME_ALLOWED_IDS : [];
        const url = new URL('/api/ingredient-catalog', window.location.origin);
        storageHomeIds.forEach((id) => url.searchParams.append('storage_home_id', id));

        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          const payload = await response.text();
          const error = new Error(payload || 'Failed to load ingredient catalog');
          error.status = response.status;
          throw error;
        }
        const payload = await response.json();
        return Array.isArray(payload?.items) ? payload.items : [];
      }

      async function refreshMetadata() {
        try {
          const warehouses = await fetchWarehousesMetadata();
          console.log('warehouses payload', warehouses);
          state.warehouses = warehouses ?? [];
          const sourceWarehouse = state.warehouses.find((w) => w.id === lockedSourceId) ?? null;
          state.lockedSource = sourceWarehouse;
          const allowedDestSet = new Set(ALLOWED_DESTINATION_IDS);
          const hydratedDestinations = (state.warehouses || [])
            .filter((warehouse) =>
              warehouse?.id &&
              warehouse.id !== lockedSourceId &&
              warehouse.active !== false &&
              allowedDestSet.has(warehouse.id)
            )
            .map((warehouse) => ({
              id: warehouse.id,
              label: warehouse.name ?? 'Destination warehouse'
            }));
          state.destinationOptions = hydratedDestinations;
          const hasSavedSelection = state.destinationSelection && hydratedDestinations.some((opt) => opt.id === state.destinationSelection);
          if (!hasSavedSelection) {
            state.destinationSelection = null;
            state.lockedDest = null;
            if (destinationSelect) {
              destinationSelect.value = '';
            }
          } else {
            state.lockedDest = state.warehouses.find((w) => w.id === state.destinationSelection) ?? null;
          }
          renderDestinationOptions();
          setLockedWarehouseLabels(sourceWarehouse, state.lockedDest, {
            destMissingText: 'Choose destination'
          });
          syncDestinationPillLabel();
          if (!sourceWarehouse) {
            throw new Error('Locked source warehouse is missing. Confirm the ID or mark it active in Supabase.');
          }
          if (!hydratedDestinations.length) {
            throw new Error('No destination warehouses found. Add another warehouse or mark it active.');
          }
        } catch (error) {
          console.error('refreshMetadata failed', error);
          if (sourceLabel) {
            sourceLabel.textContent = 'Failed to load warehouses';
          }
          if (destLabel) {
            destLabel.textContent = 'Failed to load warehouses';
          }
          setLockedWarehouseLabels(null, null, {
            sourceMissingText: 'Unable to load warehouse (check Supabase connection)',
            destMissingText: 'Unable to load warehouse (check Supabase connection)'
          });
          throw error;
        }

        const targetWarehouseIds = collectDescendantIds(state.warehouses, lockedSourceId);
        state.products = await fetchProductsForWarehouse(targetWarehouseIds);
        try {
          state.ingredients = await fetchIngredientCatalog();
        } catch (error) {
          markOfflineIfNetworkError(error);
          console.warn('Ingredient catalog fetch failed', error);
          state.ingredients = [];
        }
        const variationIds = Array.from(new Set([
          ...state.products.map((p) => p.id),
          ...state.ingredients.map((p) => p.id)
        ]));
        await safePreloadVariations(variationIds);
        renderIngredientGrid('transfer');
        renderIngredientGrid('damage');
        try {
          await fetchSuppliers();
        } catch (error) {
          console.warn('Failed to load supplier list', error);
          showResult('Unable to refresh supplier list. Continue scanning or retry later.', true);
        }
        try {
          await fetchOperators();
        } catch (error) {
          console.warn('Failed to refresh operator directory', error);
        }
        renderCart();
        renderCart('damage');
        focusActiveScanner();
      }

      function showLoginError(message) {
        loginStatus.textContent = message;
        loginStatus.className = 'message error';
        loginStatus.style.display = 'block';
      }

      function showLoginInfo(message) {
        loginStatus.textContent = message;
        loginStatus.className = 'message';
        loginStatus.style.display = 'block';
      }

      function logAuthDebug(label, payload) {
        console.log(label, payload);
        showLoginInfo(label);
      }

      async function handleLogin(event) {
        event.preventDefault();
        showLoginInfo('Signing in...');
        const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
        const password = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          console.log('signInWithPassword result', data);
          if (data?.session) {
            showLoginInfo('Signed in. Syncing session...');
            await syncSession(data.session);
            return;
          }

          showLoginInfo('Signed in. Waiting for session...');
          const sessionResp = await supabase.auth.getSession();
          console.log('post-login getSession', sessionResp);
          if (sessionResp?.data?.session) {
            await syncSession(sessionResp.data.session);
            return;
          }

          showLoginError('Sign-in returned no session. Check credentials, role, or email confirmation.');
        } catch (error) {
          showLoginError(error.message ?? 'Unable to sign in');
        }
      }

      async function handleSubmit(event) {
        event.preventDefault();
        if (state.loading) return;
        const sourceId = lockedSourceId;
        if (!ensureDestinationSelected('transfer')) {
          return;
        }
        const destination = getSelectedDestination();
        const destId = destination?.id;
        if (!destId) {
          showResult('Destination unavailable. Refresh and try again.', true);
          return;
        }
        const cart = getCart('transfer');
        if (!cart.length) {
          showResult('Scan at least one product before submitting.', true);
          return;
        }

        state.loading = true;
        if (transferSubmit) {
          transferSubmit.disabled = true;
          transferSubmit.textContent = 'Submitting...';
        }
        try {
          const cartSnapshot = cart.map((item) => ({ ...item }));
          const payload = {
            p_source: sourceId,
            p_destination: destId,
            p_items: cartSnapshot.map((item) => ({
              product_id: item.productId,
              variant_key: item.variationId ?? item.variantKey ?? null,
              qty: item.qty
            })),
            p_note: null
          };
          const { data, error } = await supabase.rpc('transfer_units_between_warehouses', payload);
          if (error) throw error;
          const now = new Date();
          const month = String(now.getMonth() + 1);
          const day = String(now.getDate());
          const year = String(now.getFullYear());
          const datePart = month + '/' + day + '/' + year;
          const timePart = now.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          });
          const windowLabel = datePart + ' ' + timePart;
          const lineItems = mapCartSnapshotToLineItems(cartSnapshot);
          const itemsBlock = buildItemsBlockFromLines(lineItems);
          const rawReference = typeof data === 'string' ? data : String(data ?? '');
          const reference = /^\d+$/.test(rawReference) ? rawReference.padStart(10, '0') : rawReference;
          const summary = {
            reference,
            referenceRaw: rawReference,
            processedBy: state.session?.user?.email ?? 'Unknown operator',
            operator: state.session?.user?.email ?? 'Unknown operator',
            sourceLabel: sourceLabel.textContent,
            destLabel: destLabel.textContent,
            route:
              (sourceLabel.textContent ?? 'Unknown source') + ' -> ' + (destLabel.textContent ?? 'Unknown destination'),
            dateTime: windowLabel,
            window: windowLabel,
            itemsBlock,
            items: lineItems,
            note: null
          };
          showResult('Transfer ' + data + ' submitted successfully.', false);
          setCart('transfer', []);
          renderCart('transfer');
        } catch (error) {
          showResult(error.message ?? 'Transfer failed', true);
        } finally {
          state.loading = false;
          if (transferSubmit) {
            transferSubmit.disabled = false;
            transferSubmit.textContent = 'Submit Transfer';
          }
        }
      }

      async function handleDamageSubmit(event) {
        event.preventDefault();
        if (state.damageSubmitting) return;
        if (!ensureDestinationSelected('damage')) {
          return;
        }
        const warehouseId = lockedSourceId;
        if (!warehouseId) {
          showResult('Source warehouse unavailable for damages.', true);
          return;
        }
        const cart = getCart('damage');
        if (!cart.length) {
          showResult('Scan at least one product before logging damages.', true);
          return;
        }

        const noteValue = (damageNote?.value ?? state.damageNote ?? '').trim();
        const cartSnapshot = cart.map((item) => ({ ...item }));
        const payloadItems = cartSnapshot.map((item) => ({
          product_id: item.productId,
          variant_key: item.variationId ?? item.variantKey ?? null,
          qty: item.qty,
          note: noteValue || null
        }));

        if (payloadItems.some((item) => !item.product_id || !item.qty || item.qty <= 0)) {
          showResult('One or more damage items are missing quantity or product references.', true);
          return;
        }

        state.damageSubmitting = true;
        if (damageSubmit) {
          damageSubmit.disabled = true;
          damageSubmit.textContent = 'Logging...';
        }

        try {
          const { error } = await supabase.rpc('record_damage', {
            p_warehouse_id: warehouseId,
            p_items: payloadItems,
            p_note: noteValue || null
          });
          if (error) throw error;

          showResult('Damages logged and deducted.', false);
          setCart('damage', []);
          renderCart('damage');
          if (damageNote) damageNote.value = '';
          state.damageNote = '';
          setMode('damage');
          focusActiveScanner();
        } catch (error) {
          showResult(error.message ?? 'Failed to log damages', true);
        } finally {
          state.damageSubmitting = false;
          if (damageSubmit) {
            damageSubmit.disabled = false;
            damageSubmit.textContent = 'Log Damages';
          }
        }
      }

      async function handlePurchaseSubmit(event) {
        event.preventDefault();
        if (state.purchaseSubmitting) return;
        if (!ensureDestinationSelected('purchase')) {
          return;
        }
        const warehouseId = lockedSourceId;
        if (!warehouseId) {
          showResult('Source warehouse unavailable for purchase intake.', true);
          return;
        }
        const cart = getCart('purchase');
        if (!cart.length) {
          showResult('Scan at least one product before logging a purchase.', true);
          return;
        }

        const referenceInput = (purchaseReference?.value ?? state.purchaseForm.referenceCode ?? '').trim();
        if (!referenceInput) {
          showResult('Reference / Invoice # is required.', true);
          purchaseReference?.focus();
          return;
        }

        const supplierId = state.purchaseForm.supplierId || null;
        const cartSnapshot = cart.map((item) => ({ ...item }));
        const payloadItems = cartSnapshot.map((item) => ({
          product_id: item.productId,
          variant_key: item.variationId ?? item.variantKey ?? null,
          qty: item.qty,
          qty_input_mode: 'units',
          unit_cost: item.unitCost ?? null
        }));

        if (payloadItems.some((item) => !item.product_id || !item.qty || item.qty <= 0)) {
          showResult('One or more items are missing quantity or product references.', true);
          return;
        }

        state.purchaseForm.referenceCode = referenceInput;
        state.purchaseSubmitting = true;
        if (purchaseSubmit) {
          purchaseSubmit.disabled = true;
          purchaseSubmit.textContent = 'Recording...';
        }

        try {
          const payload = {
            p_warehouse_id: warehouseId,
            p_supplier_id: supplierId,
            p_reference_code: referenceInput,
            p_items: payloadItems,
            p_note: null
          };
          const { data, error } = await supabase.rpc('record_purchase_receipt', payload);
          if (error) throw error;

          const receiptRef = typeof data?.reference_code === 'string' ? data.reference_code : referenceInput;
          const supplierName = supplierId
            ? state.suppliers.find((supplier) => supplier?.id === supplierId)?.name ?? 'Supplier'
            : 'Unspecified supplier';
          const warehouseName = state.lockedSource?.name ?? sourceLabel.textContent ?? 'Warehouse';
          const lineItems = mapCartSnapshotToLineItems(cartSnapshot);
          const grossTotal = cartSnapshot.reduce((sum, item) => {
            const lineTotal = computeLineTotal(item);
            return sum + (lineTotal ?? 0);
          }, 0);
          const itemsBlock = buildItemsBlockFromLines(lineItems);
          const timestampSource = data?.received_at ?? data?.recorded_at ?? new Date().toISOString();
          const timestamp = new Date(timestampSource);
          const windowLabel = timestamp.toLocaleDateString('en-US') + ' ' + timestamp.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          });

          const summary = {
            reference: receiptRef,
            referenceRaw: receiptRef,
            processedBy: state.session?.user?.email ?? 'Unknown operator',
            sourceLabel: supplierName,
            destLabel: warehouseName,
            route: supplierName + ' -> ' + warehouseName,
            dateTime: windowLabel,
            window: windowLabel,
            itemsBlock,
            items: lineItems,
            totalGross: grossTotal
          };

          showResult('Purchase ' + receiptRef + ' recorded successfully.', false);
          setCart('purchase', []);
          renderCart('purchase');
          resetPurchaseForm();
          focusActiveScanner();
        } catch (error) {
          showResult(error.message ?? 'Purchase failed', true);
        } finally {
          state.purchaseSubmitting = false;
          if (purchaseSubmit) {
            purchaseSubmit.disabled = false;
            purchaseSubmit.textContent = 'Record Purchase';
          }
        }
      }

      async function loadRecipeComponents(product, variantKey) {
        if (!product?.id) return [];
        const normalizedVariant = normalizeVariantKeyLocal(variantKey);
        const productKind = (product.item_kind ?? 'finished').toString().toLowerCase();

        try {
          const { data, error } = await supabase
            .from('recipes')
              return;
        const { data, error } = await supabase.rpc('whoami_roles');
        if (error) {
          const rpcError = new Error(error.message ?? 'Unable to verify roles');
          rpcError.code = error.code ?? 'ROLE_LOOKUP_FAILED';
          throw rpcError;
        }
        const record = Array.isArray(data) ? data[0] : data;
        const baseRoles = Array.isArray(record?.roles) ? record.roles : [];
        const catalogRoles = Array.isArray(record?.role_catalog)
          ? record.role_catalog
              .map((r) => r?.slug ?? r?.normalized_slug ?? r?.name ?? r?.id ?? null)
              .filter(Boolean)
          : [];
        const effectiveRoles = [...baseRoles, ...catalogRoles];
        if (record?.is_admin === true) {
          effectiveRoles.push('admin');
        }
        console.log('whoami_roles result', { record, effectiveRoles });
        const recordUserId = record?.user_id ?? record?.auth_user_id ?? record?.id ?? null;
        if (recordUserId && ALLOWED_USER_IDS.includes(recordUserId)) {
          return true;
        }
        const hasRole = effectiveRoles.some((role) => {
          if (!role) return false;
          if (typeof role === 'string') {
            const trimmed = role.trim();
            if (!trimmed) return false;
            if (trimmed === REQUIRED_ROLE_ID || trimmed === ADMIN_ROLE_ID || trimmed === BACKOFFICE_ROLE_ID) return true;
            return ALLOWED_ROLE_SLUGS.includes(trimmed.toLowerCase());
          }
          if (typeof role === 'object') {
            const roleId = typeof role.id === 'string' ? role.id : null;
            const slugSource =
              typeof role.slug === 'string'
                ? role.slug
                : typeof role.normalized_slug === 'string'
                  ? role.normalized_slug
                  : typeof role.name === 'string'
                    ? role.name
                    : null;
            const slug = slugSource ? slugSource.toLowerCase() : null;
            return (
              roleId === REQUIRED_ROLE_ID ||
              roleId === ADMIN_ROLE_ID ||
              roleId === BACKOFFICE_ROLE_ID ||
              (slug !== null && ALLOWED_ROLE_SLUGS.includes(slug))
            );
          }
          return false;
        });
        if (!hasRole) {
          const missingRoleError = new Error('WAREHOUSE_ROLE_REQUIRED');
          missingRoleError.detail = { roles: effectiveRoles };
          missingRoleError.code = 'WAREHOUSE_ROLE_REQUIRED';
          throw missingRoleError;
        }
        state.operatorProfile = record ?? null;
        return record;
      }

      async function syncSession(session) {
        // Always proceed without blocking on auth; kiosk runs open.
        state.session = session ?? { user: { email: 'kiosk@afterten.local' } };
        document.body.dataset.auth = 'true';
        loginStatus.style.display = 'none';
        logAuthDebug('Session ready (kiosk mode) for ' + (state.session.user?.email ?? 'unknown user'), state.session);
        try {
          await refreshMetadata();
        } catch (error) {
          showResult(error.message ?? 'Failed to load metadata', true);
        }
      }

      scannerWedge?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitScanBuffer();
          return;
        }
        const isCharacterKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
        if (!isCharacterKey) return;
        scanBuffer += event.key;
        queueScanFlush();
      });
      scannerWedge?.addEventListener('paste', (event) => {
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData)?.getData('text') ?? '';
        if (!text) return;
        scanBuffer += text;
        commitScanBuffer();
      });
      scannerWedge?.addEventListener('blur', () => {
        if (document.body.dataset.auth !== 'true') return;
        if (qtyModal?.style.display === 'flex') return;
        window.setTimeout(() => {
          if (document.hidden) return;
          if (shouldHoldScannerFocus()) return;
          focusActiveScanner();
        }, 50);
      });
      purchaseOpenButton?.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          if (!state.suppliers.length) {
            await fetchSuppliers();
          }
        } catch (error) {
          console.warn('Supplier fetch failed before opening purchase page', error);
          showResult('Unable to refresh supplier list. Try again or continue without selecting one.', true);
        }
        enterPurchaseMode();
      });

      damageOpenButton?.addEventListener('click', (event) => {
        event.preventDefault();
        enterDamageMode();
      });

      damageForm?.addEventListener('pointerdown', () => {
        if (state.mode !== 'damage') setMode('damage');
      });

      transferForm?.addEventListener('pointerdown', () => {
        if (document.body.dataset.view === 'purchase' || document.body.dataset.view === 'damage') return;
        if (state.mode !== 'transfer') setMode('transfer');
      });

      damageSubmit?.addEventListener('click', () => {
        if (state.mode !== 'damage') setMode('damage');
      });

      damageNote?.addEventListener('input', () => {
        state.damageNote = damageNote.value ?? '';
      });

      itemSearchInput?.addEventListener('focus', () => {
        state.mode = 'transfer';
      });

      itemSearchInput?.addEventListener('input', () => {
        const value = (itemSearchInput.value ?? '').trim();
        if (value.length < 2) {
          lastSearchTerm = '';
          return;
        }
        if (value === lastSearchTerm) return;
        lastSearchTerm = value;
        window.clearTimeout(itemSearchDebounceId);
        itemSearchDebounceId = window.setTimeout(() => {
          searchProductsWithScan(value).catch((error) => console.warn('search failed', error));
        }, 150);
      });

      itemSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = (itemSearchInput.value ?? '').trim();
        if (!value) return;
        await searchProductsWithScan(value);
        // Keep focus and select text for rapid repeated entries.
        window.setTimeout(() => {
          itemSearchInput.select();
        }, 10);
      });

      damageItemSearchInput?.addEventListener('focus', () => {
        state.mode = 'damage';
      });

      damageItemSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = (damageItemSearchInput.value ?? '').trim();
        if (!value) return;
        await searchProductsWithScan(value);
        window.setTimeout(() => {
          damageItemSearchInput.select();
        }, 10);
      });

      purchaseItemSearchInput?.addEventListener('focus', () => {
        state.mode = 'purchase';
      });

      purchaseItemSearchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = (purchaseItemSearchInput.value ?? '').trim();
        if (!value) return;
        await searchProductsWithScan(value);
        window.setTimeout(() => {
          purchaseItemSearchInput.select();
        }, 10);
      });


      const openDamageKeyboard = (event) => {
        const pointerTriggered = event?.type === 'pointerdown';
        if (!pointerTriggered && damageKeyboardSuppressed) {
          return;
        }
        damageKeyboardSuppressed = false;
        showDamageNotesKeyboard();
      };

      damageNote?.addEventListener('focus', openDamageKeyboard);
      damageNote?.addEventListener('pointerdown', openDamageKeyboard);

      damageNotesKeyboard?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;
        const key = target.dataset.key;
        const action = target.dataset.action;
        if (key) {
          insertDamageNoteText(key);
          return;
        }
        if (action) {
          handleDamageNotesAction(action);
        }
      });

      damageNotesKeyboard?.addEventListener('click', (event) => {
        // Prevent label default behavior (focusing the input) after button clicks.
        event.preventDefault();
        event.stopPropagation();
      });

      purchaseBackButton?.addEventListener('click', (event) => {
        if (event instanceof Event) {
          event.preventDefault();
        }
        exitPurchaseMode();
      });

      damageBackButton?.addEventListener('click', (event) => {
        if (event instanceof Event) {
          event.preventDefault();
        }
        exitDamageMode();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.mode === 'purchase') {
          exitPurchaseMode();
        }
        if (event.key === 'Escape' && document.body.dataset.view === 'damage') {
          if (damageNotesKeyboard?.classList.contains('active')) {
            hideDamageNotesKeyboard();
            return;
          }
          exitDamageMode();
        }
      });

      purchaseSupplier?.addEventListener('change', () => {
        state.purchaseForm.supplierId = purchaseSupplier.value ?? '';
        updateSupplierPickerLabel();
      });

      purchaseReference?.addEventListener('focus', () => {
        showReferenceNumpad();
      });


      purchaseReference?.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        showReferenceNumpad();
      });

      referenceNumpadDigits?.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });

      purchaseReference?.addEventListener('input', () => {
        syncReferenceValue(purchaseReference.value ?? '');
      });

      document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        const interactingWithReferenceInput =
          target === purchaseReference ||
          purchaseReference?.contains(target) ||
          (target instanceof HTMLElement && target.closest('.reference-field'));
        const interactingWithReferenceNumpad = referenceNumpadDigits?.contains(target);
        const interactingWithPurchaseSearch =
          target === purchaseItemSearchInput || purchaseItemSearchInput?.contains(target);
        if (interactingWithReferenceInput || interactingWithReferenceNumpad) {
          // Keep the keyboard open while interacting with it or its source input.
          window.clearTimeout(referenceNumpadHideTimeoutId);
          showReferenceNumpad();
          return;
        }
        if (interactingWithPurchaseSearch) {
          return;
        }
        hideReferenceNumpad();
      });

      referenceNumpadDigits?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;
        const key = target.dataset.key;
        const action = target.dataset.action;
        if (key) {
          insertReferenceText(key.toUpperCase());
          return;
        }
        if (!action) return;
        if (action === 'clear') {
          syncReferenceValue('');
          if (purchaseReference) {
            purchaseReference.value = '';
            purchaseReference.focus();
          }
          return;
        }
        if (action === 'enter') {
          hideReferenceNumpad();
          purchaseReference?.blur();
          return;
        }
        if (action === 'delete') {
          deleteReferenceChar();
          return;
        }
        if (action === 'close') {
          forceCloseReferenceNumpad(event);
        }
      });

      // Close buttons should always hide the keyboard even if focus stays inside.
      referenceNumpadDigits?.querySelectorAll('button[data-action="close"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          forceCloseReferenceNumpad(event);
        });
        btn.addEventListener('pointerdown', (event) => {
          forceCloseReferenceNumpad(event);
        });
      });

      qtyForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const pending = state.pendingEntry;
        if (!pending) return;
        const context = state.pendingContext || state.mode;
        const rawQty = Number(qtyInput.value);
        const recipeComponents = Array.isArray(pending.recipeComponents) ? pending.recipeComponents : null;

        if (recipeComponents?.length) {
          const finishedUnits = Math.floor(rawQty);
          if (!Number.isFinite(finishedUnits) || finishedUnits <= 0) {
            showResult('Enter a whole number of finished units', true);
            qtyInput.focus();
            return;
          }
          const added = [];
          recipeComponents.forEach((component) => {
            const ingredient = component?.ingredient;
            if (!ingredient?.id) return;
            const entry = buildEntryForProduct(ingredient, component.variation ?? null);
            const yieldQty = Number(component.yieldQtyUnits) || 1;
            const baseQty = Number(component.qtyPerUnit) || 0;
            if (baseQty <= 0) return;
            const componentRawQty = (finishedUnits / yieldQty) * baseQty;
            const effectiveQty = computeEffectiveQty(componentRawQty, entry);
            if (effectiveQty === null) return;
            addCartItem({ ...entry, qty: effectiveQty, scannedQty: componentRawQty, unitCost: null }, context);
            added.push(entry.productName ?? 'Ingredient');
          });

          if (added.length) {
            showResult('Queued ' + added.length + ' ingredient(s) for ' + (pending.productName ?? 'Product'), false);
          } else {
            showResult('No ingredients could be queued for this product.', true);
          }
          closeQtyPrompt();
          return;
        }

        const effectiveQty = computeEffectiveQty(rawQty, pending);
        const unitCost = null;
        if (effectiveQty === null) {
          qtyInput.focus();
          return;
        }
        const editIndex = state.pendingEditIndex;
        if (typeof editIndex === 'number' && editIndex >= 0) {
          const cart = getCart(context);
          const target = cart[editIndex];
          if (target) {
            cart[editIndex] = {
              ...target,
              qty: effectiveQty,
              scannedQty: rawQty,
              unitCost
            };
            renderCart(context);
            showResult(
              'Updated ' + (pending.productName ?? 'Product') + ' - ' + describeQty(pending, rawQty, effectiveQty),
              false
            );
          }
          closeQtyPrompt();
          return;
        }
        addCartItem({ ...pending, qty: effectiveQty, scannedQty: rawQty, unitCost }, context);
        showResult(
          'Queued ' + (pending.productName ?? 'Product') + ' - ' + describeQty(pending, rawQty, effectiveQty),
          false
        );
        closeQtyPrompt();
      });
      qtyCancel?.addEventListener('click', () => {
        closeQtyPrompt();
      });
      variantModalClose?.addEventListener('click', () => {
        closeVariantModal();
      });
      variantModal?.addEventListener('click', (event) => {
        if (event.target === variantModal) {
          closeVariantModal();
        }
      });
      document.addEventListener('click', (event) => {
        const target = event.target;
        const clickedReferenceInput = target === purchaseReference || purchaseReference?.contains(target);
        const clickedReferenceNumpad = referenceNumpadDigits?.contains(target);
        const interactingWithDamageNotes =
          target === damageNote || damageNote?.contains(target) || damageNotesKeyboard?.contains(target);
        const interactingWithSupplier =
          target === purchaseSupplier ||
          purchaseSupplier?.contains(target) ||
          target === purchaseSupplierPicker ||
          purchaseSupplierPicker?.contains(target) ||
          supplierModal?.contains(target);

        if (
          clickedReferenceInput ||
          clickedReferenceNumpad ||
          interactingWithDamageNotes ||
          interactingWithSupplier
        ) {
          return;
        }

        if (document.body.dataset.view === 'purchase') return;
        if (shouldHoldScannerFocus(target instanceof HTMLElement ? target : undefined)) return;

        if (document.body.dataset.auth === 'true') {
          focusActiveScanner();
        }
      });

      Object.entries(operatorSelects).forEach(([context, select]) => {
        if (!select) return;
        select.addEventListener('change', (event) => {
          const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
          handleOperatorSelection(context, value);
        });
      });

      destinationSelect?.addEventListener('change', (event) => {
        const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
        handleDestinationSelection(value);
      });

      destinationPicker?.addEventListener('click', () => {
        renderDestinationCards();
        openSelectModal(destinationModal);
      });

      purchaseSupplierPicker?.addEventListener('click', () => {
        renderSupplierCards();
        openSelectModal(supplierModal);
      });

      Object.entries(operatorPickers).forEach(([context, button]) => {
        if (!button) return;
        button.addEventListener('click', () => {
          activeOperatorContext = context;
          renderOperatorCards(context);
          openSelectModal(operatorSelectModal);
        });
      });

      destinationModal?.addEventListener('click', (event) => {
        if (event.target === destinationModal) {
          closeSelectModal(destinationModal);
        }
      });

      operatorSelectModal?.addEventListener('click', (event) => {
        if (event.target === operatorSelectModal) {
          closeSelectModal(operatorSelectModal);
        }
      });

      supplierModal?.addEventListener('click', (event) => {
        if (event.target === supplierModal) {
          closeSelectModal(supplierModal);
        }
      });

      document.querySelectorAll('[data-modal-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-modal-close');
          if (targetId === 'destination-modal') closeSelectModal(destinationModal);
          if (targetId === 'operator-modal') closeSelectModal(operatorSelectModal);
          if (targetId === 'supplier-modal') closeSelectModal(supplierModal);
        });
      });

      operatorModalForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitOperatorUnlock();
      });

      operatorPasswordInput?.addEventListener('input', () => {
        operatorModalError.textContent = '';
        // No auto-submit; waits for Enter or Unlock button.
      });

      operatorPasswordInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitOperatorUnlock();
        }
      });

      operatorModalCancel?.addEventListener('click', (event) => {
        event.preventDefault();
        cancelPendingOperatorSelection();
      });

      logoutButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          handleLogout();
        });
      });

      loginWedge?.addEventListener('input', () => {
        applyLoginScan(loginWedge.value.trim());
        loginWedge.value = '';
      });

      // Kiosk mode: force auth true immediately, then attempt to hydrate from any existing session.
      syncSession({ user: { email: 'kiosk@afterten.local' } }).catch((error) => {
        console.warn('Initial kiosk sync failed', error);
      });

      supabase.auth.getSession().then(({ data }) => {
        console.log('initial getSession', data);
        reportClientReady();
        if (data?.session) {
          syncSession(data.session).catch((error) => {
            console.warn('Initial session sync failed', error);
          });
        }
      });

      supabase.auth.onAuthStateChange(async (_event, session) => {
        syncSession(session).catch((error) => {
          console.warn('Auth change sync failed', error);
        });
      });

      loginForm?.addEventListener('submit', handleLogin);
      purchaseForm?.addEventListener('submit', handlePurchaseSubmit);
      damageForm?.addEventListener('submit', handleDamageSubmit);
      transferForm?.addEventListener('submit', handleSubmit);
    }
    })();
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  if (!PROJECT_URL || !ANON_KEY) {
    return new NextResponse('Supabase environment variables are missing.', { status: 500 });
  }

  const url = new URL(request.url);
  const viewParam = (url.searchParams.get('view') ?? '').toLowerCase();
  const initialView = viewParam === 'damage' ? 'damage' : 'transfer';

  const initialWarehouses = await preloadLockedWarehouses();
  const sourceWarehouse = initialWarehouses.find((w) => w.id === LOCKED_SOURCE_ID);
  const destWarehouse = initialWarehouses.find((w) => w.id === LOCKED_DEST_ID);
  const html = createHtml({
    sourcePillLabel: describeLockedWarehouse(sourceWarehouse, 'Loading...'),
    destPillLabel: describeLockedWarehouse(destWarehouse, 'Choose destination'),
    sourceWarehouseName: sourceWarehouse?.name ?? 'Loading...',
    initialWarehousesJson: serializeForScript(initialWarehouses),
    initialView,
  });

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
