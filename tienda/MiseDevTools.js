/**
 * 🧪 MISE DEV TOOLS — Tienda (Andares / Mercado)
 * Herramientas de desarrollo y prueba. SOLO se sube a DEV (scripts/mise-env.js las excluye de PROD).
 * El submenú "🧪 Herramientas de prueba" aparece únicamente si este archivo existe en el proyecto.
 */

function generarDatosPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  
  const count = _getProductCount();
  if (count < 1) return;
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  
  try {
    const rangeF = sheet.getRange(DATA_START_ROW, COL_CANT_PEDIR, count, 1);
    const valuesF = rangeF.getValues();
    
    // Choose 15-25 random products to order
    const numToOrder = Math.floor(Math.random() * 11) + 15; // 15 to 25
    const selectedIndices = new Set();
    while (selectedIndices.size < numToOrder) {
      selectedIndices.add(Math.floor(Math.random() * count));
    }
    
    selectedIndices.forEach(idx => {
      // Set random quantity to order (integers or decimals)
      const isFloat = Math.random() > 0.5;
      const base = Math.floor(Math.random() * 8) + 1; // 1 to 8
      let val = base;
      if (isFloat) {
        const decimals = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
        val = base + decimals[Math.floor(Math.random() * decimals.length)];
      }
      valuesF[idx][0] = val;
    });
    
    rangeF.setValues(valuesF);
    
    SpreadsheetApp.flush();
    MiseLogger.info("generarDatosPrueba", `Se generaron datos de prueba aleatorios para ${numToOrder} productos.`);
    try { SpreadsheetApp.getActive().toast(`Se generaron datos de prueba para ${numToOrder} productos ✓`, "🎲 Prueba", 4); } catch(e) {}
  } catch(err) {
    MiseLogger.error("generarDatosPrueba", err.message);
  } finally {
    lock.releaseLock();
  }
}

function probadorForzarLogSurtido() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PEDIDO);
  if (!sheet) return;
  _registrarLogSurtidoDiario(ss, sheet);
  SpreadsheetApp.getActive().toast("Evidencias guardadas en 🗒 LOG_SURTIDO ✓", "🧪 Prueba", 4);
}
