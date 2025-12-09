import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCKED_SOURCE_ID = '09e0898f-359d-4373-a1ab-d9ba8be5b35b';
const DESTINATION_CHOICES = [
  { id: '2a82c629-fdf8-487b-a473-699b88c1e18f', label: 'Accountant Offices' },
  { id: '9a12caa0-c116-4137-8ea5-74bb0de77fae', label: 'Kitchen' },
  { id: 'a9e27d38-7a24-4474-96cd-840e8cff33f5', label: 'Food Preparation Area' }
] as const;
const LOCKED_DEST_ID = DESTINATION_CHOICES[0]?.id ?? '2a82c629-fdf8-487b-a473-699b88c1e18f';
const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_stock_current';
const MULTIPLY_QTY_BY_PACKAGE = true;
const OPERATOR_SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes
const OPERATOR_CONTEXT_LABELS = {
  transfer: 'Transfers',
  purchase: 'Purchases',
  damage: 'Damages'
};

// IMPORTANT: Main warehouse scanner behavior was finalized on 2025-12-09 for kiosk parity.
// Please coordinate with the transfers team before changing any logic in this file,
// as late edits risk breaking the now-approved workflows.

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
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: clamp(12px, 2vw, 18px);
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
    .purchase-grid label textarea {
      min-height: 88px;
      resize: vertical;
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
      top: 50%;
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
    #print-root {
      display: none;
    }
    .receipt {
      font-family: 'Inter', system-ui, sans-serif;
      color: #000;
      background: #fff;
      width: 55mm;
      padding: 6mm 4mm;
      margin: 0 auto;
    }
    .receipt-header {
      text-align: center;
      margin-bottom: 6mm;
    }
    .receipt-logo {
      max-width: 40mm;
      margin: 0 auto 2mm;
      display: block;
    }
    .receipt-meta {
      font-size: 0.78rem;
      margin: 2px 0;
    }
    .receipt-title {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.85rem;
      margin: 0 0 2mm 0;
    }
    .receipt-lines {
      list-style: none;
      padding: 0;
      margin: 4mm 0;
    }
    .receipt-product {
      padding: 2mm 0;
    }
    .receipt-product + .receipt-product {
      border-top: 1px dashed #999;
    }
    .receipt-line {
      display: flex;
      align-items: baseline;
      gap: 3px;
      font-size: 0.8rem;
    }
    .receipt-line .bullet {
      font-weight: 700;
    }
    .receipt-line .qty {
      margin-left: auto;
      font-weight: 600;
    }
    .receipt-product.has-variations .product-name {
      text-decoration: underline;
    }
    .variation-list {
      list-style: none;
      margin: 1mm 0 0 7px;
      padding: 0 0 0 6px;
    }
    .variation-list .receipt-line {
      font-size: 0.78rem;
    }
    .receipt-footer {
      text-align: center;
      font-size: 0.78rem;
      margin-top: 4mm;
      border-top: 1px solid #000;
      padding-top: 2mm;
    }
    .receipt-meta-line {
      font-size: 0.78rem;
      margin: 1mm 0;
      text-align: left;
    }
    .receipt-purchase-line {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      font-size: 0.78rem;
    }
    .receipt-purchase-line span {
      display: block;
    }
    @media print {
      @page {
        size: 55mm auto;
        margin: 4mm;
      }
      body {
        background: #fff;
        padding: 0;
      }
      body:not(.print-mode) #print-root {
        display: none;
      }
      body.print-mode > *:not(#print-root) {
        display: none !important;
      }
      body.print-mode #print-root {
        display: flex;
        justify-content: center;
        width: 100%;
        margin: 0 auto;
      }
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
        <article class="panel route-locker">
          <div class="two-cols">
            <div class="locked-pill">
              <h3>From</h3>
              <p id="source-label">${escapeHtml(sourcePillLabel)}</p>
            </div>
            <div class="locked-pill locked-pill--destination">
              <h3>To</h3>
              <p id="dest-label">${escapeHtml(destPillLabel)}</p>
              <label class="destination-pill-select">
                <span class="sr-only">Select destination warehouse</span>
                <select id="console-destination-select">
                  <option value="">Choose destination</option>
                </select>
              </label>
              <p class="destination-pill-hint">Pick Accountant Offices, Kitchen, or Food Preparation Area before scanning.</p>
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
              <select id="transfer-operator-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Transfers stay locked until a valid operator signs in. Sessions auto-expire after 20 minutes.</p>
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
            <a id="purchase-open" class="button button-outline" href="?view=purchase" role="button">Log Purchase Intake</a>
            <a id="damage-open" class="button button-green" href="?view=damage" role="button">Log Damages</a>
          </div>
        </form>
      </article>

    </section>
  </main>

  <div id="result-toast" class="toast" role="status" aria-live="polite"></div>

  <div id="print-root" aria-hidden="true"></div>

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

  <div id="operator-passcode-modal" aria-hidden="true">
    <form id="operator-passcode-form">
      <h3 id="operator-modal-title">Unlock Console</h3>
      <p id="operator-modal-context">Provide passcode to continue.</p>
      <input type="password" id="operator-passcode-input" placeholder="Scan or type passcode" autocomplete="one-time-code" inputmode="numeric" />
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
              <select id="purchase-operator-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Unlock purchases with the assigned passcode. Sessions auto-expire after 20 minutes.</p>
          </section>
          <h3>Purchase Intake</h3>
          <div class="purchase-grid">
            <label>Supplier
              <select id="purchase-supplier">
                <option value="">Select supplier</option>
              </select>
            </label>
            <div class="reference-field">
              <label>Reference / Invoice #
                <input type="text" id="purchase-reference" placeholder="INV-12345" required />
              </label>
              <div id="reference-numpad" class="virtual-keyboard" aria-hidden="true">
                <!-- Digits Row -->
                <button type="button" data-key="1">1</button>
                <button type="button" data-key="2">2</button>
                <button type="button" data-key="3">3</button>
                <button type="button" data-key="4">4</button>
                <button type="button" data-key="5">5</button>
                <button type="button" data-key="6">6</button>
                <button type="button" data-key="7">7</button>
                <button type="button" data-key="8">8</button>
                <button type="button" data-key="9">9</button>
                <button type="button" data-key="0">0</button>
                <button type="button" data-key="-" aria-label="Dash">-</button>
                <button type="button" data-key="/" aria-label="Slash">/</button>
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
                <button type="button" data-key="'" aria-label="Apostrophe">'</button>
                <!-- Row 4 -->
                <button type="button" class="wide-5" data-action="space">Space</button>
                <button type="button" class="wide-3" data-action="delete">Backspace</button>
                <button type="button" class="wide-5" data-action="clear">Clear</button>
                <button type="button" class="wide-5" data-action="close">Close</button>
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
            <a id="purchase-back" class="button button-outline" href="/Main_Warehouse_Scanner" role="button">Back to Transfers</a>
            <button type="submit" id="purchase-submit">Record Purchase</button>
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
              <select id="damage-operator-select">
                <option value="">Select operator</option>
              </select>
            </label>
            <p class="operator-auth-hint">Damages stay locked until an operator signs in. Auto-lock after 20 minutes.</p>
          </section>
          <h3>Log Damages</h3>
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
            <a id="damage-back" class="button button-outline" href="/Main_Warehouse_Scanner" role="button">Back to Transfers</a>
            <button type="submit" id="damage-submit" class="button-green">Log Damages</button>
          </div>
        </div>
      </form>
    </article>
  </section>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.5/dist/umd/supabase.min.js"></script>
  <script>
    const SUPABASE_URL = ${JSON.stringify(PROJECT_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY)};
    const STOCK_VIEW_NAME = ${JSON.stringify(STOCK_VIEW_NAME)};
    const MULTIPLY_QTY_BY_PACKAGE = ${JSON.stringify(MULTIPLY_QTY_BY_PACKAGE)};
    const INITIAL_WAREHOUSES = ${initialWarehousesJson};
    const OPERATOR_CONTEXT_LABELS = ${operatorContextLabelsJson};
    const DESTINATION_CHOICES = ${destinationChoicesJson};
    const REQUIRED_ROLE = 'transfers';
    const REQUIRED_ROLE_ID = '89147a54-507d-420b-86b4-2089d64faecd';
    const ADMIN_ROLE_ID = '6b9e657a-6131-4a0b-8afa-0ce260f8ed0c';
    const ALLOWED_ROLE_SLUGS = ['transfers', 'admin'];
    const REQUIRED_ROLE_LABEL = 'Transfers';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      document.body.innerHTML = '<main><p style="color:#fecaca">Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p></main>';
    } else {
      const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: true, persistSession: true }
      });

      const initialWarehouses = Array.isArray(INITIAL_WAREHOUSES) ? INITIAL_WAREHOUSES : [];
      const lockedSourceId = ${JSON.stringify(LOCKED_SOURCE_ID)};
      const lockedDestId = ${JSON.stringify(LOCKED_DEST_ID)};

      const state = {
        session: null,
        warehouses: initialWarehouses,
        products: [],
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
          referenceCode: '',
          autoWhatsapp: true
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
        operatorUnlocking: false
      };

      state.lockedSource = state.warehouses.find((w) => w.id === lockedSourceId) ?? null;
      state.lockedDest = null;
      console.log('initial warehouses snapshot', state.warehouses);

      function reportClientReady() {
        console.log('client script ready');
        showLoginInfo('Client ready. Waiting for session...');
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
      const printRoot = document.getElementById('print-root');
      const purchaseOpenButton = document.getElementById('purchase-open');
      const damageOpenButton = document.getElementById('damage-open');
      const purchasePage = document.getElementById('purchase-page');
      const purchaseForm = document.getElementById('purchase-form');
      const purchaseSupplier = document.getElementById('purchase-supplier');
      const purchaseReference = document.getElementById('purchase-reference');
      const purchaseSummaryList = document.getElementById('purchase-summary-list');
      const purchaseSummaryEmpty = document.getElementById('purchase-summary-empty');
      const purchaseWarehouseLabel = document.getElementById('purchase-warehouse-label');
      const purchaseCartWarehouse = document.getElementById('purchase-cart-warehouse');
      const purchaseBackButton = document.getElementById('purchase-back');
      const purchaseSubmit = document.getElementById('purchase-submit');
      const purchaseCartBody = document.getElementById('purchase-cart-body');
      const purchaseCartEmpty = document.getElementById('purchase-cart-empty');
      const purchaseCartCount = document.getElementById('purchase-cart-count');
      const referenceNumpad = document.getElementById('reference-numpad');
      const badgeScanBtn = null;
      const focusLoginWedgeBtn = null;
      const operatorSelects = {
        transfer: document.getElementById('transfer-operator-select'),
        purchase: document.getElementById('purchase-operator-select'),
        damage: document.getElementById('damage-operator-select')
      };
      const destinationSelect = document.getElementById('console-destination-select');
      const operatorStatusLabels = {
        transfer: document.getElementById('transfer-operator-status'),
        purchase: document.getElementById('purchase-operator-status'),
        damage: document.getElementById('damage-operator-status')
      };
      const operatorModal = document.getElementById('operator-passcode-modal');
      const operatorModalForm = document.getElementById('operator-passcode-form');
      const operatorModalTitle = document.getElementById('operator-modal-title');
      const operatorModalContext = document.getElementById('operator-modal-context');
      const operatorPasscodeInput = document.getElementById('operator-passcode-input');
      const operatorModalError = document.getElementById('operator-modal-error');
      const operatorModalCancel = document.getElementById('operator-modal-cancel');

      const VALID_VIEWS = ['transfer', 'purchase', 'damage'];

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
        const isPurchase = view === 'purchase';
        const isDamage = view === 'damage';
        const isTransfer = view === 'transfer';
        if (mainShell) {
          mainShell.style.display = isTransfer ? '' : 'none';
        }
        if (appSection) {
          appSection.style.display = isTransfer ? '' : 'none';
        }
        if (purchasePage) {
          purchasePage.hidden = !isPurchase;
          purchasePage.style.display = isPurchase ? 'flex' : 'none';
          purchasePage.setAttribute('aria-hidden', isPurchase ? 'false' : 'true');
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
        document.body.classList.toggle('view-purchase', view === 'purchase');
        document.body.classList.toggle('view-damage', view === 'damage');
        syncViewVisibility(view);
        syncViewQuery(view);
      }

      applyViewState(document.body.dataset.view === 'damage' ? 'damage' : document.body.dataset.view === 'purchase' ? 'purchase' : 'transfer');

      function setLockedWarehouseLabels(sourceWarehouse, destWarehouse, options = {}) {
        const {
          sourceMissingText = 'Source not found (verify Supabase record)',
          destMissingText = 'Destination not found (verify Supabase record)'
        } = options;
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
      let operatorPasscodeAutoSubmitTimeoutId = null;

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

      function submitQtyForm() {
        if (!qtyForm) return;
        if (typeof qtyForm.requestSubmit === 'function') {
          qtyForm.requestSubmit();
        } else {
          qtyForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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

      async function fetchProductsForWarehouse(warehouseIds) {
        if (!Array.isArray(warehouseIds) || warehouseIds.length === 0) {
          return [];
        }

        const [stockResult, productDefaultsResult, variationDefaultsResult] = await Promise.all([
          supabase.from(STOCK_VIEW_NAME).select('warehouse_id,product_id').in('warehouse_id', warehouseIds),
          supabase
            .from('products')
            .select('id')
            .eq('default_warehouse_id', lockedSourceId)
            .eq('active', true),
          supabase
            .from('product_variations')
            .select('product_id')
            .eq('default_warehouse_id', lockedSourceId)
            .eq('active', true)
        ]);

        if (stockResult.error) throw stockResult.error;
        if (productDefaultsResult.error) throw productDefaultsResult.error;
        if (variationDefaultsResult.error) throw variationDefaultsResult.error;

        const productIds = new Set();
        (stockResult.data ?? []).forEach((row) => {
          if (row?.product_id) productIds.add(row.product_id);
        });
        (productDefaultsResult.data ?? []).forEach((row) => {
          if (row?.id) productIds.add(row.id);
        });
        const productsWithWarehouseVariations = new Set();
        (variationDefaultsResult.data ?? []).forEach((row) => {
          if (row?.product_id) {
            productIds.add(row.product_id);
            productsWithWarehouseVariations.add(row.product_id);
          }
        });

        if (!productIds.size) {
          return [];
        }

        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select('id,name,has_variations,uom,sku,package_contains')
          .in('id', Array.from(productIds))
          .eq('active', true)
          .order('name');
        if (prodErr) throw prodErr;
        return (products ?? []).map((product) => {
          if (!product?.id) return product;
          if (productsWithWarehouseVariations.has(product.id)) {
            return { ...product, has_variations: true };
          }
          return product;
        });
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
          .from('product_variations')
          .select('id,product_id,name,uom,sku,package_contains')
          .in('product_id', productIds)
          .eq('default_warehouse_id', lockedSourceId)
          .eq('active', true)
          .order('name');
        if (error) throw error;
        (data ?? []).forEach((variation) => {
          if (!variation?.product_id) return;
          const list = state.variations.get(variation.product_id) ?? [];
          list.push(variation);
          state.variations.set(variation.product_id, list);
          if (variation.id) {
            indexVariationKey(variation.id, variation);
          }
          if (typeof variation.sku === 'string' && variation.sku.trim()) {
            indexVariationKey(variation.sku, variation);
          }
        });
      }

      function focusActiveScanner() {
        if (!scannerWedge) return;
        if (qtyModal?.style.display === 'flex') return;
        if (document.body.dataset.view === 'purchase') return;
        scannerWedge.focus();
      }

      function shouldHoldScannerFocus(element) {
        const active = element instanceof HTMLElement ? element : document.activeElement;
        if (!active || active === document.body) return false;
        if (active === operatorPasscodeInput) return true;
        if (active === purchaseReference) return true;
        if (active === damageNote) return true;
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
          handleProductScan(payload);
        }, SCAN_FLUSH_DELAY_MS);
      }

      function commitScanBuffer() {
        if (!scannerWedge) return;
        window.clearTimeout(scanFlushTimeoutId);
        const payload = (scanBuffer || scannerWedge.value || '').trim();
        scanBuffer = '';
        scannerWedge.value = '';
        if (!payload) return;
        handleProductScan(payload);
      }

      function formatQtyLabel(qty, uom) {
        const numeric = Number(qty ?? 0);
        const formattedQty = Number.isFinite(numeric) ? numeric : 0;
        const unit = (uom || 'unit').toUpperCase();
        return formattedQty + ' ' + unit;
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
        const multiplier = MULTIPLY_QTY_BY_PACKAGE ? entry.packageSize ?? 1 : 1;
        return qtyNumber * multiplier;
      }

      function describeQty(entry, baseQty, effectiveQty) {
        const unitLabel = entry.uom ?? 'UNIT';
        if (MULTIPLY_QTY_BY_PACKAGE && entry.packageSize > 1) {
          return baseQty + ' case(s) → ' + effectiveQty + ' ' + unitLabel;
        }
        return effectiveQty + ' ' + unitLabel;
      }

      function mapCartSnapshotToLineItems(cartSnapshot) {
        return cartSnapshot.map((item, index) => ({
          productName: item.productName ?? 'Item ' + (index + 1),
          variationName: item.variationName ?? 'Base',
          qty: item.qty,
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
            const base = '• ' + (item.productName ?? 'Item ' + (index + 1)) + variationLabel + ' – ' + qtyLabel + ' ' + unitLabel;
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
          referenceCode: '',
          autoWhatsapp: true
        };
      }

      function resetPurchaseForm() {
        state.purchaseForm = defaultPurchaseFormState();
        if (purchaseSupplier) {
          purchaseSupplier.value = '';
          purchaseSupplier.disabled = state.suppliers.length === 0;
        }
        if (purchaseReference) {
          purchaseReference.value = '';
        }
        syncReferenceValue('');
        updatePurchaseSummary();
      }

      function setMode(next) {
        const target = ['transfer', 'purchase', 'damage'].includes(next) ? next : 'transfer';
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
        });
        updateOperatorStatus('transfer');
        updateOperatorStatus('purchase');
        updateOperatorStatus('damage');
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
        syncDestinationPillLabel();
      }

      function showOperatorPrompt(context) {
        const select = operatorSelects[context];
        if (select) {
          select.focus();
        }
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
        destinationSelect?.focus();
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
        syncDestinationPillLabel();
        enforceOperatorLocks();
      }

      function openOperatorModal(context, operator) {
        if (!operatorModal || !operatorModalForm) return;
        operatorModalTitle.textContent = 'Unlock ' + formatOperatorLabel(context);
        operatorModalContext.textContent = 'Scan passcode for ' + operator.displayName + '.';
        operatorPasscodeInput.value = '';
        operatorModalError.textContent = '';
        window.clearTimeout(operatorPasscodeAutoSubmitTimeoutId);
        state.operatorUnlocking = false;
        state.pendingOperatorSelection = { context, operator };
        operatorModal.classList.add('active');
        operatorModal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => operatorPasscodeInput?.focus(), 10);
      }

      function closeOperatorModal() {
        if (!operatorModal) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && operatorModal.contains(active)) {
          active.blur();
        }
        operatorModal.classList.remove('active');
        operatorModal.setAttribute('aria-hidden', 'true');
        operatorPasscodeInput.value = '';
        operatorModalError.textContent = '';
        window.clearTimeout(operatorPasscodeAutoSubmitTimeoutId);
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
        const passcode = operatorPasscodeInput?.value?.trim();
        if (!passcode) {
          if (!silentMissing) {
            operatorModalError.textContent = 'Passcode required.';
            operatorPasscodeInput?.focus();
          }
          return;
        }
        state.operatorUnlocking = true;
        operatorModalError.textContent = '';
        try {
          const isValid = await verifyOperatorPasscode(pending.operator.id, passcode);
          if (!isValid) {
            operatorModalError.textContent = 'Passcode incorrect.';
            operatorPasscodeInput?.select();
            state.operatorUnlocking = false;
            return;
          }
          setOperatorSession(pending.context, pending.operator);
          closeOperatorModal();
          showResult(formatOperatorLabel(pending.context) + ' unlocked by ' + pending.operator.displayName + '.', false);
        } catch (error) {
          operatorModalError.textContent = error.message ?? 'Unable to verify passcode.';
        } finally {
          state.operatorUnlocking = false;
        }
      }

      function queueOperatorAutoUnlock() {
        window.clearTimeout(operatorPasscodeAutoSubmitTimeoutId);
        const value = operatorPasscodeInput?.value?.trim();
        if (!value) return;
        operatorPasscodeAutoSubmitTimeoutId = window.setTimeout(() => {
          submitOperatorUnlock({ silentMissing: true });
        }, 200);
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

      async function verifyOperatorPasscode(operatorId, passcode) {
        const { data, error } = await supabase.rpc('verify_console_operator_passcode', {
          p_operator_id: operatorId,
          p_passcode: passcode
        });
        if (error) {
          throw new Error(error.message ?? 'Verification failed');
        }
        return data === true;
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
          return;
        }
        purchaseSupplier.disabled = false;
        state.suppliers.forEach((supplier) => {
          if (!supplier?.id) return;
          const option = document.createElement('option');
          option.value = supplier.id;
          option.textContent = supplier.name ?? 'Supplier';
          purchaseSupplier.appendChild(option);
        });
        const hasExisting = state.suppliers.some((supplier) => supplier?.id === state.purchaseForm.supplierId);
        purchaseSupplier.value = hasExisting ? state.purchaseForm.supplierId : '';
        if (!hasExisting) {
          state.purchaseForm.supplierId = '';
        }
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
          const baseText = (item.productName ?? 'Product') + variationLabel + ' — ' + qtyLabel;
          line.textContent = costLabel ? baseText + ' @ ' + costLabel : baseText;
          purchaseSummaryList.appendChild(line);
        });
      }

      function showReferenceNumpad() {
        if (!referenceNumpad) return;
        window.clearTimeout(referenceNumpadHideTimeoutId);
        referenceNumpad.style.display = 'grid';
        referenceNumpad.classList.add('active');
        referenceNumpad.setAttribute('aria-hidden', 'false');
      }

      function hideReferenceNumpad() {
        if (!referenceNumpad) return;
        referenceNumpad.style.display = 'none';
        referenceNumpad.classList.remove('active');
        referenceNumpad.setAttribute('aria-hidden', 'true');
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
          if (referenceNumpad?.contains(active)) return;
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

      function enterPurchaseMode() {
        setMode('purchase');
        applyViewState('purchase');
        updatePurchaseSummary();
        renderCart('purchase');
        if (purchaseSupplier) {
          purchaseSupplier.value = state.purchaseForm.supplierId ?? '';
          purchaseSupplier.disabled = state.suppliers.length === 0;
        }
        if (purchaseReference) {
          purchaseReference.value = state.purchaseForm.referenceCode ?? '';
        }
        hideReferenceNumpad();
        focusActiveScanner();
      }

      function exitPurchaseMode() {
        applyViewState('transfer');
        setMode('transfer');
        hideReferenceNumpad();
        focusActiveScanner();
      }

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

      function renderPrintReceipt(summary, cartSnapshot, options = {}) {
        if (!printRoot || !Array.isArray(cartSnapshot) || !cartSnapshot.length) return;
        const context = options.context ?? 'transfer';
        const isPurchase = context === 'purchase';
        const groups = groupCartItemsForReceipt(cartSnapshot);
        const receipt = document.createElement('div');
        receipt.className = 'receipt';
        const grossFromOptions = Number(options.totalGross);
        const computedGross = cartSnapshot.reduce((sum, entry) => {
          const lineTotal = computeLineTotal(entry);
          return sum + (lineTotal ?? 0);
        }, 0);
        const grossTotal = Number.isFinite(grossFromOptions) ? grossFromOptions : computedGross;

        const header = document.createElement('div');
        header.className = 'receipt-header';
        const logo = document.createElement('img');
        logo.src = '/afterten-logo.png';
        logo.alt = 'AfterTen logo';
        logo.className = 'receipt-logo';
        header.appendChild(logo);

        const title = document.createElement('p');
        title.className = 'receipt-title';
        title.textContent = 'Transfer Ticket';
        header.appendChild(title);

        const metaDate = document.createElement('p');
        metaDate.className = 'receipt-meta';
        metaDate.textContent = 'Date: ' + (summary.dateTime ?? new Date().toLocaleString());
        header.appendChild(metaDate);

        const sourceName = state.lockedSource?.name ?? summary.sourceLabel ?? 'Source warehouse';
        const destName = state.lockedDest?.name ?? summary.destLabel ?? 'Destination warehouse';

        const metaFrom = document.createElement('p');
        metaFrom.className = 'receipt-meta';
        metaFrom.textContent = 'From: ' + sourceName;
        header.appendChild(metaFrom);

        const metaTo = document.createElement('p');
        metaTo.className = 'receipt-meta';
        metaTo.textContent = 'To: ' + destName;
        header.appendChild(metaTo);

        receipt.appendChild(header);

        const linesList = document.createElement('ul');
        linesList.className = 'receipt-lines';

        groups.forEach((group) => {
          const productItem = document.createElement('li');
          productItem.className = 'receipt-product' + (group.variations.length ? ' has-variations' : '');

          const productLine = document.createElement('div');
          productLine.className = 'receipt-line';
          const productBullet = document.createElement('span');
          productBullet.className = 'bullet';
          productBullet.textContent = '•';
          const productName = document.createElement('span');
          productName.className = 'product-name';
          productName.textContent = group.productName ?? 'Product';
          productLine.appendChild(productBullet);
          productLine.appendChild(productName);

          productItem.appendChild(productLine);

          if (!group.variations.length && !isPurchase) {
            const totalQty = group.baseItems.reduce((sum, entry) => sum + Number(entry.qty ?? 0), 0);
            const unit = group.baseItems[0]?.uom ?? 'unit';
            const qtySpan = document.createElement('span');
            qtySpan.className = 'qty';
            qtySpan.textContent = formatQtyLabel(totalQty, unit);
            productLine.appendChild(qtySpan);
          }

          const needsDetailList = isPurchase || group.variations.length > 0;
          if (needsDetailList) {
            const variationList = document.createElement('ul');
            variationList.className = 'variation-list';
            const entries = [];
            const baseEntries = group.baseItems.length ? group.baseItems : [];
            if (isPurchase) {
              baseEntries.forEach((entry) => {
                entries.push({ ...entry, variationName: entry.variationName ?? 'Base' });
              });
            } else if (group.variations.length) {
              const standaloneBase = baseEntries.filter((entry) => !entry.variationId);
              standaloneBase.forEach((entry) => {
                entries.push({ ...entry, variationName: entry.variationName ?? 'Base' });
              });
            }
            const variationEntries = group.variations.map((entry) => ({
              ...entry,
              variationName: entry.variationName ?? 'Variation'
            }));
            entries.push(...variationEntries);

            entries.forEach((entry) => {
              const variationItem = document.createElement('li');
              variationItem.className = 'receipt-variation';
              const variationLine = document.createElement('div');
              variationLine.className = 'receipt-line';
              const bullet = document.createElement('span');
              bullet.className = 'bullet';
              bullet.textContent = '•';
              const label = document.createElement('span');
              label.className = 'variation-name';
              label.textContent = entry.variationName ?? 'Variation';
              const qtySpan = document.createElement('span');
              qtySpan.className = 'qty';
              qtySpan.textContent = formatQtyLabel(entry.qty, entry.uom);
              variationLine.appendChild(bullet);
              variationLine.appendChild(label);
              variationLine.appendChild(qtySpan);
              variationItem.appendChild(variationLine);

              if (isPurchase) {
                const metaLine = document.createElement('div');
                metaLine.className = 'receipt-meta-line receipt-purchase-line';
                const costLabel = formatAmount(entry.unitCost);
                const lineTotal = computeLineTotal(entry);
                const lineTotalLabel = formatAmount(lineTotal);
                const parts = [];
                const qtyDescriptor = formatQtyLabel(entry.qty, entry.uom);
                parts.push('Qty: ' + qtyDescriptor);
                parts.push(costLabel ? 'Cost: ' + costLabel : 'Cost: -');
                parts.push(lineTotalLabel ? 'Line: ' + lineTotalLabel : 'Line: -');
                metaLine.textContent = parts.join(' | ');
                variationItem.appendChild(metaLine);
              }

              variationList.appendChild(variationItem);
            });

            if (variationList.childElementCount > 0) {
              productItem.appendChild(variationList);
            }
          }

          linesList.appendChild(productItem);
        });

        receipt.appendChild(linesList);

        if (isPurchase) {
          const grossLine = document.createElement('p');
          grossLine.className = 'receipt-meta-line';
          const grossLabel = formatAmount(grossTotal) ?? '0.00';
          grossLine.textContent = 'Gross Total: ' + grossLabel;
          receipt.appendChild(grossLine);
        }

        const footer = document.createElement('div');
        footer.className = 'receipt-footer';
        footer.textContent = 'Ref: ' + (summary.reference ?? summary.referenceRaw ?? 'N/A');
        receipt.appendChild(footer);

        printRoot.innerHTML = '';
        printRoot.appendChild(receipt);

        function triggerPrint() {
          document.body.classList.add('print-mode');
          window.setTimeout(() => window.print(), 60);
        }

        if (logo && !logo.complete) {
          logo.addEventListener('load', triggerPrint, { once: true });
          logo.addEventListener('error', triggerPrint, { once: true });
        } else {
          triggerPrint();
        }
      }

      function promptQuantity(product, variation, context = state.mode) {
        if (!qtyModal || !qtyInput) return;
        const packageSize = resolvePackageSize(product, variation);
        const entry = {
          productId: product.id,
          productName: product.name ?? 'Product',
          variationId: variation?.id ?? null,
          variationName: variation?.name ?? null,
          uom: (variation?.uom || product.uom || 'unit').toUpperCase(),
          packageSize,
          unitCost: null
        };
        state.pendingEntry = entry;
        state.pendingEditIndex = null;
        state.pendingContext = context;
        if (qtySubmitButton) {
          qtySubmitButton.textContent = 'Add Item';
        }
        qtyTitle.textContent = variation?.name
          ? (product.name ?? 'Product') + ' – ' + variation.name
          : product.name ?? 'Product';
        qtyUom.textContent = entry.uom;

        updateQtyHint(entry);
        qtyInput.value = '';
        qtyModal.style.display = 'flex';
        setTimeout(() => qtyInput.focus(), 10);
      }

      function closeQtyPrompt() {
        if (!qtyModal) return;
        qtyModal.style.display = 'none';
        state.pendingEntry = null;
        state.pendingEditIndex = null;
        state.pendingContext = state.mode;
        if (qtySubmitButton) {
          qtySubmitButton.textContent = 'Add Item';
        }
        updateQtyHint(null);
        focusActiveScanner();
      }

      function editCartQuantity(context, index) {
        if (!qtyModal || !qtyInput) return;
        const cart = getCart(context);
        const target = cart[index];
        if (!target) return;
        state.pendingEntry = { ...target };
        state.pendingEditIndex = index;
        state.pendingContext = context;
        qtyTitle.textContent = target.variationName
          ? (target.productName ?? 'Product') + ' – ' + target.variationName
          : target.productName ?? 'Product';
        qtyUom.textContent = target.uom ?? 'UNIT';
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

      async function fetchWarehousesMetadata() {
        const params = new URLSearchParams();
        const metadataIds = new Set();
        if (lockedSourceId) metadataIds.add(lockedSourceId);
        (DESTINATION_CHOICES || []).forEach((choice) => {
          if (choice?.id) metadataIds.add(choice.id);
        });
        if (lockedDestId) metadataIds.add(lockedDestId);
        metadataIds.forEach((id) => {
          if (id) params.append('locked_id', id);
        });
        const response = await fetch('/api/warehouses?' + params.toString(), {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(detail || 'Failed to load warehouse metadata.');
        }
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload?.warehouses) ? payload.warehouses : [];
        return list;
      }

      async function fetchOperators() {
        try {
          const { data, error } = await supabase.rpc('console_operator_directory');
          if (error) throw error;
          const list = Array.isArray(data) ? data : [];
          state.operators = list
            .map((entry) => ({
              id: entry?.id,
              displayName: entry?.display_name ?? entry?.name ?? 'Operator',
              authUserId: entry?.auth_user_id ?? null
            }))
            .filter((entry) => entry.id);
          renderOperatorOptions();
        } catch (error) {
          console.warn('Failed to load operator directory', error);
          showResult('Unable to load operator directory. Unlocks unavailable.', true);
          state.operators = [];
          renderOperatorOptions();
        }
      }

      async function fetchSuppliers() {
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
          const { data, error, status } = await supabase
            .from('product_supplier_links')
            .select('supplier:suppliers(id,name,contact_name,contact_phone,contact_email,active)')
            .eq('warehouse_id', warehouseId)
            .eq('active', true);
          if (error) {
            const wrapped = new Error(error.message ?? 'product_supplier_links fetch failed');
            wrapped.status = status;
            wrapped.code = error.code;
            throw wrapped;
          }
          return (Array.isArray(data) ? data : [])
            .map((row) => row?.supplier)
            .filter(Boolean);
        };

        const loadAllSuppliers = async () => {
          const { data, error, status } = await supabase
            .from('suppliers')
            .select('id,name,contact_name,contact_phone,contact_email,active')
            .eq('active', true);
          if (error) {
            const wrapped = new Error(error.message ?? 'suppliers fetch failed');
            wrapped.status = status;
            wrapped.code = error.code;
            throw wrapped;
          }
          return Array.isArray(data) ? data : [];
        };

        let list = [];
        let lastError = null;

        try {
          list = await loadViaRpc(lockedSourceId);
        } catch (error) {
          lastError = error;
          console.warn('Primary supplier fetch failed, attempting link-table fallback', error);
        }

        if (!list.length) {
          try {
            list = await loadViaLinkTable(lockedSourceId);
          } catch (error) {
            lastError = error;
            console.warn('Link-table supplier fetch failed, attempting all active suppliers', error);
          }
        }

        if (!list.length) {
          try {
            list = await loadAllSuppliers();
          } catch (error) {
            lastError = error;
            console.warn('All-suppliers fetch failed', error);
          }
        }

        state.suppliers = list.filter((s) => s && s.active !== false);
        renderSupplierOptions();

        if (!state.suppliers.length && lastError) {
          throw lastError;
        }
      }

      async function refreshMetadata() {
        try {
          const warehouses = await fetchWarehousesMetadata();
          console.log('warehouses payload', warehouses);
          state.warehouses = warehouses ?? [];
          const sourceWarehouse = state.warehouses.find((w) => w.id === lockedSourceId) ?? null;
          state.lockedSource = sourceWarehouse;
          const hydratedDestinations = (DESTINATION_CHOICES || []).map((choice) => {
            const record = state.warehouses.find((w) => w.id === choice.id) ?? null;
            return {
              id: choice.id,
              label: record?.name ?? choice.label ?? 'Destination warehouse'
            };
          });
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
            throw new Error('Destination options missing. Confirm DESTINATION_CHOICES IDs exist in Supabase.');
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
        await preloadVariations(state.products.map((p) => p.id));
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
              variation_id: item.variationId,
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
              (sourceLabel.textContent ?? 'Unknown source') + ' → ' + (destLabel.textContent ?? 'Unknown destination'),
            dateTime: windowLabel,
            window: windowLabel,
            itemsBlock,
            items: lineItems,
            note: null
          };
          showResult('Transfer ' + data + ' submitted successfully.', false);
          notifyWhatsApp(summary).catch((notifyError) => {
            console.warn('WhatsApp notification failed', notifyError);
          });
          renderPrintReceipt(summary, cartSnapshot);
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
          variation_id: item.variationId,
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
        const autoWhatsapp = true;
        const cartSnapshot = cart.map((item) => ({ ...item }));
        const payloadItems = cartSnapshot.map((item) => ({
          product_id: item.productId,
          variation_id: item.variationId,
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
            p_note: null,
            p_auto_whatsapp: autoWhatsapp
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
            route: supplierName + ' → ' + warehouseName,
            dateTime: windowLabel,
            window: windowLabel,
            itemsBlock,
            items: lineItems,
            totalGross: grossTotal
          };

          showResult('Purchase ' + receiptRef + ' recorded successfully.', false);
          if (autoWhatsapp) {
            notifyWhatsApp(summary, 'purchase').catch((notifyError) => {
              console.warn('Purchase WhatsApp notification failed', notifyError);
            });
          }
          renderPrintReceipt(summary, cartSnapshot, { context: 'purchase', totalGross: grossTotal });
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

      async function notifyWhatsApp(summary, context = 'transfer') {
        try {
          const response = await fetch('/api/notify-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, summary })
          });
          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            throw new Error(info.error || 'Unable to ping WhatsApp API');
          }
        } catch (error) {
          const prefix = context === 'purchase' ? 'Purchase logged' : 'Transfer recorded';
          showResult(prefix + ' but WhatsApp alert failed: ' + (error.message || error), true);
        }
      }

      function searchProductsWithScan(raw) {
        const value = raw.trim();
        if (!value) return;
        const normalized = value.toLowerCase();
        const compact = normalizeKey(value);

        let variationMatch =
          state.variationIndex.get(value) ||
          state.variationIndex.get(normalized) ||
          (compact ? state.variationIndex.get(compact) : null);

        if (!variationMatch) {
          variationMatch = Array.from(state.variationIndex.values()).find(
            (variation) => (variation.name ?? '').toLowerCase() === normalized
          );
        }

        if (variationMatch) {
          const product = state.products.find((p) => p.id === variationMatch.product_id);
          if (product) {
            promptQuantity(product, variationMatch);
            showResult('Scan matched variation: ' + (variationMatch.name ?? 'Variation'), false);
            return;
          }
        }

        const productMatch = state.products.find((product) => {
          if (!product) return false;
          const productName = (product.name ?? '').toLowerCase();
          const skuLower = (product.sku ?? '').toLowerCase();
          const skuCompact = normalizeKey(product.sku ?? '');
          if (product.id === value || product.id?.toLowerCase() === normalized) return true;
          if (productName === normalized) return true;
          if (product.sku) {
            if (skuLower === normalized) return true;
            if (compact && skuCompact && skuCompact === compact) return true;
          }
          return false;
        });

        if (productMatch) {
          promptQuantity(productMatch, null);
          showResult('Scan matched product: ' + (productMatch.name ?? 'Product'), false);
          return;
        }

        showResult('No product matched scan: ' + value, true);
      }

      function handleProductScan(payload) {
        if (!payload) return;
        searchProductsWithScan(payload);
      }

      function applyLoginScan(raw) {
        const decoded = raw.trim();
        let parsed = null;
        try {
          parsed = JSON.parse(decoded);
        } catch (err) {
          const parts = decoded.split(/[,|;]/);
          if (parts.length >= 2) {
            parsed = { email: parts[0], password: parts.slice(1).join('') };
          }
        }
        if (!parsed?.email || !parsed?.password) {
          loginStatus.textContent = 'Badge scan unreadable. Expect JSON or email|password.';
          loginStatus.className = 'message error';
          loginStatus.style.display = 'block';
          return;
        }
        document.getElementById('login-email').value = parsed.email;
        document.getElementById('login-password').value = parsed.password;
        loginForm.requestSubmit();
      }

      async function verifyWarehouseTransfersRole() {
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
        const hasRole = effectiveRoles.some((role) => {
          if (!role) return false;
          if (typeof role === 'string') {
            const trimmed = role.trim();
            if (!trimmed) return false;
            if (trimmed === REQUIRED_ROLE_ID || trimmed === ADMIN_ROLE_ID) return true;
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
      window.addEventListener('afterprint', () => {
        document.body.classList.remove('print-mode');
        if (printRoot) {
          printRoot.innerHTML = '';
        }
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
      });

      purchaseReference?.addEventListener('focus', () => {
        showReferenceNumpad();
      });

      referenceNumpad?.addEventListener('mousedown', (event) => {
        // Prevent focus from leaving the input while clicking the on-screen keyboard.
        event.preventDefault();
      });

      purchaseReference?.addEventListener('input', () => {
        syncReferenceValue(purchaseReference.value ?? '');
      });

      document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        const interactingWithReferenceInput = target === purchaseReference || purchaseReference?.contains(target);
        const interactingWithReferenceNumpad = referenceNumpad?.contains(target);
        if (interactingWithReferenceInput || interactingWithReferenceNumpad) {
          // Keep the keyboard open while interacting with it or its source input.
          window.clearTimeout(referenceNumpadHideTimeoutId);
          showReferenceNumpad();
          return;
        }
        hideReferenceNumpad();
      });

      referenceNumpad?.addEventListener('click', (event) => {
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
        if (action === 'space') {
          insertReferenceText(' ');
          purchaseReference?.focus();
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
      referenceNumpad?.querySelectorAll('button[data-action="close"]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          forceCloseReferenceNumpad(event);
        });
        btn.addEventListener('pointerdown', (event) => {
          forceCloseReferenceNumpad(event);
        });
      });

      referenceNumpad?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          forceCloseReferenceNumpad(event);
        }
      });

      qtyForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const pending = state.pendingEntry;
        if (!pending) return;
        const context = state.pendingContext || state.mode;
        const rawQty = Number(qtyInput.value);
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
      document.addEventListener('click', (event) => {
        const target = event.target;
        const clickedReferenceInput = target === purchaseReference || purchaseReference?.contains(target);
        const clickedReferenceNumpad = referenceNumpad?.contains(target);
        const interactingWithDamageNotes =
          target === damageNote || damageNote?.contains(target) || damageNotesKeyboard?.contains(target);
        const interactingWithSupplier = target === purchaseSupplier || purchaseSupplier?.contains(target);

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

      operatorModalForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitOperatorUnlock();
      });

      operatorPasscodeInput?.addEventListener('input', () => {
        operatorModalError.textContent = '';
        queueOperatorAutoUnlock();
      });

      operatorPasscodeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitOperatorUnlock();
        }
      });

      operatorModalCancel?.addEventListener('click', (event) => {
        event.preventDefault();
        cancelPendingOperatorSelection();
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
  const initialView = viewParam === 'purchase' ? 'purchase' : viewParam === 'damage' ? 'damage' : 'transfer';

  const initialWarehouses = await preloadLockedWarehouses();
  const sourceWarehouse = initialWarehouses.find((w) => w.id === LOCKED_SOURCE_ID);
  const destWarehouse = initialWarehouses.find((w) => w.id === LOCKED_DEST_ID);
  const html = createHtml({
    sourcePillLabel: describeLockedWarehouse(sourceWarehouse, 'Loading...'),
    destPillLabel: describeLockedWarehouse(destWarehouse, 'Loading...'),
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
