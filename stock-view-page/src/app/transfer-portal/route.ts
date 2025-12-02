import { NextResponse } from 'next/server';

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LOCKED_SOURCE_ID = '54a93328-4031-4125-8ef7-dc40ada518b2';
const LOCKED_DEST_ID = '9a12caa0-c116-4137-8ea5-74bb0de77fae';

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
    .scanner-controls {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .scanner-controls button {
      flex: 1;
      min-width: 180px;
      background: rgba(255, 0, 77, 0.9);
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
    #scanner-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    #scanner-stage {
      width: min(420px, calc(100vw - 48px));
      border: 2px solid #ff1b2d;
      border-radius: 18px;
      padding: 16px;
      background: #060606;
    }
    #scanner-stage button {
      margin-top: 12px;
      width: 100%;
      background: #ff1b2d;
    }
    #qty-unit-badge {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #ff6b81;
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
            <input type="password" id="login-password" placeholder="••••••••" required />
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
            <p id="source-label">Loading…</p>
            <span class="badge">ID: ${LOCKED_SOURCE_ID}</span>
          </div>
          <div class="locked-pill">
            <h3>To</h3>
            <p id="dest-label">Loading…</p>
            <span class="badge">ID: ${LOCKED_DEST_ID}</span>
          </div>
        </div>
        <p class="subtitle" style="margin-top:16px;">Route locked by QA. Contact control if you expect different locations.</p>
      </article>

      <article class="panel">
        <form id="transfer-form">
          <div class="two-cols">
            <label>Product
              <select id="product-select" required></select>
            </label>
            <label>Variation (if applicable)
              <select id="variation-select" disabled></select>
            </label>
          </div>
          <div class="two-cols">
            <label>Units to Transfer <span id="qty-unit-badge">UNIT</span>
              <input type="number" id="units-input" min="0" step="0.01" placeholder="0" required />
            </label>
            <label>Reference Note (optional)
              <input type="text" id="note-input" placeholder="Batch / reason" />
            </label>
          </div>

          <div class="scanner-controls">
            <button type="button" id="start-camera-scan">Camera Scan (QR + Code128)</button>
            <button type="button" id="focus-wedge-btn">Use Hardware Scanner</button>
          </div>
          <input id="scanner-wedge" type="text" autocomplete="off" style="opacity:0; position:absolute; height:0;" />

          <textarea id="result-log" rows="4" readonly placeholder="Transfer status will appear here..."></textarea>
          <button type="submit" id="transfer-submit">Submit Transfer</button>
        </form>
      </article>
    </section>
  </main>

  <div id="scanner-modal">
    <div id="scanner-stage">
      <div id="scanner-reader" style="width:100%; min-height:320px;"></div>
      <p id="scanner-status" style="text-align:center; margin-top:8px; color:#ff7b95; font-size:0.9rem;">Align code within the frame.</p>
      <button id="scanner-close">Close Scanner</button>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.5/dist/umd/supabase.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.10/minified/html5-qrcode.min.js"></script>
  <script>
    const SUPABASE_URL = ${JSON.stringify(PROJECT_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY)};
    const REQUIRED_ROLE = 'transfers';
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
        loading: false,
        operatorProfile: null
      };

      const lockedSourceId = ${JSON.stringify(LOCKED_SOURCE_ID)};
      const lockedDestId = ${JSON.stringify(LOCKED_DEST_ID)};

      const loginForm = document.getElementById('login-form');
      const loginStatus = document.getElementById('login-status');
      const loginWedge = document.getElementById('login-wedge');
      const transferForm = document.getElementById('transfer-form');
      const productSelect = document.getElementById('product-select');
      const variationSelect = document.getElementById('variation-select');
      const unitsInput = document.getElementById('units-input');
      const noteInput = document.getElementById('note-input');
      const resultLog = document.getElementById('result-log');
      const submitButton = document.getElementById('transfer-submit');
      const qtyUnitBadge = document.getElementById('qty-unit-badge');
      const sourceLabel = document.getElementById('source-label');
      const destLabel = document.getElementById('dest-label');
      const scannerModal = document.getElementById('scanner-modal');
      const scannerClose = document.getElementById('scanner-close');
      const scannerStatus = document.getElementById('scanner-status');
      const scannerWedge = document.getElementById('scanner-wedge');
      const startCameraScan = document.getElementById('start-camera-scan');
      const focusWedgeBtn = document.getElementById('focus-wedge-btn');
      const badgeScanBtn = null;
      const focusLoginWedgeBtn = null;

      let html5Scanner = null;
      let scannerMode = 'product';

      async function refreshMetadata() {
        const [{ data: warehouses, error: whErr }, { data: products, error: prodErr }] = await Promise.all([
          supabase.from('warehouses').select('id,name').eq('active', true).order('name'),
          supabase.from('products').select('id,name,has_variations,uom').eq('active', true).order('name')
        ]);

        if (whErr) throw whErr;
        if (prodErr) throw prodErr;
        state.warehouses = warehouses ?? [];
        state.products = products ?? [];
        const sourceWarehouse = state.warehouses.find((w) => w.id === lockedSourceId);
        const destWarehouse = state.warehouses.find((w) => w.id === lockedDestId);
        sourceLabel.textContent = sourceWarehouse ? sourceWarehouse.name : 'Source not found (check Supabase)';
        destLabel.textContent = destWarehouse ? destWarehouse.name : 'Destination not found (check Supabase)';

        renderSelect(
          productSelect,
          state.products,
          'Select product',
          (p) => p.name + ' (' + (p.uom ? p.uom : 'unit') + ')'
        );
        variationSelect.innerHTML = '<option value="">Select product first</option>';
        variationSelect.disabled = true;
      }

      function renderSelect(selectEl, items, placeholder, formatter) {
        selectEl.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = placeholder;
        selectEl.appendChild(defaultOption);
        items.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = formatter ? formatter(item) : (item.name ?? item.id);
          selectEl.appendChild(option);
        });
      }

      async function handleProductChange() {
        const productId = productSelect.value;
        const product = state.products.find((p) => p.id === productId);
        updateQtyUnitBadge(product, null);
        if (!product || product.has_variations !== true) {
          variationSelect.innerHTML = '<option value="">Base product</option>';
          variationSelect.disabled = true;
          return;
        }

        if (state.variations.has(productId)) {
          applyVariations(state.variations.get(productId));
          return;
        }

        variationSelect.innerHTML = '<option>Loading variations…</option>';
        variationSelect.disabled = true;
        const { data, error } = await supabase
          .from('product_variations')
          .select('id,name,uom')
          .eq('product_id', productId)
          .eq('active', true)
          .order('name');
        if (error) {
          variationSelect.innerHTML = '<option value="">Failed to load</option>';
          return;
        }
        state.variations.set(productId, data ?? []);
        applyVariations(data ?? []);
      }

      function applyVariations(list) {
        variationSelect.innerHTML = '';
        const baseOption = document.createElement('option');
        baseOption.value = '';
        baseOption.textContent = 'Base product';
        variationSelect.appendChild(baseOption);
        list.forEach((v) => {
          const option = document.createElement('option');
          option.value = v.id;
          option.textContent = (v.name ?? 'Variation') + (v.uom ? ' (' + v.uom + ')' : '');
          variationSelect.appendChild(option);
        });
        variationSelect.disabled = false;
      }

      function updateQtyUnitBadge(product, variation) {
        const unit = variation?.uom || product?.uom || 'UNIT';
        qtyUnitBadge.textContent = unit.toUpperCase();
      }

      variationSelect?.addEventListener('change', () => {
        const product = state.products.find((p) => p.id === productSelect.value);
        const variationList = state.variations.get(productSelect.value) ?? [];
        const variation = variationList.find((v) => v.id === variationSelect.value) ?? null;
        updateQtyUnitBadge(product, variation);
      });

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
        const productId = productSelect.value;
        const variationId = variationSelect.disabled ? null : variationSelect.value || null;
        const qty = Number(unitsInput.value);
        const note = noteInput.value.trim() || null;

        if (!productId || !Number.isFinite(qty) || qty <= 0) {
          showResult('Select a product and enter a positive unit quantity.', true);
          return;
        }

        state.loading = true;
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting…';
        try {
          const payload = {
            p_source: sourceId,
            p_destination: destId,
            p_items: [
              {
                product_id: productId,
                variation_id: variationId,
                qty: qty
              }
            ],
            p_note: note
          };
          const { data, error } = await supabase.rpc('transfer_units_between_warehouses', payload);
          if (error) throw error;
          const product = state.products.find((p) => p.id === productId);
          const variation = state.variations.get(productId)?.find((v) => v.id === variationId) ?? null;
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
          const lineItems = [
            {
              productName: product?.name ?? 'Product',
              variationName: variation?.name ?? 'Base',
              qty,
              unit: variation?.uom || product?.uom || 'unit'
            }
          ];
          const itemsBlock = lineItems
            .map((item, index) => {
              const variationLabel = item.variationName ? ' (' + item.variationName + ')' : '';
              const qtyLabel = item.qty ?? 0;
              const unitLabel = item.unit ?? 'unit';
              return '• ' + (item.productName ?? 'Item ' + (index + 1)) + variationLabel + ' — ' + qtyLabel + ' ' + unitLabel;
            })
            .join('\n');
          const rawReference = typeof data === 'string' ? data : String(data ?? '');
          const reference = /^\d+$/.test(rawReference) ? rawReference.padStart(10, '0') : rawReference;
          const summary = {
            reference,
            referenceRaw: rawReference,
            processedBy: state.session?.user?.email ?? 'Unknown operator',
            operator: state.session?.user?.email ?? 'Unknown operator',
            sourceLabel: sourceLabel.textContent,
            destLabel: destLabel.textContent,
            route: (sourceLabel.textContent ?? 'Unknown source') + ' → ' + (destLabel.textContent ?? 'Unknown destination'),
            dateTime: windowLabel,
            window: windowLabel,
            itemsBlock,
            items: lineItems,
            note
          };
          showResult('Transfer ' + data + ' submitted successfully.', false);
          notifyWhatsApp(summary).catch((notifyError) => {
            console.warn('WhatsApp notification failed', notifyError);
          });
          unitsInput.value = '';
          noteInput.value = '';
        } catch (error) {
          showResult(error.message ?? 'Transfer failed', true);
        } finally {
          state.loading = false;
          submitButton.disabled = false;
          submitButton.textContent = 'Submit Transfer';
        }
      }

      function showResult(message, isError) {
        resultLog.value = new Date().toLocaleString() + ' — ' + message + '\n' + resultLog.value;
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

      function openScanner(mode) {
        scannerMode = mode;
        if (!window.Html5Qrcode) {
          alert('Scanner library not loaded. Check network connection.');
          return;
        }
        scannerModal.style.display = 'flex';
        scannerStatus.textContent = 'Align code within the frame.';
        html5Scanner = new Html5Qrcode('scanner-reader');
        html5Scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            handleScanResult(decodedText);
          },
          (errorMessage) => {
            scannerStatus.textContent = errorMessage;
          }
        ).catch((error) => {
          scannerStatus.textContent = error.message ?? 'Unable to access camera';
        });
      }

      function closeScanner() {
        if (html5Scanner) {
          html5Scanner.stop().catch(() => {}).finally(() => {
            html5Scanner.clear();
            html5Scanner = null;
          });
        }
        scannerModal.style.display = 'none';
      }

      function handleScanResult(payload) {
        if (!payload) return;
        if (scannerMode === 'product') {
          searchProductsWithScan(payload);
          closeScanner();
        } else {
          applyLoginScan(payload);
          closeScanner();
        }
      }

      function searchProductsWithScan(value) {
        const normalized = value.trim().toLowerCase();
        const match = state.products.find((p) => p.id === normalized || (p.name ?? '').toLowerCase() === normalized);
        if (match) {
          productSelect.value = match.id;
          productSelect.dispatchEvent(new Event('change'));
          showResult('Product populated from scan: ' + match.name, false);
        } else {
          noteInput.value = value;
          showResult('No product matched scan. Stored in note.', true);
        }
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
            return trimmed.toLowerCase() === REQUIRED_ROLE;
          }
          if (typeof role === 'object') {
            const roleId = typeof role.id === 'string' ? role.id : null;
            const slugSource = typeof role.slug === 'string' ? role.slug : typeof role.name === 'string' ? role.name : null;
            const slug = slugSource ? slugSource.toLowerCase() : null;
            return roleId === REQUIRED_ROLE_ID || slug === REQUIRED_ROLE;
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

      scannerClose?.addEventListener('click', closeScanner);
      startCameraScan?.addEventListener('click', () => openScanner('product'));
      focusWedgeBtn?.addEventListener('click', () => {
        scannerWedge.value = '';
        scannerWedge.focus();
      });
      scannerWedge?.addEventListener('input', () => {
        handleScanResult(scannerWedge.value.trim());
        scannerWedge.value = '';
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
      productSelect?.addEventListener('change', handleProductChange);
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
