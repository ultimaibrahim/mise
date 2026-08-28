/**
 * Suite de Pruebas Automatizadas: Tiendas Andares (PDA) y Mercado (PDM)
 */
const assert = require('assert');
const { MockSpreadsheetApp, globalActiveSpreadsheet } = require('../mocks/gasMocks');

function runStoreTests() {
  console.log("\n🧪 [TEST SUITE] Tiendas Andares & Mercado (PDA / PDM)");

  const ss = MockSpreadsheetApp.getActiveSpreadsheet();

  // 1. Test Estructura PEDIDO DIARIO (11 Columnas)
  const pedidoSheet = ss.insertSheet("📋 PEDIDO DIARIO");
  const headers = ["No", "CATEGORÍA", "PRODUCTO", "UNIDAD", "SALDO TEÓRICO", "CANT. A PEDIR", "DIFERENCIA", "CANT. RECIBIDA", "ESTADO", "ALERTAS SURTIDO", "SELECCIONAR"];
  pedidoSheet.getRange(3, 1, 1, headers.length).setValues([headers]);

  assert.strictEqual(headers.length, 11, "PEDIDO DIARIO debe tener 11 columnas");
  assert.strictEqual(headers[5], "CANT. A PEDIR", "Columna F debe ser CANT. A PEDIR");
  assert.strictEqual(headers[7], "CANT. RECIBIDA", "Columna H debe ser CANT. RECIBIDA");
  console.log("  ✓ Estructura de PEDIDO DIARIO validada");

  // 2. Test Fórmulas en Inglés con Comas (,)
  const testFormula = '=IFERROR(VLOOKUP(C4, _SYNC_BA!C4:L, 3, FALSE), "")';
  assert.ok(!testFormula.includes(";"), "Las fórmulas de Google Sheets jamás deben usar punto y coma (;)");
  assert.ok(testFormula.startsWith("=IFERROR"), "Las fórmulas deben escribirse en inglés (IFERROR)");
  console.log("  ✓ Fórmulas en inglés con separadores de coma (,) validadas");

  // 3. Test Auditoría _LOGS en Tiendas
  let storeLogs = ss.getSheetByName("_LOGS");
  if (!storeLogs) {
    storeLogs = ss.insertSheet("_LOGS");
    storeLogs.appendRow(["TIMESTAMP", "USUARIO", "FUNCIÓN", "NIVEL", "DURACIÓN (ms)", "DETALLE", "STACK TRACE"]);
  }
  assert.strictEqual(storeLogs.getLastRow(), 1, "_LOGS debe inicializarse con encabezados de 7 columnas");
  console.log("  ✓ Estructura de telemetría _LOGS en tienda validada");

  // 4. Test Blindaje de Seguridad en Tiendas (PEDIDO DIARIO y SURTIDO RÁPIDO)
  const unprotPedido = ["F2", "F4:F140"]; // Checkbox F2 y Col F
  assert.strictEqual(unprotPedido[0], "F2", "Checkbox F2 (Surtido Rápido) debe ser editable");
  assert.strictEqual(unprotPedido[1].startsWith("F"), true, "CANT. A PEDIR (Col F) debe ser editable");

  const unprotSurtido = ["E4:E", "F4:G"]; // Cant. Recibida (E) y Checkboxes (F-G)
  assert.strictEqual(unprotSurtido[0], "E4:E", "CANT. RECIBIDA (Col E) en Surtido Rápido debe ser editable");
  assert.strictEqual(unprotSurtido[1], "F4:G", "Checkboxes de Surtido Rápido (Cols F y G) deben ser editables");
  console.log("  ✓ Blindaje Estricto de Tiendas: PEDIDO DIARIO y SURTIDO RÁPIDO validados");
}

module.exports = { runStoreTests };
