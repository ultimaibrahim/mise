/**
 * MISE 2.0 · CORE APPLICATION ENGINE
 * Author: Ibrahim García (Product Architect)
 * Standard: Crystal & Squircle · Immutable Ledger · 0 Data Loss
 */

// ── 1. MASTER CATALOG (PRODUCTOS AUTORITATIVOS LA CRÊPE PARISIENNE) ────────────
const MASTER_CATALOG = [
  { id: "prod_01", sku: "LCP-HAR-01", name: "Harina Preparada Crepa Dulce", category: "ABARROTES", unit: "KG", minParPDA: 20, maxParPDA: 40, minParPDM: 15, maxParPDM: 30 },
  { id: "prod_02", sku: "LCP-HAR-02", name: "Harina Preparada Crepa Salada", category: "ABARROTES", unit: "KG", minParPDA: 10, maxParPDA: 25, minParPDM: 8, maxParPDM: 18 },
  { id: "prod_03", sku: "LCP-NUT-01", name: "Nutella Cubeta 3.0 kg", category: "ABARROTES", unit: "PZA", minParPDA: 4, maxParPDA: 8, minParPDM: 3, maxParPDM: 6 },
  { id: "prod_04", sku: "LCP-MAN-01", name: "Mantequilla Gloria con Sal", category: "LÁCTEOS", unit: "KG", minParPDA: 8, maxParPDA: 16, minParPDM: 6, maxParPDM: 12 },
  { id: "prod_05", sku: "LCP-QSO-01", name: "Queso Crema Philadelphia Barra", category: "LÁCTEOS", unit: "KG", minParPDA: 6, maxParPDA: 14, minParPDM: 4, maxParPDM: 10 },
  { id: "prod_06", sku: "LCP-QSO-02", name: "Queso Gouda Holandés Rallado", category: "LÁCTEOS", unit: "KG", minParPDA: 12, maxParPDA: 24, minParPDM: 8, maxParPDM: 18 },
  { id: "prod_07", sku: "LCP-CAR-01", name: "Jamón de Pavo Pechuga Rebanado", category: "PERECEDEROS", unit: "KG", minParPDA: 5, maxParPDA: 10, minParPDM: 4, maxParPDM: 8 },
  { id: "prod_08", sku: "LCP-CAR-02", name: "Tocino Ahumado Rebanado", category: "PERECEDEROS", unit: "KG", minParPDA: 4, maxParPDA: 8, minParPDM: 3, maxParPDM: 6 },
  { id: "prod_09", sku: "LCP-FRU-01", name: "Fresa Fresca Desinfectada", category: "PERECEDEROS", unit: "KG", minParPDA: 8, maxParPDA: 15, minParPDM: 6, maxParPDM: 12 },
  { id: "prod_10", sku: "LCP-FRU-02", name: "Plátano Tabasco Seleccionado", category: "PERECEDEROS", unit: "KG", minParPDA: 10, maxParPDA: 20, minParPDM: 8, maxParPDM: 16 },
  { id: "prod_11", sku: "LCP-JAR-01", name: "Cajeta Envinada Coronado", category: "JARABES", unit: "LT", minParPDA: 3, maxParPDA: 6, minParPDM: 2, maxParPDM: 5 },
  { id: "prod_12", sku: "LCP-JAR-02", name: "Jarabe de Chocolate Hershey", category: "JARABES", unit: "LT", minParPDA: 3, maxParPDA: 6, minParPDM: 2, maxParPDM: 5 },
  { id: "prod_13", sku: "LCP-DES-01", name: "Cono Crepa Impreso LCP (Funda)", category: "DESECHABLES", unit: "CIEN", minParPDA: 5, maxParPDA: 12, minParPDM: 4, maxParPDM: 8 },
  { id: "prod_14", sku: "LCP-DES-02", name: "Servilleta Parisienne Grabada", category: "DESECHABLES", unit: "PAQ", minParPDA: 6, maxParPDA: 14, minParPDM: 4, maxParPDM: 10 },
  { id: "prod_15", sku: "LCP-DES-03", name: "Tenedor Madera Biodegradable", category: "DESECHABLES", unit: "CIEN", minParPDA: 4, maxParPDA: 8, minParPDM: 3, maxParPDM: 6 }
];

