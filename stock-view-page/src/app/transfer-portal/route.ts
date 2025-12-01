import { NextResponse } from 'next/server';

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
      color-scheme: light dark;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    body {
      margin: 0;
      background: #0b111a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 24px;
    }
    main {
      width: min(960px, 100%);
      background: #111827;
      padding: 32px;
      border-radius: 18px;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.65);
    }
    h1 {
      margin-top: 0;
      font-size: 1.85rem;
      margin-bottom: 0.25rem;
    }
    p.subtitle {
      margin-top: 0;
      color: #94a3b8;
      font-size: 0.95rem;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 16px;
    }
    label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #cbd5f5;
    }
    input, select, textarea {
      font: inherit;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.75);
      color: inherit;
    }
    button {
      font: inherit;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: white;
      border: none;
      border-radius: 999px;
      padding: 14px 22px;
      cursor: pointer;
      font-weight: 600;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 20px rgba(37, 99, 235, 0.35);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }
    .card {
      background: rgba(15, 23, 42, 0.65);
      border-radius: 16px;
      padding: 20px;
      border: 1px solid rgba(148, 163, 184, 0.1);
    }
    .two-cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .message {
      padding: 14px 16px;
      border-radius: 12px;
      font-size: 0.95rem;
    }
    .message.success {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #bbf7d0;
    }
    .message.error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fecaca;
    }
    #app-section {
      display: none;
    }
    body[data-auth="true"] #auth-section { display: none; }
    body[data-auth="true"] #app-section { display: block; }
  </style>
</head>
<body>
  <main>
    <section id="auth-section">
      <h1>Transfer Portal Access</h1>
      <p class="subtitle">Sign in with your AfterTen credentials to load active warehouses and move stock in unit quantities.</p>
      <form id="login-form" class="card">
        <div class="two-cols">
          <label>Work Email
            <input type="email" id="login-email" placeholder="you@example.com" required />
          </label>
          <label>Password
            <input type="password" id="login-password" placeholder="••••••••" required />
          </label>
        </div>
        <button type="submit">Sign in</button>
        <div id="login-status" class="message" style="display:none"></div>
      </form>
    </section>

    <section id="app-section">
      <header>
        <h1>Warehouse Transfer</h1>
        <p class="subtitle">Submit movements in unit quantities only (no cases / packs). The portal enforces your Supabase permissions.</p>
      </header>

      <article class="card">
        <form id="transfer-form">
          <div class="two-cols">
            <label>Source Warehouse
              <select id="source-select" required></select>
            </label>
            <label>Destination Warehouse
              <select id="dest-select" required></select>
            </label>
          </div>

          <div class="two-cols">
            <label>Product
              <select id="product-select" required></select>
            </label>
            <label>Variation (if applicable)
              <select id="variation-select" disabled></select>
            </label>
          </div>

          <div class="two-cols">
            <label>Units to Transfer (not cases)
              <input type="number" id="units-input" min="0" step="0.01" placeholder="0" required />
            </label>
            <label>Reference Note (optional)
              <input type="text" id="note-input" placeholder="Batch / reason" />
            </label>
          </div>

          <textarea id="result-log" rows="4" readonly style="resize:vertical" placeholder="Transfer status will appear here..."></textarea>
          <button type="submit" id="transfer-submit">Submit Transfer</button>
        </form>
      </article>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.5/dist/umd/supabase.min.js"></script>
  <script>
    const SUPABASE_URL = ${JSON.stringify(PROJECT_URL)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(ANON_KEY)};
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
        loading: false
      };

      const loginForm = document.getElementById('login-form');
      const loginStatus = document.getElementById('login-status');
      const transferForm = document.getElementById('transfer-form');
      const sourceSelect = document.getElementById('source-select');
      const destSelect = document.getElementById('dest-select');
      const productSelect = document.getElementById('product-select');
      const variationSelect = document.getElementById('variation-select');
      const unitsInput = document.getElementById('units-input');
      const noteInput = document.getElementById('note-input');
      const resultLog = document.getElementById('result-log');
      const submitButton = document.getElementById('transfer-submit');

      async function refreshMetadata() {
        const [{ data: warehouses, error: whErr }, { data: products, error: prodErr }] = await Promise.all([
          supabase.from('warehouses').select('id,name').eq('active', true).order('name'),
          supabase.from('products').select('id,name,has_variations,uom').eq('active', true).order('name')
        ]);

        if (whErr) throw whErr;
        if (prodErr) throw prodErr;
        state.warehouses = warehouses ?? [];
        state.products = products ?? [];
        renderSelect(sourceSelect, state.warehouses, 'Select source');
        renderSelect(destSelect, state.warehouses, 'Select destination');
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
          loginStatus.textContent = error.message ?? 'Unable to sign in';
          loginStatus.className = 'message error';
          loginStatus.style.display = 'block';
        }
      }

      async function handleSubmit(event) {
        event.preventDefault();
        if (state.loading) return;
        const sourceId = sourceSelect.value;
        const destId = destSelect.value;
        const productId = productSelect.value;
        const variationId = variationSelect.disabled ? null : variationSelect.value || null;
        const qty = Number(unitsInput.value);
        const note = noteInput.value.trim() || null;

        if (!sourceId || !destId || sourceId === destId) {
          showResult('Source and destination warehouses must be different.', true);
          return;
        }
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
          showResult('Transfer ' + data + ' submitted successfully.', false);
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

      supabase.auth.onAuthStateChange(async (_event, session) => {
        state.session = session;
        if (session) {
          document.body.dataset.auth = 'true';
          try {
            await refreshMetadata();
          } catch (error) {
            showResult(error.message ?? 'Failed to load metadata', true);
          }
        } else {
          document.body.dataset.auth = 'false';
        }
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
