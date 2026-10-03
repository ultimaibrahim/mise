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

  // 3b. Hoja en español (1.7.7k): Google convierte "JUE 01/10" en FECHA al elegirlo. Se acepta y cae en su día.
  sh.getRange("B2").setValue(new VMDate(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3));
  sh.getRange(K.ENTRADAS_START + 1, 3).setValue(7);
  sandbox.procesarEntradasKardex();
  assert.ok(String(sh.getRange("A3").getValue()).startsWith("✅"), `B2 como fecha se acepta (quedó: ${sh.getRange("A3").getValue()})`);
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(8, 10 + 3 * 3).getValue(), 7, "Leche Andares en JUE (B2 llegó como fecha)");
  sh.getRange("B2").setValue(new VMDate(monday.getFullYear(), monday.getMonth(), monday.getDate() + 9));
  sh.getRange(K.ENTRADAS_START + 1, 3).setValue(1);
  sandbox.procesarEntradasKardex();
  assert.ok(/no está en la semana activa/.test(String(sh.getRange("A3").getValue())), "Una fecha fuera de la semana se rechaza con un mensaje claro");
  sh.getRange(K.ENTRADAS_START + 1, 3).clearContent();
  sh.getRange("B2").setValue(K.ENTRADAS_HOY);
  console.log("  ✓ B2 convertido en fecha por la configuración en español: se acepta si es de la semana activa");

  // 4. Todo o nada: una celda inválida bloquea el envío completo
  const antes = ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue();
  sh.getRange(K.ENTRADAS_START, 3, 2, 1).setValues([[1], ["abc"]]);
  sandbox.procesarEntradasKardex();
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), antes, "No debe escribir nada si hay inválidos");
  assert.ok(String(sh.getRange("A3").getValue()).startsWith("❌ 1 celda"), "Estado de error en A3");
  assert.strictEqual(sh.getRange(K.ENTRADAS_START, 3).getValue(), 1, "Conserva lo capturado para corregir");
  console.log("  ✓ Validación todo-o-nada ante valores no numéricos");

  // 4b. Mercado atrasada una semana y Andares al día (caso real hasta el 28/sep):
  //     lo de Andares se envía normal; lo de Mercado se bloquea con su nombre y no escribe nada
  {
    const kBM = ss.getSheetByName("KARDEX_BM");
    const lunesBM = kBM.getRange("G4").getValue();
    kBM.getRange("G4").setValue(new VMDate(lunesBM.getTime() - 7 * 86400000));
    sh.getRange(K.ENTRADAS_START, 3, 2, 2).setValues([["", ""], ["", ""]]);
    sh.getRange("B2").setValue(K.ENTRADAS_HOY);
    const antesBM = kBM.getRange(7, entColHoy).getValue();
    sh.getRange(K.ENTRADAS_START, 4).setValue(2);          // Fresa → Mercado (atrasada)
    sandbox.procesarEntradasKardex();
    assert.ok(/Mercado/.test(String(sh.getRange("A3").getValue())), "El bloqueo nombra a Mercado");
    assert.strictEqual(kBM.getRange(7, entColHoy).getValue(), antesBM, "No escribe en la semana equivocada de Mercado");
    sh.getRange(K.ENTRADAS_START, 3, 1, 2).setValues([[1, ""]]);   // solo Andares
    const antesBA = ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue() || 0;
    sandbox.procesarEntradasKardex();
    assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), antesBA + 1, "Andares al día se envía normal");
    kBM.getRange("G4").setValue(lunesBM);
    console.log("  ✓ Semana por bodega: Mercado atrasada se bloquea con su nombre; Andares al día se envía");
  }

  // 5. Semana del Kardex vencida: HOY fuera de la semana activa se rechaza
  sh.getRange(K.ENTRADAS_START, 3, 2, 1).setValues([[1], [""]]);   // captura propia (no heredada)
  const antes5 = ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue();
  sh.getRange("B2").setValue(K.ENTRADAS_HOY);
  const viejo = new VMDate(monday.getTime() - 14 * 86400000);
  ss.getSheetByName("KARDEX_BA").getRange("G4").setValue(viejo);
  sandbox.procesarEntradasKardex();
  assert.ok(String(sh.getRange("A3").getValue()).includes("Avanza la semana"), "Debe pedir avanzar semana");
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, entColHoy).getValue(), antes5, "No escribe con semana vencida");
  console.log("  ✓ Bloqueo cuando HOY no pertenece a la semana activa del Kardex");
}

module.exports = { runEntradasTests };