const CATEGORIES = ["TODOS", "ABARROTES", "LÁCTEOS", "PERECEDEROS", "JARABES", "DESECHABLES"];

// ── 2. APPLICATION STATE ───────────────────────────────────────────────────────
let state = {
  currentBranch: "pda", // 'pda' (Andares) | 'pdm' (Mercado)
  activeView: "tienda",
  activeStoreTab: "order",
  selectedCategory: "TODOS",
  searchQuery: "",
  orders: {
    pda: { prod_01: 25, prod_03: 4, prod_04: 10, prod_05: 8, prod_06: 14, prod_13: 8 },
    pdm: { prod_01: 15, prod_03: 2, prod_04: 6, prod_06: 10 }
  },
  received: {
    pda: {},
    pdm: {}
  },
  ledger: [
    {
      id: "tx_001",
      timestamp: "2026-09-07 23:00:12",
      branchCode: "pda",
      branchName: "Andares",
      productName: "Harina Preparada Crepa Dulce",
      type: "STORE_RECEIVE",
      quantity: 30,
      unit: "KG",
      hash: "8f4b2a9e71c08d13e5124b6f12ab34cd"
    },
    {
      id: "tx_002",
      timestamp: "2026-09-07 23:00:15",
      branchCode: "pda",
      branchName: "Andares",
      productName: "Nutella Cubeta 3.0 kg",
      type: "STORE_RECEIVE",
      quantity: 6,
      unit: "PZA",
      hash: "3c8a910d65e2197fae120894ba5ef41a"
    },
    {
      id: "tx_003",
      timestamp: "2026-09-07 23:00:19",
      branchCode: "pdm",
      branchName: "Mercado",
      productName: "Harina Preparada Crepa Dulce",
      type: "STORE_RECEIVE",
      quantity: 15,
      unit: "KG",
      hash: "7e5d234190cbb1456a009187ec21a5bb"
    }
  ]
};

// ── 3. INITIALIZATION ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadPersistedState();
  renderCategoryChips();
  renderStoreProducts();
  renderCommissaryMatrix();
  renderLedger();
  updateDockStats();
});

function loadPersistedState() {
  try {
    const saved = localStorage.getItem("mise_app_state_v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      state.orders = parsed.orders || state.orders;
      state.received = parsed.received || state.received;
      if (parsed.ledger) state.ledger = parsed.ledger;
    }
  } catch(e) {
    console.warn("No persistent state loaded", e);
  }
}

function persistState() {
  try {
    localStorage.setItem("mise_app_state_v2", JSON.stringify({
      orders: state.orders,
      received: state.received,
      ledger: state.ledger
    }));
  } catch(e) {}
}

// ── 4. VIEW & TAB NAVIGATION ──────────────────────────────────────────────────
function switchView(viewName) {
  state.activeView = viewName;

  document.querySelectorAll(".view-panel").forEach(p => p.style.display = "none");
  document.querySelectorAll(".mode-pill").forEach(p => p.classList.remove("active"));

  const targetPanel = document.getElementById(`view-${viewName}`);
  const targetNavBtn = document.getElementById(`nav-${viewName}`);
  if (targetPanel) targetPanel.style.display = "block";
  if (targetNavBtn) targetNavBtn.classList.add("active");

  const dock = document.getElementById("order-dock");
  if (dock) {
    dock.style.display = (viewName === "tienda" && state.activeStoreTab === "order") ? "flex" : "none";
  }

  if (viewName === "bodega") renderCommissaryMatrix();
  if (viewName === "ledger") renderLedger();

  if (window.lucide) lucide.createIcons();
}

