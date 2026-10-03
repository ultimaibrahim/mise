/**
 * Suite de Pruebas: guardado del Powerhouse (catálogo) — código real de miseAuthBDG.js en VM
 * Caso real: renombrar un producto y moverlo en picking; el diálogo manda el producto completo
 * (incluido ACTIVO sin cambios). Antes: el producto renombrado perdía su posición y cada
 * guardado reconstruía ambos Kardex (1–2 min).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
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
  // 3b. Cambio REAL de categoría (1.7.7l): reacomoda; repetir la misma categoría no
  sandbox.powerhouseGuardarCatalogo("BA", { ediciones: [{ originalName: "Azúcar", name: "Azúcar", cat: "BEBIDAS" }], picking: [] });
  assert.strictEqual(reconstrucciones, 2, "Cambiar la categoría reacomoda Catálogo e Inventario (antes se quedaba en su lugar)");
  sandbox.powerhouseGuardarCatalogo("BA", { ediciones: [{ originalName: "Azúcar", name: "Azúcar", cat: "bebidas" }], picking: [] });
  assert.strictEqual(reconstrucciones, 2, "La misma categoría (aunque venga en minúsculas) no reconstruye");
  console.log("  ✓ Solo las altas y los cambios reales de categoría disparan la reconstrucción completa");

  // 4. Orden del Catálogo como picking por default (1.7.7b): solo la tienda elegida
  const filas = maestro.getLastRow() - 3;                 // incluye el alta del paso 3
  maestro.getRange(4, 18, filas, 2).setValues(Array.from({ length: filas }, (_, i) => [90 + i, 90 + i]));
  const n = sandbox._restablecerPickingCatalogo(["BM"]);
  assert.strictEqual(n, filas, "Todos los productos del Catálogo");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(maestro.getRange(4, 19, filas, 1).getValues())), Array.from({ length: filas }, (_, i) => [i + 1]), "Mercado = orden de filas del Catálogo");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(maestro.getRange(4, 18, filas, 1).getValues())), Array.from({ length: filas }, (_, i) => [90 + i]), "Andares conserva su orden personalizado");
  console.log("  ✓ Orden del Catálogo como picking por default (por tienda), sin tocar la otra");

  // 5. (1.7.7d) Guardar ediciones NO congela las fórmulas de STOCK y guarda "se recibe pesado"
  const filaHarina = maestro.getRange(4, 3, maestro.getLastRow() - 3, 1).getValues().findIndex(r => r[0] === "Harina") + 4;
  maestro.getRange(filaHarina, 9).setValue("=STOCK_DE(\"Harina\")");
  const getValuesOrig = rangeProto.getValues;
  rangeProto.getValues = function() {   // como Google: getValues devuelve el RESULTADO de la fórmula
    return getValuesOrig.call(this).map(f => f.map(v => (typeof v === "string" && v.startsWith("=")) ? 7 : v));
  };
  try {
    sandbox.powerhouseGuardarCatalogo("BA", { nuevos: [], eliminados: [], picking: [], ediciones: [{ originalName: "Harina", name: "Harina", pesado: true }] });
  } finally {
    rangeProto.getValues = getValuesOrig;
  }
  assert.strictEqual(maestro.getRange(filaHarina, 9).getValue(), "=STOCK_DE(\"Harina\")", "STOCK sigue siendo fórmula (antes quedaba el número 7 fijo)");
  let formatos = 0;
  const formatoOrig = sandbox._asegurarFormatoHeadersMaestro;
  sandbox._asegurarFormatoHeadersMaestro = () => { formatos++; };
  const datos = sandbox.obtenerDatosPowerhouse("BA");
  sandbox._asegurarFormatoHeadersMaestro = formatoOrig;
  assert.strictEqual(datos.items.find(it => it.name === "Harina").pesado, true, "Se recibe pesado: guardado y leído");
  assert.strictEqual(formatos, 0, "Abrir Powerhouse no reformatea los encabezados del Catálogo si no falta ninguna columna");
  console.log("  ✓ Guardar no congela las fórmulas de STOCK · peso exacto editable · abrir no reformatea el Catálogo");

  // 6. Apertura: una sola ejecución con los datos dentro, ventana sin bloqueo, JSON que no rompe la etiqueta <script>
  const htmlOrig = sandbox.HtmlService, uiOrig = sandbox.SpreadsheetApp.getUi;
  let abierto = null, plantilla = null;
  sandbox.HtmlService = { createTemplateFromFile: (f) => (plantilla = { f, evaluate() { return { setWidth() { return this; }, setHeight() { return this; } }; } }) };
  sandbox.SpreadsheetApp.getUi = () => ({ showModelessDialog: (h, t) => { abierto = t; }, showModalDialog: () => { throw new Error("modal"); } });
  try { sandbox.abrirConstructorPickingHTML(); } finally { sandbox.HtmlService = htmlOrig; sandbox.SpreadsheetApp.getUi = uiOrig; }
  assert.ok(abierto && /Powerhouse/.test(abierto), "Se abre como ventana sin bloqueo");
  assert.strictEqual(JSON.parse(plantilla.precarga).items.length, datos.items.length, "Los datos viajan dentro del diálogo");
  const seguro = sandbox._jsonParaHtml({ n: "</script><b>x" });
  assert.ok(!seguro.includes("<") && JSON.parse(seguro).n === "</script><b>x", "Nombres con < no cierran la etiqueta <script>");
  console.log("  ✓ Powerhouse abre sin bloquear la hoja y con los datos precargados (sin segunda llamada)");

  // 7. Cliente: pestaña 📝 Productos con lista de nombres completos y ficha por secciones
  const nodos = {};
  const nodo = () => ({ innerHTML: "", textContent: "", innerText: "", value: "", disabled: false, scrollTop: 0, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, querySelector() { return nodo(); }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {} });
  const doc = { getElementById: (id) => (nodos[id] = nodos[id] || nodo()), querySelectorAll: () => [], createElement: () => nodo(), body: { style: {} } };
  let llamadasServidor = 0;
  const run = new Proxy({}, { get: (t, k) => (k === "withSuccessHandler" || k === "withFailureHandler") ? () => run : () => { llamadasServidor++; } });
  const nombreLargo = "Crema batida para decorar crepas sabor vainilla bote 1 litro";
  const pre = { items: [
    { id: 1, no: 1, name: nombreLargo, cat: "LÁCTEOS", pres: "BOT 1 L", unit: "lt", unitTienda: "", factor: "", pesado: false, activo: true, rankBA: 2, rankBM: 1 },
    { id: 2, no: 2, name: "Plátano", cat: "FRUTAS", pres: "PZA 180 g", unit: "pza", unitTienda: "", factor: "", pesado: false, activo: true, rankBA: 1, rankBM: 2 }],
    categorias: ["LÁCTEOS", "FRUTAS"], unidades: ["kg", "lt", "pza"] };
  let html = fs.readFileSync(path.join(__dirname, "..", "..", "bdg", "PickingDialog.html"), "utf8").replace("<?!= precarga ?>", JSON.stringify(pre));
  const ctx = { document: doc, google: { script: { run, host: { close() {} } } }, window: {}, localStorage: { getItem: () => null, setItem() {} },
    Sortable: function() { this.destroy = () => {}; }, setTimeout: () => {}, performance: { now: () => 0 }, console };
  ctx.Sortable.create = () => ({ destroy() {} });
  vm.createContext(ctx);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1], ctx);
  ctx.window.onload();
  assert.strictEqual(llamadasServidor, 0, "La primera carga usa la precarga, sin llamar al servidor");
  vm.runInContext(`cambiarTab("edicion"); abrirFicha(0);`, ctx);
  assert.ok(nodos.fichaLista.innerHTML.includes(nombreLargo) && nodos.fichaPanel.innerHTML.includes(nombreLargo), "Nombre completo en la lista y en la ficha");
  vm.runInContext(`cambiarFichaTab("unidades"); campoFicha("unitTienda", "caj"); campoFicha("factor", "12"); campoFicha("pesado", true);`, ctx);
  const ed = vm.runInContext(`JSON.stringify(itemsEditadosMap.get(${JSON.stringify(nombreLargo)}))`, ctx);
  assert.ok(/"unitTienda":"caj"/.test(ed) && /"factor":"12"/.test(ed) && /"pesado":true/.test(ed), "La ficha guarda unidad de pedido, factor y peso exacto en el búfer de ediciones");
  assert.ok(/1 caj = <b>12 lt<\/b>/.test(nodos.fichaPanel.innerHTML), "Ejemplo vivo de la conversión");
  vm.runInContext(`cambiarFichaTab("orden"); moverDesdeFicha(1);`, ctx);
  assert.strictEqual(vm.runInContext("rawItems[0].name", ctx), nombreLargo, "Orden: mover al inicio desde la ficha");
  vm.runInContext(`ordenCatalogo();`, ctx);
  assert.strictEqual(vm.runInContext("rawItems.map(i => i.id).join()", ctx), "1,2", "↺ Orden del Catálogo");
  ["general", "minmax"].forEach(t => { vm.runInContext(`cambiarFichaTab("${t}")`, ctx); assert.ok(!/undefined|NaN/.test(nodos.fichaPanel.innerHTML), `Ficha ${t} sin undefined/NaN`); });
  console.log("  ✓ Productos: nombres completos, ficha General · Unidades · Mín/Máx · Orden y botón Orden del Catálogo");
}

module.exports = { runPowerhouseTests };
