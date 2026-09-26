/**
 * Suite de Pruebas: Hoja 📥 ENTRADAS (BDG) — ejecuta el código real de miseAuthBDG.js en una VM
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");

function _sembrar(ss, monday) {
  const maestro = ss.insertSheet("MAESTRO");
  maestro.getRange(3, 1, 1, 6).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO"]]);
  maestro.getRange(4, 1, 3, 6).setValues([
    [1, "REFRIGERADOS", "Fresa", "DOMO", "kg", "SÍ"],
    [2, "LÁCTEOS", "Leche", "LT", "lt", "SÍ"],
    [3, "ABARROTES", "Harina Vieja", "BOL", "kg", "NO"]
  ]);
  ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
    const s = ss.insertSheet(k);
    s.getRange("G4").setValue(monday);
    s.getRange(7, 1, 3, 5).setValues([
      [1, "REFRIGERADOS", "Fresa", "DOMO", "kg"],
      [2, "LÁCTEOS", "Leche", "LT", "lt"],
      [3, "ABARROTES", "Harina Vieja", "BOL", "kg"]
    ]);
  });
}

function runEntradasTests() {
  console.log("\n🧪 [TEST SUITE] 📥 ENTRADAS — Captura móvil de stock hacia Kardex");

  const { ss, sandbox, validaciones } = crearContextoBDG();
  const K = sandbox.__c;
  // Fechas del realm de la VM para que `instanceof Date` se comporte como en Apps Script
  const VMDate = vm.runInContext("Date", sandbox);
  const hoy = new VMDate();
  const dow = (hoy.getDay() || 7) - 1; // 0 = LUN
  const monday = new VMDate(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow);
  _sembrar(ss, monday);

  // 1. Preparación: productos activos, orden de Kardex, selector en HOY
  sandbox._prepararHojaEntradas();
  const sh = ss.getSheetByName(K.SHEET_ENTRADAS);
  assert.ok(sh, "Debe crearse la hoja 📥 ENTRADAS");
  assert.deepStrictEqual(sh.getRange(K.ENTRADAS_START, 1, 2, 2).getValues(), [["Fresa", "kg"], ["Leche", "lt"]]);
  assert.strictEqual(sh.getRange(K.ENTRADAS_START + 2, 1).getValue(), "", "Los inactivos no deben listarse");
  assert.strictEqual(sh.getRange("B2").getValue(), K.ENTRADAS_HOY, "El día por default debe ser HOY");
  assert.strictEqual(validaciones[`${K.SHEET_ENTRADAS}!2,2`].values.length, 8, "Selector: HOY + 7 días");
  console.log("  ✓ Hoja generada con activos, unidad de Kardex y selector HOY + LUN..DOM");

  // 2. Envío a HOY: suma sobre ENT existente, admite coma decimal
  const entColHoy = 10 + dow * 3;
  ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).setValue(2);
  sh.getRange(K.ENTRADAS_START, 3, 2, 2).setValues([[3.5, ""], ["", "1,25"]]);
  sandbox.procesarEntradasKardex();
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), 5.5, "Fresa Andares: 2 + 3.5");
  assert.strictEqual(ss.getSheetByName("KARDEX_BM").getRange(8, entColHoy).getValue(), 1.25, "Leche Mercado: 1,25");
  assert.strictEqual(ss.getSheetByName("KARDEX_BM").getRange(7, entColHoy).getValue(), "", "Sin captura no se toca");
  assert.ok(String(sh.getRange("A3").getValue()).startsWith("✅ 2 entrada(s)"), "Estado de éxito en A3");
  assert.deepStrictEqual(sh.getRange(K.ENTRADAS_START, 3, 2, 2).getValues(), [["", ""], ["", ""]], "Capturas limpias tras enviar");
  console.log("  ✓ Envío a HOY suma sobre la ENT existente y limpia las capturas");

  // 3. Día elegido manualmente (MIE)
  sh.getRange("B2").setValue(`${K.DIAS[2]} 00/00`);
  sh.getRange(K.ENTRADAS_START + 1, 3).setValue(4);
  sandbox.procesarEntradasKardex();
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(8, 10 + 2 * 3).getValue(), 4, "Leche Andares en MIE");
  assert.strictEqual(sh.getRange("B2").getValue(), K.ENTRADAS_HOY, "Tras enviar, el selector vuelve a HOY");
  console.log("  ✓ Selector de día manual escribe en la columna ENT correcta y regresa a HOY");

  // 4. Todo o nada: una celda inválida bloquea el envío completo
  const antes = ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue();
  sh.getRange(K.ENTRADAS_START, 3, 2, 1).setValues([[1], ["abc"]]);
  sandbox.procesarEntradasKardex();
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), antes, "No debe escribir nada si hay inválidos");
  assert.ok(String(sh.getRange("A3").getValue()).startsWith("❌ 1 celda"), "Estado de error en A3");
  assert.strictEqual(sh.getRange(K.ENTRADAS_START, 3).getValue(), 1, "Conserva lo capturado para corregir");
  console.log("  ✓ Validación todo-o-nada ante valores no numéricos");

  // 5. Semana del Kardex vencida: HOY fuera de la semana activa se rechaza
  sh.getRange(K.ENTRADAS_START + 1, 3).setValue("");
  sh.getRange("B2").setValue(K.ENTRADAS_HOY);
  const viejo = new VMDate(monday.getTime() - 14 * 86400000);
  ss.getSheetByName("KARDEX_BA").getRange("G4").setValue(viejo);
  sandbox.procesarEntradasKardex();
  assert.ok(String(sh.getRange("A3").getValue()).includes("Avanza la semana"), "Debe pedir avanzar semana");
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), antes, "No escribe con semana vencida");
  console.log("  ✓ Bloqueo cuando HOY no pertenece a la semana activa del Kardex");
}

module.exports = { runEntradasTests };
