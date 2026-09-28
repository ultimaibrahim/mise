/**
 * Suite de Pruebas: guardado del Powerhouse (catálogo) — código real de miseAuthBDG.js en VM
 * Caso real: renombrar un producto y moverlo en picking; el diálogo manda el producto completo
 * (incluido ACTIVO sin cambios). Antes: el producto renombrado perdía su posición y cada
 * guardado reconstruía ambos Kardex (1–2 min).
 */
const assert = require("assert");
const { crearContextoBDG } = require("../mocks/bdgVm");

function runPowerhouseTests() {
  console.log("\n🧪 [TEST SUITE] ⚡ Powerhouse: guardado de catálogo en fases");
  const { ss, sandbox } = crearContextoBDG();
  const probe = ss.insertSheet("__p__");
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  const sheetProto = Object.getPrototypeOf(probe);
  ss.deleteSheet(probe);
  rangeProto.setFormulas = function(m) { return this.setValues(m); };
  ["clearDataValidations"].forEach(m => { rangeProto[m] = function() { return this; }; });

  const headers = ["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "MÍN_BA", "MÁX_BA", "STOCK_BA",
    "MÍN_BM", "MÁX_BM", "STOCK_BM", "SELECCIONAR", "MÍN_Q_BA", "MÁX_Q_BA", "MÍN_Q_BM", "MÁX_Q_BM", "PICKING_BA", "PICKING_BM"];
  const maestro = ss.insertSheet("MAESTRO");
  maestro.getRange(3, 1, 1, headers.length).setValues([headers]);
  maestro.getRange(4, 1, 3, headers.length).setValues([
    [1, "FRUTAS", "Fresa", "DOMO", "kg", "SÍ", 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0, 3, 3],
    [2, "LÁCTEOS", "Leche", "LT", "lt", "SÍ", 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0, 1, 1],
    [3, "ABARROTES", "Harina", "BOL", "kg", "SÍ", 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0, 2, 2]
  ]);
  const ocultas = [];
  ["KARDEX_BA", "KARDEX_BM"].forEach(k => {
    const s = ss.insertSheet(k);
    s.getRange(7, 1, 3, 5).setValues([[1, "FRUTAS", "Fresa", "DOMO", "kg"], [2, "LÁCTEOS", "Leche", "LT", "lt"], [3, "ABARROTES", "Harina", "BOL", "kg"]]);
    s.hideRows = (r) => { ocultas.push(`${k}:${r}`); return s; };
  });
  let reconstrucciones = 0;
  sandbox._ordenarYRenumerarTodo = () => { reconstrucciones++; };

  // 1. Renombrar Fresa → "Fresa Premium" y moverla al lugar 1; el diálogo manda ACTIVO sin cambios.
  //    Harina no viene en la lista de picking: debe conservar su rank (2), no tomar su fila.
  const payload = {
    nuevos: [],
    ediciones: [{ originalName: "Fresa", name: "Fresa Premium", cat: "FRUTAS", activo: true }],
    eliminados: [],
    picking: [{ name: "Fresa", rank: 1 }, { name: "Leche", rank: 3 }]
  };
  const r = sandbox.powerhouseGuardarCatalogo("BA", payload);
  assert.strictEqual(reconstrucciones, 0, "Sin altas ni cambio real de ACTIVO: NO reconstruye los Kardex");
  assert.strictEqual(maestro.getRange(4, 3).getValue(), "Fresa Premium", "Renombre en MAESTRO");
  assert.strictEqual(ss.getSheetByName("KARDEX_BA").getRange(7, 3).getValue(), "Fresa Premium", "Renombre llega a KARDEX_BA");
  assert.strictEqual(ss.getSheetByName("KARDEX_BM").getRange(7, 3).getValue(), "Fresa Premium", "Renombre llega a KARDEX_BM");
  assert.strictEqual(maestro.getRange(4, 18).getValue(), 1, "El producto renombrado conserva la posición elegida (1)");
  assert.strictEqual(maestro.getRange(5, 18).getValue(), 3, "Leche en 3");
  assert.strictEqual(maestro.getRange(6, 18).getValue(), 2, "Harina sin dato conserva su rank (2), no su fila");
  assert.deepStrictEqual(ocultas, [], "Sin cambio real de ACTIVO no oculta filas");
  assert.ok(/1 renombres, 0 cambios de activo/.test(r.resumen), "Resumen honesto");
  console.log("  ✓ Renombre + picking: el producto sigue en su posición y no se reconstruyen los Kardex");

  // 2. Desactivar Leche (cambio real): oculta SU fila en ambos Kardex, sin reconstruir
  sandbox.powerhouseGuardarCatalogo("BA", { ediciones: [{ originalName: "Leche", name: "Leche", activo: false }], picking: [] });
  assert.strictEqual(reconstrucciones, 0, "Cambio de ACTIVO tampoco reconstruye");
  assert.deepStrictEqual(ocultas.sort(), ["KARDEX_BA:8", "KARDEX_BM:8"], "Oculta la fila de Leche en ambos Kardex");
  assert.strictEqual(maestro.getRange(5, 6).getValue(), "NO", "ACTIVO = NO en MAESTRO");
  console.log("  ✓ Desactivar oculta la fila correcta en ambos Kardex sin reconstruirlos");

  // 3. Altas sí reconstruyen (necesitan filas nuevas en Kardex)
  sandbox.powerhouseGuardarCatalogo("BA", { nuevos: [{ name: "Azúcar", cat: "ABARROTES", unit: "kg" }], picking: [] });
  assert.strictEqual(reconstrucciones, 1, "Altas reconstruyen");
  console.log("  ✓ Solo las altas disparan la reconstrucción completa");
}

module.exports = { runPowerhouseTests };
