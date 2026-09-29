/**
 * Suite de Pruebas: Kardex simplificado (código real en VM). La hoja 🏠 INICIO se retiró en 1.7.6e.
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runKardexVistaTests() {
  console.log("\n🧪 [TEST SUITE] 📊 Kardex simplificado");
  const { ss, sandbox } = crearContextoBDG();
  const probe = ss.insertSheet("__p__");
  const sheetProto = Object.getPrototypeOf(probe);
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);
  let gid = 100;
  ["setTabColor", "setHiddenGridlines"].forEach(m => { sheetProto[m] = function() { return this; }; });
  sheetProto.getSheetId = function() { return this._gid || (this._gid = gid++); };
  sheetProto.isSheetHidden = function() { return !!this.hidden; };
  sheetProto.hideColumns = function(c, n = 1) { this.ocultas = this.ocultas || new Set(); for (let i = 0; i < n; i++) this.ocultas.add(c + i); return this; };
  sheetProto.showColumns = function(c, n = 1) { this.ocultas = this.ocultas || new Set(); for (let i = 0; i < n; i++) this.ocultas.delete(c + i); return this; };
  rangeProto.setFormulas = function(m) { return this.setValues(m); };
  sandbox.SpreadsheetApp.getActiveSpreadsheet().moveActiveSheet = () => {};
  sandbox.SpreadsheetApp.getActiveSpreadsheet().setActiveSheet = () => {};

  const VMDate = vm.runInContext("Date", sandbox);
  const hoy = new VMDate(); const dow = (hoy.getDay() || 7) - 1;
  const lunes = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
  const maestro = ss.insertSheet("MAESTRO");
  maestro.getRange(3, 1, 1, 6).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO"]]);
  ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
    const s = ss.insertSheet(k);
    s.getRange("G4").setValue(lunes);
    s.getRange(7, 1, 1, 5).setValues([[1, "REF", "Fresa", "DOMO", "kg"]]);
    s.getRange(2, 12).setValue("🟢 SEMANA 40 ACTUALIZADA");
  });
  ss.insertSheet("🗒 LOG");

  // 1. Kardex simplificado
  const kBA = ss.getSheetByName("KARDEX_BA");
  sandbox._simplificarVistaKardex(kBA);
  const visibles = [];
  for (let c = 1; c <= 30; c++) if (!kBA.ocultas.has(c)) visibles.push(c);
  assert.deepStrictEqual(visibles.slice(0, 3), [3, 5, 9], "Primeras visibles: PRODUCTO (C), UNIDAD (E), SALDO ANT (I)");
  assert.strictEqual(visibles.length, 3 + 21, "Más las 21 columnas de los 7 días");
  console.log("  ✓ Kardex: visibles solo PRODUCTO, UNIDAD, SALDO ANT y los 7 días");


}

module.exports = { runKardexVistaTests };
