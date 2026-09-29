/**
 * Suite de Pruebas: 🏠 INICIO de Bodega y Kardex simplificado (código real en VM)
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runInicioTests() {
  console.log("\n🧪 [TEST SUITE] 🏠 INICIO de Bodega y 📊 Kardex simplificado");
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

  // 2. INICIO: enlaces, casillas y estado
  sandbox._prepararHojaEntradas();
  const ini = sandbox._prepararHojaInicio();
  const col2 = ini.getRange(5, 2, 5, 1).getValues().map(r => String(r[0]));
  assert.ok(col2.some(f => /HYPERLINK\("#gid=\d+", "📥 Entradas/.test(f)), "Enlace a Entradas");
  assert.ok(col2.some(f => /Kardex Mercado/.test(f)), "Enlace a Kardex Mercado");
  const K = sandbox.__c;
  const filaAcc = vm.runInContext("INICIO_FILA_ACCIONES", sandbox);
  assert.strictEqual(ini.getRange(filaAcc, 2).getValue(), "⏩ Avanzar semana (si toca)", "Primera acción");
  const texto = JSON.stringify(ini.getRange(filaAcc + 5, 2, 12, 2).getValues());
  assert.ok(/Semana Mercado/.test(texto) && /SEMANA 40 ACTUALIZADA/.test(texto), "Estado incluye la semana de cada Kardex");
  assert.ok(/Versión/.test(texto) && /PRODUCCIÓN|DEV/.test(texto), "Estado incluye versión y entorno");
  console.log("  ✓ INICIO: enlaces internos, casillas de acción y estado del sistema en la hoja");

  // 3. Marcar una casilla ejecuta la acción (vía _onEditBodega, que corre en el onEdit instalable)
  const casilla = ini.getRange(filaAcc + 3, 1);  // 🩺 Actualizar estado
  casilla.setValue(true);
  sandbox._onEditBodega({ range: Object.assign(casilla, { getSheet: () => ini, getRow: () => filaAcc + 3, getColumn: () => 1 }), value: true });
  assert.strictEqual(casilla.getValue(), false, "La casilla se reinicia");
  assert.ok(/^✅ Estado actualizado · \d\d:\d\d$/.test(ini.getRange(filaAcc + 3, 3).getValue()), "Resultado con hora junto a la acción");
  console.log("  ✓ Casilla de INICIO: ejecuta la acción, se reinicia y reporta el resultado");
}

module.exports = { runInicioTests };
