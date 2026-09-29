/**
 * Suite de Pruebas: 🗒 LOG_SURTIDO de tienda (código real en VM) con las filas reales del 28/sep:
 * estado "#NAME?", "0 pedido · 1 recibido · SIN_REGISTRO", encabezado sustituido por una hora y EsAdición retirada.
 */
const assert = require("assert");
const { crearContextoTienda } = require("../mocks/tiendaVm");

function runLogSurtidoTests() {
  console.log("\n🧪 [TEST SUITE] 🗒 LOG_SURTIDO: estado deducido, encabezado garantizado y sin EsAdición");
  const { ss, sandbox } = crearContextoTienda("pda", "miseAuthPDA.js");
  const pedido = ss.insertSheet("📋 PEDIDO DIARIO");
  pedido.getRange(4, 1, 4, 11).setValues([
    [1, "REF", "Concentrado de frutos rojos", "LT", 0, 1, "", 0, "#NAME?", "", ""],
    [2, "REF", "Concentrado de mango",        "LT", 0, 1, "", 1, "#NAME?", "", ""],
    [3, "REF", "Concentrado de limonada rosa", "LT", 0, 0, "", 1, "",      "", ""],
    [4, "REF", "Concentrado mango maracuyá",  "LT", 0, 2, "", 1, "",       "🚨 ADICIÓN", ""]
  ]);
  const log = ss.insertSheet("🗒 LOG_SURTIDO");
  log.getRange(1, 1, 1, 8).setValues([["8:03:07 a.m.", "Andares", "Vaso 20 oz frío", "DESECHABLES", 4, 4, "COMPLETO", "NO"]]); // encabezado perdido

  sandbox._registrarLogSurtidoDiario(ss, pedido);
  const enc = log.getRange(1, 1, 1, 8).getValues()[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(enc)), ["Fecha", "Bodega", "Producto", "Categoría", "Cant.Pedida", "Cant.Recibida", "Estado", ""], "Encabezado repuesto, 7 columnas");
  assert.strictEqual(log.getRange(2, 3).getValue(), "Vaso 20 oz frío", "La fila que ocupaba el encabezado se conserva (insertada abajo)");
  const filas = log.getRange(3, 3, 4, 6).getValues().map(r => [r[0], r[2], r[3], r[4], r[5]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(filas)), [
    ["Concentrado de frutos rojos", 1, 0, "SIN_REGISTRO", ""],
    ["Concentrado de mango", 1, 1, "COMPLETO", ""],
    ["Concentrado de limonada rosa", 0, 1, "EXCEDENTE", ""],
    ["Concentrado mango maracuyá", 2, 1, "PARCIAL", ""]
  ], "Estados deducidos de la cantidad; #NAME? no cuenta; sin columna EsAdición");
  console.log("  ✓ Filas reales: #NAME? → estado deducido, recibido > 0 nunca es SIN_REGISTRO, encabezado repuesto, sin EsAdición");
}

module.exports = { runLogSurtidoTests };