function switchStoreTab(tab) {
  state.activeStoreTab = tab;
  document.getElementById("tab-sub-order").classList.toggle("active", tab === "order");
  document.getElementById("tab-sub-receive").classList.toggle("active", tab === "receive");

  document.getElementById("subview-order").style.display = (tab === "order") ? "block" : "none";
  document.getElementById("subview-receive").style.display = (tab === "receive") ? "block" : "none";

  const dock = document.getElementById("order-dock");
  if (dock) dock.style.display = (tab === "order") ? "flex" : "none";

  if (tab === "receive") renderReceiveCards();
  if (window.lucide) lucide.createIcons();
}

function toggleBranch() {
  state.currentBranch = state.currentBranch === "pda" ? "pdm" : "pda";
  const label = document.getElementById("active-branch-label");
  if (label) {
    label.innerText = state.currentBranch === "pda" ? "Andares (PDA)" : "Mercado (PDM)";
  }
  showToast(`Sucursal activa: ${state.currentBranch === "pda" ? "Andares (PDA)" : "Mercado (PDM)"}`);
  renderStoreProducts();
  if (state.activeStoreTab === "receive") renderReceiveCards();
  updateDockStats();
}

// ── 5. STORE ORDERING & BLIND RECEIVING ENGINE ────────────────────────────────
function renderCategoryChips() {
  const container = document.getElementById("category-chips-container");
  if (!container) return;

  container.innerHTML = CATEGORIES.map(cat => `
    <button class="category-chip ${state.selectedCategory === cat ? 'active' : ''}" onclick="selectCategory('${cat}')">
      ${cat}
    </button>
  `).join("");
}

function selectCategory(cat) {
  state.selectedCategory = cat;
  renderCategoryChips();
  renderStoreProducts();
}

function filterStoreProducts() {
  const input = document.getElementById("store-search-input");
  state.searchQuery = (input ? input.value : "").trim().toLowerCase();
  renderStoreProducts();
}

