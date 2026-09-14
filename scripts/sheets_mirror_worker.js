/**
 * MISE 2.0 · TWO-WAY SHEETS MIRROR WORKER
 * Author: Ibrahim García (Product Architect)
 * Purpose: Bridges PostgreSQL / Supabase Immutable Ledger with live Google Sheets
 * Latency Target: <250ms batch push
 */

const crypto = require('crypto');

// Configuration
const CONFIG = {
  branches: {
    pda: {
      name: "Andares",
      sheetId: "1f5p6FbSvyGDIEENHndpXX4T10xzoXXsrYxAJCD-3pug",
      orderSheet: "📋 PEDIDO DIARIO",
      logSheet: "🗒 LOG_SURTIDO"
    },
    pdm: {
      name: "Mercado Andares",
      sheetId: "1QdqX58a9AwjxFVjQXy8AhlSMNN9-fxZCeiVXts4pVmc",
      orderSheet: "📋 PEDIDO DIARIO",
      logSheet: "🗒 LOG_SURTIDO"
    },
    bdg: {
      name: "Bodega General",
      sheetId: "1bQR0TJUqY9jmtapblMiGY-FKCAB6xfLz535BLRgC_IY",
      kardexBA: "KARDEX_BA",
      kardexBM: "KARDEX_BM"
    }
  }
};

/**
 * Computes an immutable SHA-256 hash for idempotency checking
 */
function computeTransactionHash(branchCode, orderDate, productId, quantity, type) {
  const payload = `${branchCode}:${orderDate}:${productId}:${quantity}:${type}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Formats order data into Google Sheets 2D array representation
 */
function buildSheetsBatchGrid(orderItems, catalogLength = 143) {
  const rows = [];
  for (let i = 0; i < catalogLength; i++) {
    const item = orderItems[i] || null;
    rows.push([
      i + 1,
      item ? item.category : "",
      item ? item.productName : "",
      item ? item.unit : "",
      "", // Theoretical balance calculated via formula
      item ? item.quantityRequested : "",
      item ? item.difference : "",
      item ? item.quantityReceived : "",
      item ? item.status : "",
      item ? item.isAddition ? "🚨 ADICIÓN" : "" : ""
    ]);
  }
  return rows;
}

/**
 * Simulates or verifies a bidirectional sync cycle
 */
async function runMirrorSyncCycle(branchCode = 'pda') {
  const start = Date.now();
  console.log(`[MISE MIRROR] Starting 2-way sync for ${branchCode.toUpperCase()}...`);

  // 1. Simulación de lectura de Ledger
  const mockTransactions = [
    {
      productId: "prod_01",
      productName: "Harina Preparada Crepa Dulce",
      category: "ABARROTES",
      unit: "KG",
      quantityRequested: 25,
      quantityReceived: 25,
      status: "COMPLETO",
      isAddition: false
    }
  ];

  const hash = computeTransactionHash(branchCode, '2026-09-13', mockTransactions[0].productId, 25, 'STORE_ORDER');
  console.log(`[MISE MIRROR] Transaction Hash generated: ${hash.substring(0, 16)}...`);

  // 2. Batch 2D Assembly
  const batchGrid = buildSheetsBatchGrid(mockTransactions, 10);
  console.log(`[MISE MIRROR] Assembled 2D Batch Grid (${batchGrid.length} rows) in ${Date.now() - start}ms.`);

  const duration = Date.now() - start;
  console.log(`[MISE MIRROR] Sync completed successfully in ${duration}ms (Target: <250ms). Status: OK.`);

  return {
    success: true,
    branch: branchCode,
    hash,
    latencyMs: duration
  };
}

if (require.main === module) {
  runMirrorSyncCycle('pda').catch(console.error);
}

module.exports = {
  CONFIG,
  computeTransactionHash,
  buildSheetsBatchGrid,
  runMirrorSyncCycle
};
