import { NextResponse } from 'next/server';

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCKED_SOURCE_ID = '09e0898f-359d-4373-a1ab-d9ba8be5b35b';
const LOCKED_DEST_ID = '9a12caa0-c116-4137-8ea5-74bb0de77fae';
const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_stock_current';

const html = `<!DOCTYPE html>
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
      font-size: 14px;
      --shell-pad: 18px;
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
    }
    main {
      width: min(880px, calc(100vw - 16px));
      min-height: calc(100vh - var(--shell-pad) * 2);
      background: rgba(0, 0, 0, 0.85);
      padding: var(--shell-pad);
      border-radius: 28px;
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
    button {
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
    }
    button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 18px 30px rgba(255, 0, 77, 0.35);
    }
    button:disabled {
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
      position: sticky;
      top: calc(var(--shell-pad) - 6px);
      z-index: 6;
      background: var(--sticky-overlay);
      border-radius: 24px;
      padding: 12px 16px 18px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
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
      gap: 12px;
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
      font-size: 1rem;
      font-weight: 700;
    }
    #cart-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
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
    }
    .cart-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    .cart-table thead th {
      position: sticky;
      top: var(--sticky-stack-offset);
      background: rgba(5, 5, 5, 0.96);
      padding: 10px 12px 16px;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      color: #f7a8b7;
      z-index: 2;
      box-shadow: 0 2px 0 rgba(255, 255, 255, 0.05);
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
      justify-content: center;
      margin-top: 8px;
    }
    .transfer-actions button {
      min-width: clamp(190px, 34%, 260px);
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
        display: block;
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
<body>
  <main>
    <section id="auth-section" class="panel">
      <header class="brand-header">
        <img src="/afterten-logo.png" alt="AfterTen logo" />
      </header>
      <h1>Operator Login</h1>
      <p class="subtitle">Scan your badge QR or use email/password to enter the transfer bay.</p>
      <form id="login-form">
        <div class="two-cols">
          <label>Work Email
            <input type="email" id="login-email" placeholder="you@example.com" required />
          </label>
          <label>Password
            <input type="password" id="login-password" placeholder="********" required />
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
              <p id="source-label">Loading...</p>
            </div>
            <div class="locked-pill">
              <h3>To</h3>
              <p id="dest-label">Loading...</p>
            </div>
          </div>
        </article>
      </div>

      <article class="panel transfer-panel">
        <form id="transfer-form">
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
                  <th scope="col">Qty</th>
                  <th scope="col">UOM</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody id="cart-body"></tbody>
            </table>
            <p id="cart-empty">No items scanned yet.</p>
          </section>

          <input id="scanner-wedge" type="text" autocomplete="off" style="opacity:0; position:absolute; height:0;" />

          <div class="transfer-actions">
            <button type="submit" id="transfer-submit">Submit Transfer</button>
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
        <button type="submit">Add Item</button>
      </div>
    </form>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.5/dist/umd/supabase.min.js"></script>
  <script>
    const SUPABASE_URL = ${JSON.stringify(PROJECT_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY)};
    const STOCK_VIEW_NAME = ${JSON.stringify(STOCK_VIEW_NAME)};
    const REQUIRED_ROLE = 'transfers';
    const ALLOWED_ROLE_SLUGS = ['transfers', 'warehouse_transfers'];
    const REQUIRED_ROLE_ID = '768b2c30-6d0a-4e91-ac62-4ca4ae74b78f';
    const REQUIRED_ROLE_LABEL = 'Transfers';
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      document.body.innerHTML = '<main><p style="color:#fecaca">Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p></main>';
    } else {
      const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { detectSessionInUrl: true, persistSession: true }
      });

      const state = {
        session: null,
        warehouses: [],
        products: [],
        variations: new Map(),
        variationIndex: new Map(),
        cartItems: [],
        pendingEntry: null,
        loading: false,
        operatorProfile: null,
        lockedSource: null,
        lockedDest: null
      };

      const lockedSourceId = ${JSON.stringify(LOCKED_SOURCE_ID)};
      const lockedDestId = ${JSON.stringify(LOCKED_DEST_ID)};

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
      const resultToast = document.getElementById('result-toast');
      let resultToastTimeoutId = null;
      const submitButton = document.getElementById('transfer-submit');
      const sourceLabel = document.getElementById('source-label');
      const destLabel = document.getElementById('dest-label');
      const scannerWedge = document.getElementById('scanner-wedge');
      const cartBody = document.getElementById('cart-body');
      const cartEmpty = document.getElementById('cart-empty');
      const cartCount = document.getElementById('cart-count');
      const qtyModal = document.getElementById('qty-modal');
      const qtyForm = document.getElementById('qty-form');
      const qtyInput = document.getElementById('qty-input');
      const qtyUom = document.getElementById('qty-uom');
      const qtyTitle = document.getElementById('qty-title');
      const qtyCancel = document.getElementById('qty-cancel');
      const qtyNumpad = document.getElementById('qty-numpad');
      const printRoot = document.getElementById('print-root');
      const badgeScanBtn = null;
      const focusLoginWedgeBtn = null;
      let scanBuffer = '';
      let scanFlushTimeoutId = null;
      const SCAN_FLUSH_DELAY_MS = 90;

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
          .select('id,name,has_variations,uom,sku')
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
          .select('id,product_id,name,uom,sku')
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

      function focusScannerWedge() {
        if (!scannerWedge) return;
        if (qtyModal?.style.display === 'flex') return;
        scannerWedge.focus();
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

      function renderPrintReceipt(summary, cartSnapshot) {
        if (!printRoot || !Array.isArray(cartSnapshot) || !cartSnapshot.length) return;
        const groups = groupCartItemsForReceipt(cartSnapshot);
        const receipt = document.createElement('div');
        receipt.className = 'receipt';

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

          if (!group.variations.length) {
            const totalQty = group.baseItems.reduce((sum, entry) => sum + Number(entry.qty ?? 0), 0);
            const unit = group.baseItems[0]?.uom ?? 'unit';
            const qtySpan = document.createElement('span');
            qtySpan.className = 'qty';
            qtySpan.textContent = formatQtyLabel(totalQty, unit);
            productLine.appendChild(qtySpan);
          }

          productItem.appendChild(productLine);

          if (group.variations.length) {
            const variationList = document.createElement('ul');
            variationList.className = 'variation-list';
            const childEntries = [...group.variations];
            const standaloneBase = group.baseItems.filter((entry) => !entry.variationId);
            standaloneBase.forEach((entry) => {
              childEntries.unshift({ ...entry, variationName: 'Base' });
            });
            childEntries.forEach((entry) => {
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
              variationList.appendChild(variationItem);
            });
            productItem.appendChild(variationList);
          }

          linesList.appendChild(productItem);
        });

        receipt.appendChild(linesList);

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

      function promptQuantity(product, variation) {
        if (!qtyModal || !qtyInput) return;
        state.pendingEntry = {
          productId: product.id,
          productName: product.name ?? 'Product',
          variationId: variation?.id ?? null,
          variationName: variation?.name ?? null,
          uom: (variation?.uom || product.uom || 'unit').toUpperCase()
        };
        qtyTitle.textContent = variation?.name
          ? (product.name ?? 'Product') + ' – ' + variation.name
          : product.name ?? 'Product';
        qtyUom.textContent = state.pendingEntry.uom;
        qtyInput.value = '';
        qtyModal.style.display = 'flex';
        setTimeout(() => qtyInput.focus(), 10);
      }

      function closeQtyPrompt() {
        if (!qtyModal) return;
        qtyModal.style.display = 'none';
        state.pendingEntry = null;
        focusScannerWedge();
      }

      function addCartItem(entry) {
        const existing = state.cartItems.find(
          (item) => item.productId === entry.productId && item.variationId === entry.variationId
        );
        if (existing) {
          existing.qty += entry.qty;
        } else {
          state.cartItems.push(entry);
        }
        renderCart();
      }

      function removeCartItem(index) {
        if (index < 0 || index >= state.cartItems.length) return;
        state.cartItems.splice(index, 1);
        renderCart();
      }

      function renderCart() {
        if (!cartBody || !cartEmpty || !cartCount) return;
        cartBody.innerHTML = '';
        if (!state.cartItems.length) {
          cartEmpty.style.display = 'block';
        } else {
          cartEmpty.style.display = 'none';
          state.cartItems.forEach((item, index) => {
                const row = document.createElement('tr');
                const productCell = document.createElement('td');
                productCell.textContent = item.productName ?? 'Product';
                const variationCell = document.createElement('td');
            variationCell.textContent = item.variationName ? item.variationName : '-';
            const qtyCell = document.createElement('td');
            qtyCell.textContent = (item.qty ?? 0).toString();
            const uomCell = document.createElement('td');
            uomCell.textContent = item.uom ?? 'UNIT';
            const actionsCell = document.createElement('td');
            actionsCell.className = 'cart-row-actions';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => {
              removeCartItem(index);
            });
            actionsCell.appendChild(removeBtn);
            row.appendChild(productCell);
            row.appendChild(variationCell);
            row.appendChild(qtyCell);
            row.appendChild(uomCell);
            row.appendChild(actionsCell);
            cartBody.appendChild(row);
          });
        }
        const count = state.cartItems.length;
        cartCount.textContent = count + (count === 1 ? ' item' : ' items');
      }

      async function fetchWarehousesMetadata() {
        const params = new URLSearchParams();
        if (lockedSourceId) params.append('locked_id', lockedSourceId);
        if (lockedDestId) params.append('locked_id', lockedDestId);
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

      async function refreshMetadata() {
        const warehouses = await fetchWarehousesMetadata();
        state.warehouses = warehouses ?? [];
        const sourceWarehouse = state.warehouses.find((w) => w.id === lockedSourceId) ?? null;
        const destWarehouse = state.warehouses.find((w) => w.id === lockedDestId) ?? null;
        const sourceLabelText = sourceWarehouse
          ? (sourceWarehouse.name ?? 'Source warehouse') + (sourceWarehouse.active === false ? ' (inactive)' : '')
          : 'Source not found (verify Supabase record)';
        const destLabelText = destWarehouse
          ? (destWarehouse.name ?? 'Destination warehouse') + (destWarehouse.active === false ? ' (inactive)' : '')
          : 'Destination not found (verify Supabase record)';
        sourceLabel.textContent = sourceLabelText;
        destLabel.textContent = destLabelText;
        state.lockedSource = sourceWarehouse;
        state.lockedDest = destWarehouse;
        if (!sourceWarehouse) {
          throw new Error('Locked source warehouse is missing. Confirm the ID or mark it active in Supabase.');
        }
        if (!destWarehouse) {
          throw new Error('Locked destination warehouse is missing. Confirm the ID or mark it active in Supabase.');
        }

        const targetWarehouseIds = collectDescendantIds(state.warehouses, lockedSourceId);
        state.products = await fetchProductsForWarehouse(targetWarehouseIds);
        await preloadVariations(state.products.map((p) => p.id));
        renderCart();
        focusScannerWedge();
      }

      function showLoginError(message) {
        loginStatus.textContent = message;
        loginStatus.className = 'message error';
        loginStatus.style.display = 'block';
      }

      async function handleLogin(event) {
        event.preventDefault();
        loginStatus.style.display = 'none';
        const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
        const password = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          loginStatus.style.display = 'none';
        } catch (error) {
          showLoginError(error.message ?? 'Unable to sign in');
        }
      }

      async function handleSubmit(event) {
        event.preventDefault();
        if (state.loading) return;
        const sourceId = lockedSourceId;
        const destId = lockedDestId;
        if (!state.cartItems.length) {
          showResult('Scan at least one product before submitting.', true);
          return;
        }

        state.loading = true;
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
        try {
          const cartSnapshot = state.cartItems.map((item) => ({ ...item }));
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
          const lineItems = cartSnapshot.map((item, index) => ({
            productName: item.productName ?? 'Item ' + (index + 1),
            variationName: item.variationName ?? 'Base',
            qty: item.qty,
            unit: item.uom ?? 'unit'
          }));
          const itemsBlock = lineItems
            .map((item, index) => {
              const variationLabel = item.variationName ? ' (' + item.variationName + ')' : '';
              const qtyLabel = item.qty ?? 0;
              const unitLabel = item.unit ?? 'unit';
              return '• ' + (item.productName ?? 'Item ' + (index + 1)) + variationLabel + ' – ' + qtyLabel + ' ' + unitLabel;
            })
            .join('\\n');
          const rawReference = typeof data === 'string' ? data : String(data ?? '');
          const reference = /^\d+$/.test(rawReference) ? rawReference.padStart(10, '0') : rawReference;
          const summary = {
            reference,
            referenceRaw: rawReference,
            processedBy: state.session?.user?.email ?? 'Unknown operator',
            operator: state.session?.user?.email ?? 'Unknown operator',
            sourceLabel: sourceLabel.textContent,
            destLabel: destLabel.textContent,
            route: (sourceLabel.textContent ?? 'Unknown source') + ' -> ' + (destLabel.textContent ?? 'Unknown destination'),
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
          state.cartItems = [];
          renderCart();
        } catch (error) {
          showResult(error.message ?? 'Transfer failed', true);
        } finally {
          state.loading = false;
          submitButton.disabled = false;
          submitButton.textContent = 'Submit Transfer';
        }
      }

      function showResult(message, isError) {
        if (isError) {
          console.warn(message);
        } else {
          console.info(message);
        }
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

      async function notifyWhatsApp(summary) {
        try {
          const response = await fetch('/api/notify-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(summary)
          });
          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            throw new Error(info.error || 'Unable to ping WhatsApp API');
          }
        } catch (error) {
          showResult('Transfer recorded but WhatsApp alert failed: ' + (error.message || error), true);
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
        const roles = Array.isArray(record?.roles) ? record.roles : [];
        const hasRole = roles.some((role) => {
          if (!role) return false;
          if (typeof role === 'string') {
            const trimmed = role.trim();
            if (!trimmed) return false;
            if (trimmed === REQUIRED_ROLE_ID) return true;
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
            return roleId === REQUIRED_ROLE_ID || (slug !== null && ALLOWED_ROLE_SLUGS.includes(slug));
          }
          return false;
        });
        if (!hasRole) {
          const missingRoleError = new Error('WAREHOUSE_ROLE_REQUIRED');
          missingRoleError.code = 'WAREHOUSE_ROLE_REQUIRED';
          throw missingRoleError;
        }
        state.operatorProfile = record ?? null;
        return record;
      }

      async function syncSession(session) {
        state.session = session;
        if (!session) {
          state.operatorProfile = null;
          state.cartItems = [];
          renderCart();
          closeQtyPrompt();
          document.body.dataset.auth = 'false';
          return;
        }
        try {
          await verifyWarehouseTransfersRole();
        } catch (error) {
          state.operatorProfile = null;
          document.body.dataset.auth = 'false';
          if (error.code === 'WAREHOUSE_ROLE_REQUIRED') {
            showLoginError('Your account is not authorized for ' + REQUIRED_ROLE_LABEL + '. Ask an admin to add that role.');
          } else {
            showLoginError(error.message ?? 'Unable to verify permissions. Please try again.');
          }
          try {
            await supabase.auth.signOut();
          } catch (signOutError) {
            console.warn('Sign-out failed after role check issue', signOutError);
          }
          return;
        }

        loginStatus.style.display = 'none';
        document.body.dataset.auth = 'true';
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
          focusScannerWedge();
        }, 50);
      });
      window.addEventListener('afterprint', () => {
        document.body.classList.remove('print-mode');
        if (printRoot) {
          printRoot.innerHTML = '';
        }
      });
      qtyForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const pending = state.pendingEntry;
        if (!pending) return;
        const qtyValue = Number(qtyInput.value);
        if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
          qtyInput.focus();
          return;
        }
        addCartItem({ ...pending, qty: qtyValue });
        showResult(
          'Queued ' + (pending.productName ?? 'Product') + ' - ' + qtyValue + ' ' + (pending.uom ?? 'UNIT'),
          false
        );
        closeQtyPrompt();
      });
      qtyCancel?.addEventListener('click', () => {
        closeQtyPrompt();
      });
      document.addEventListener('click', () => {
        if (document.body.dataset.auth === 'true') {
          focusScannerWedge();
        }
      });
      loginWedge?.addEventListener('input', () => {
        applyLoginScan(loginWedge.value.trim());
        loginWedge.value = '';
      });

      supabase.auth.getSession().then(({ data }) => {
        syncSession(data.session).catch((error) => {
          console.warn('Initial session sync failed', error);
        });
      });

      supabase.auth.onAuthStateChange(async (_event, session) => {
        syncSession(session).catch((error) => {
          console.warn('Auth change sync failed', error);
        });
      });

      loginForm?.addEventListener('submit', handleLogin);
      transferForm?.addEventListener('submit', handleSubmit);
    }
  </script>
</body>
</html>`;

export async function GET() {
  if (!PROJECT_URL || !ANON_KEY) {
    return new NextResponse('Supabase environment variables are missing.', { status: 500 });
  }

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