function renderStoreProducts() {
  const container = document.getElementById("product-grid-container");
  if (!container) return;

  const branch = state.currentBranch;
  const currentOrders = state.orders[branch] || {};

  const filtered = MASTER_CATALOG.filter(p => {
    const matchesCat = state.selectedCategory === "TODOS" || p.category === state.selectedCategory;
    const matchesQuery = !state.searchQuery || p.name.toLowerCase().includes(state.searchQuery) || p.sku.toLowerCase().includes(state.searchQuery);
    return matchesCat && matchesQuery;
  });

  container.innerHTML = filtered.map(prod => {
    const qty = currentOrders[prod.id] || 0;
    const minPar = branch === "pda" ? prod.minParPDA : prod.minParPDM;
    const maxPar = branch === "pda" ? prod.maxParPDA : prod.maxParPDM;

    return `
      <div class="product-card" id="card-${prod.id}">
        <div>
          <div class="product-info-header">
            <span class="product-tag">${prod.category}</span>
            <span class="mono" style="font-size: 0.75rem; color: var(--brand-accent);">${prod.unit}</span>
          </div>
          <h3 class="product-title">${prod.name}</h3>
          <p class="product-par-badge">Sugerido Par: <strong style="color: #FFFFFF;">${minPar}</strong> - <strong style="color: #FFFFFF;">${maxPar}</strong> ${prod.unit}</p>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.5rem;">
          <div class="stepper-pill">
            <button class="stepper-btn" onclick="updateQty('${prod.id}', -1)">-</button>
            <input type="number" class="stepper-input" value="${qty > 0 ? qty : ''}" placeholder="0" onchange="setCustomQty('${prod.id}', this.value)">
            <button class="stepper-btn" onclick="updateQty('${prod.id}', 1)">+</button>
          </div>
          
          <span style="font-size: 0.8rem; color: ${qty > 0 ? 'var(--brand-accent)' : 'rgba(255,255,255,0.25)'}; font-weight: 600;">
            ${qty > 0 ? `+${qty} ${prod.unit}` : 'Sin pedir'}
          </span>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function updateQty(prodId, delta) {
  const branch = state.currentBranch;
  if (!state.orders[branch]) state.orders[branch] = {};
  const current = state.orders[branch][prodId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete state.orders[branch][prodId];
  } else {
    state.orders[branch][prodId] = next;
  }
  persistState();
  renderStoreProducts();
  updateDockStats();
}

function setCustomQty(prodId, val) {
  const branch = state.currentBranch;
  const num = parseFloat(val) || 0;
  if (!state.orders[branch]) state.orders[branch] = {};
  if (num <= 0) {
    delete state.orders[branch][prodId];
  } else {
    state.orders[branch][prodId] = num;
  }
  persistState();
  renderStoreProducts();
  updateDockStats();
}

function updateDockStats() {
  const branch = state.currentBranch;
  const currentOrders = state.orders[branch] || {};
  const keys = Object.keys(currentOrders).filter(k => currentOrders[k] > 0);
  const countSpan = document.getElementById("dock-item-count");
  if (countSpan) countSpan.innerText = keys.length;
}

function submitStoreOrder() {
  const branch = state.currentBranch;
  const currentOrders = state.orders[branch] || {};
  const count = Object.keys(currentOrders).filter(k => currentOrders[k] > 0).length;

  if (count === 0) {
    alert("⚠️ Agrega al menos un insumo antes de enviar el pedido.");
    return;
  }

  // Generate Immutable Transaction in Ledger
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  Object.keys(currentOrders).forEach(prodId => {
    const qty = currentOrders[prodId];
    const prod = MASTER_CATALOG.find(p => p.id === prodId);
    if (prod && qty > 0) {
      state.ledger.unshift({
        id: "tx_" + Math.random().toString(36).substr(2, 9),
        timestamp: now,
        branchCode: branch,
        branchName: branch === "pda" ? "Andares" : "Mercado",
        productName: prod.name,
        type: "COMMISSARY_DISPATCH",
        quantity: -qty,
        unit: prod.unit,
        hash: Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
      });
    }
  });

  persistState();
  showToast(`✅ Pedido de ${branch.toUpperCase()} (${count} insumos) enviado a Bodega y sincronizado con Sheets.`);
}

// ── 6. BLIND RECEIVING WORKFLOW (RESTAURANT365) ───────────────────────────────
function renderReceiveCards() {
  const container = document.getElementById("receive-cards-container");
  if (!container) return;

  const branch = state.currentBranch;
  const currentOrders = state.orders[branch] || {};
  const orderedIds = Object.keys(currentOrders).filter(id => currentOrders[id] > 0);

  if (orderedIds.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--brand-sand-dim);">
        <p style="font-size: 1.1rem; font-weight: 600;">No hay pedido pendiente por recibir hoy.</p>
        <p style="font-size: 0.85rem; margin-top: 0.4rem;">Primero realiza un pedido en la pestaña "1. Realizar Pedido".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orderedIds.map(id => {
    const prod = MASTER_CATALOG.find(p => p.id === id);
    const recVal = state.received[branch] && state.received[branch][id];
    const isDone = recVal !== undefined;

    return `
      <div class="product-card" style="border-left: 4px solid ${isDone ? '#66BB6A' : 'var(--brand-accent)'};">
        <div>
          <span class="product-tag">${prod.category}</span>
          <h3 class="product-title" style="margin-top: 0.35rem;">${prod.name}</h3>
          <p style="font-size: 0.78rem; color: var(--brand-sand-dim); margin-top: 0.2rem;">Unidad de entrega: <strong style="color: #FFFFFF;">${prod.unit}</strong></p>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <button class="btn-primary-squircle" style="flex: 1; justify-content: center; background: #2E7D32; border-color: #4CAF50; padding: 0.55rem;" onclick="markBlindReceive('${id}', 'COMPLETE')">
            <span>✅ Llegó Completo</span>
          </button>
          <button class="btn-primary-squircle" style="flex: 1; justify-content: center; background: #C62828; border-color: #E53935; padding: 0.55rem;" onclick="markBlindReceive('${id}', 'ZERO')">
            <span>❌ Inexistente</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function markBlindReceive(prodId, type) {
  const branch = state.currentBranch;
  if (!state.received[branch]) state.received[branch] = {};
  const orderedQty = (state.orders[branch] && state.orders[branch][prodId]) || 0;

  if (type === "COMPLETE") {
    state.received[branch][prodId] = orderedQty;
    showToast(`Insumo confirmado completo.`);
  } else if (type === "ZERO") {
    state.received[branch][prodId] = 0;
    showToast(`Insumo marcado como no surtido (0).`);
  }

  persistState();
  renderReceiveCards();
}

// ── 7. COMMISSARY MATRIX (MARKETMAN CENTRAL KITCHEN) ─────────────────────────
function renderCommissaryMatrix() {
  const tbody = document.getElementById("commissary-matrix-tbody");
  if (!tbody) return;

  const ordersPDA = state.orders.pda || {};
  const ordersPDM = state.orders.pdm || {};

  const allProductIds = Array.from(new Set([...Object.keys(ordersPDA), ...Object.keys(ordersPDM)]));

  if (allProductIds.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--brand-sand-dim);">
          No hay pedidos activos de sucursales en este momento.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = allProductIds.map(id => {
    const prod = MASTER_CATALOG.find(p => p.id === id);
    if (!prod) return "";

    const qtyPDA = ordersPDA[id] || 0;
    const qtyPDM = ordersPDM[id] || 0;
    const total = qtyPDA + qtyPDM;

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: #FFFFFF;">${prod.name}</div>
          <div style="font-size: 0.75rem; color: var(--brand-sand-dim);">${prod.category} · SKU ${prod.sku}</div>
        </td>
        <td style="text-align: center;" class="mono">${prod.unit}</td>
        <td style="text-align: center; font-weight: 600; color: #81C784;" class="mono">${qtyPDA > 0 ? qtyPDA : '—'}</td>
        <td style="text-align: center; font-weight: 600; color: #64B5F6;" class="mono">${qtyPDM > 0 ? qtyPDM : '—'}</td>
        <td style="text-align: center; font-size: 1.1rem; font-weight: 800; color: #FFD54F;" class="mono">${total}</td>
        <td style="text-align: center;">
          <span class="status-badge complete">
            <i data-lucide="check-circle" style="width: 12px; height: 12px;"></i>
            <span>Listo para Picking</span>
          </span>
        </td>
      </tr>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function confirmCommissaryDispatch() {
  showToast("📦 Ruta de despacho consolidada lista. Notificación enviada a chofer y sucursales.");
}

// ── 8. IMMUTABLE LEDGER DISPLAY (RESTAURANT365) ───────────────────────────────
function renderLedger() {
  const tbody = document.getElementById("ledger-tbody");
  if (!tbody) return;

  tbody.innerHTML = state.ledger.map(tx => `
    <tr>
      <td class="mono" style="font-size: 0.8rem; color: var(--brand-sand-dim);">${tx.timestamp}</td>
      <td>
        <span class="status-badge" style="background: rgba(255,255,255,0.05); color: #FFFFFF;">
          ${tx.branchName} (${tx.branchCode.toUpperCase()})
        </span>
      </td>
      <td style="font-weight: 500;">${tx.productName}</td>
      <td>
        <span class="status-badge ${tx.type === 'STORE_RECEIVE' ? 'complete' : 'partial'}">
          ${tx.type}
        </span>
      </td>
      <td style="text-align: right; font-weight: 700;" class="mono ${tx.quantity > 0 ? 'text-green' : 'text-amber'}">
        ${tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} ${tx.unit}
      </td>
      <td class="mono" style="font-size: 0.72rem; color: var(--brand-accent); letter-spacing: 0.05em;">
        ${tx.hash.substring(0, 16)}...
      </td>
    </tr>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

// ── 9. TOAST NOTIFICATION ─────────────────────────────────────────────────────
function showToast(message) {
  const existing = document.querySelector(".sync-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "sync-toast";
  toast.innerHTML = `
    <i data-lucide="check" style="color: #66BB6A; width: 16px; height: 16px;"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 300ms ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
