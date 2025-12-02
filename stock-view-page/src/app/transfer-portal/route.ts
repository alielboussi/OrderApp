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
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: radial-gradient(circle at top, #1f1f1f 0%, #050505 60%);
      color: #f5f5f5;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: clamp(16px, 3vw, 32px);
      overflow-x: hidden;
    }
    main {
      width: min(960px, 100%);
      background: rgba(0, 0, 0, 0.85);
      padding: clamp(28px, 4vw, 40px);
      border-radius: 28px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 25px 80px -30px rgba(0, 0, 0, 0.9);
    }
    h1 {
      margin-top: 0;
      font-size: 2rem;
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
      border-radius: 20px;
      border: 1px solid rgba(255, 43, 72, 0.25);
      padding: clamp(20px, 3vw, 28px);
      margin-top: 24px;
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
      padding: 16px 28px;
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
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: clamp(16px, 2vw, 24px);
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
    #app-section { display: none; }
    body[data-auth="true"] #auth-section { display: none; }
    body[data-auth="true"] #app-section { display: block; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 0.85rem;
      color: #fbecec;
    }
    .scan-instructions {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .scan-instructions p {
      margin: 0;
      color: #f5b7c8;
      font-size: 0.95rem;
    }
    .scanner-hint {
      margin-top: 12px;
      text-align: center;
      font-size: 0.85rem;
      color: #f8b4d9;
    }
    .login-submit {
      display: block;
      margin: 18px auto 0;
      min-width: 180px;
    }
    .locked-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 18px;
      padding: 14px 18px;
    }
    .locked-pill h3 {
      margin: 0 0 4px 0;
      font-size: 1rem;
      letter-spacing: 0.05em;
      color: #ff6b81;
    }
    .cart-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .cart-table th,
    .cart-table td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
      font-size: 0.95rem;
    }
    .cart-table th {
      text-transform: uppercase;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
      color: #f7a8b7;
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
    #result-log {
      background: rgba(0, 0, 0, 0.6);
      border-radius: 16px;
      border: 2px solid rgba(255, 255, 255, 0.08);
      color: #fff;
      padding: 16px;
      min-height: 140px;
    }
    @media (max-width: 1080px) {
      main {
        width: min(900px, 100%);
      }
    }
    @media (max-width: 720px) {
      main {
        padding: 24px;
      }
      button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main>
    <section id="auth-section" class="panel">
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
      <header>
        <h1>Warehouse Transfer Console</h1>
        <p class="subtitle">Blackline interface locked to night shift move requests. Only unit-level transfers are allowed.</p>
      </header>

      <article class="panel">
        <div class="two-cols">
          <div class="locked-pill">
            <h3>From</h3>
            <p id="source-label">Loading...</p>
            <span class="badge">ID: ${LOCKED_SOURCE_ID}</span>
          </div>
          <div class="locked-pill">
            <h3>To</h3>
            <p id="dest-label">Loading...</p>
            <span class="badge">ID: ${LOCKED_DEST_ID}</span>
          </div>
        </div>
        <p class="subtitle" style="margin-top:16px;">Route locked by QA. Contact control if you expect different locations.</p>
      </article>

      <article class="panel">
        <form id="transfer-form">
          <div class="scan-instructions">
            <p>Scan product or variation barcodes from the Main Store Room. A quantity prompt will appear after each successful match.</p>
            <p style="margin-top:6px; font-size:0.85rem; color:#f8d2e0;">Press Enter after typing the quantity to stage the item in the transfer cart. If scanning pauses, click anywhere on the console to re-arm the reader.</p>
          </div>

          <section id="cart-section">
            <div class="two-cols" style="align-items:center; margin-bottom:8px;">
              <div>
                <h3 style="margin:0; text-transform:uppercase; letter-spacing:0.08em; font-size:1rem;">Transfer Cart</h3>
              </div>
              <div style="text-align:right;">
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

          <button type="submit" id="transfer-submit">Submit Transfer</button>
          <textarea id="result-log" rows="4" readonly placeholder="Transfer status will appear here..."></textarea>
        </form>
      </article>
    </section>
  </main>

  <div id="qty-modal">
    <form id="qty-form">
      <h3 id="qty-title">Enter quantity</h3>
      <p id="qty-uom">UNIT</p>
      <input type="number" id="qty-input" min="0" step="0.01" placeholder="0" required />
      <div class="qty-actions">
        <button type="button" id="qty-cancel">Cancel</button>
        <button type="submit">Add Item (Enter)</button>
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
        operatorProfile: null
      };

      const lockedSourceId = ${JSON.stringify(LOCKED_SOURCE_ID)};
      const lockedDestId = ${JSON.stringify(LOCKED_DEST_ID)};

      const loginForm = document.getElementById('login-form');
      const loginStatus = document.getElementById('login-status');
      const loginWedge = document.getElementById('login-wedge');
      const transferForm = document.getElementById('transfer-form');
      const resultLog = document.getElementById('result-log');
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
      const badgeScanBtn = null;
      const focusLoginWedgeBtn = null;

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
          .select('id,name,has_variations,uom')
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

      async function preloadVariations(productIds) {
        state.variations = new Map();
        state.variationIndex = new Map();
        if (!Array.isArray(productIds) || productIds.length === 0) {
          return;
        }
        const { data, error } = await supabase
          .from('product_variations')
          .select('id,product_id,name,uom')
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
            state.variationIndex.set(variation.id, variation);
            state.variationIndex.set(variation.id.toLowerCase(), variation);
          }
        });
      }

      function focusScannerWedge() {
        if (!scannerWedge) return;
        if (qtyModal?.style.display === 'flex') return;
        scannerWedge.focus();
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
            variationCell.textContent = item.variationName ?? 'Base';
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

      async function refreshMetadata() {
        const { data: warehouses, error: whErr } = await supabase
          .from('warehouses')
          .select('id,name,parent_warehouse_id')
          .eq('active', true)
          .order('name');

        if (whErr) throw whErr;
        state.warehouses = warehouses ?? [];
        const sourceWarehouse = state.warehouses.find((w) => w.id === lockedSourceId);
        const destWarehouse = state.warehouses.find((w) => w.id === lockedDestId);
        sourceLabel.textContent = sourceWarehouse ? sourceWarehouse.name : 'Source not found (check Supabase)';
        destLabel.textContent = destWarehouse ? destWarehouse.name : 'Destination not found (check Supabase)';

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
              return '- ' + (item.productName ?? 'Item ' + (index + 1)) + variationLabel + ' - ' + qtyLabel + ' ' + unitLabel;
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
        resultLog.value = new Date().toLocaleString() + ' - ' + message + '\\n' + resultLog.value;
        resultLog.className = isError ? 'message error' : 'message success';
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

        const variationById = state.variationIndex.get(value) || state.variationIndex.get(value.toLowerCase());
        const variationByName = variationById
          ? variationById
          : Array.from(state.variationIndex.values()).find(
              (variation) => (variation.name ?? '').toLowerCase() === normalized
            );

        if (variationByName) {
          const product = state.products.find((p) => p.id === variationByName.product_id);
          if (product) {
            promptQuantity(product, variationByName);
            showResult('Scan matched variation: ' + (variationByName.name ?? 'Variation'), false);
            return;
          }
        }

        const productMatch = state.products.find((product) => {
          if (!product) return false;
          if (product.id === value || product.id?.toLowerCase() === normalized) return true;
          return (product.name ?? '').toLowerCase() === normalized;
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

      scannerWedge?.addEventListener('input', () => {
        handleProductScan(scannerWedge.value.trim());
        scannerWedge.value = '';
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
