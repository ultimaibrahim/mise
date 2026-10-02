/**
 * Suite: 🎭 Simulación de un día completo por roles — código REAL de Bodega y de la tienda Andares, conectados
 * (IMPORTRANGE y apertura remota emulados) y con FÓRMULAS CALCULADAS como Google (emulador aislado).
 *   Administrador → Proveedor (entradas) → Bodeguero (traspaso) → Encargado (pedido) → Surtidor (recepción)
 *   → Cierre de las 23:00 → Reset de las 00:00 → Powerhouse → Mantenimiento semanal → Página de estado
 * Encontró (1.7.7e): 🚦 STOCK con "MAESTRO!" literal, STOCK del Catálogo leyendo la columna equivocada y
 * "bajo mínimo" contra el mínimo de quiosco.
 */
const assert = require("assert");
const vm = require("vm");
const { cargarEmuladorAislado } = require("../mocks/aislado");

function runSimulacionTests() {
  console.log("\n🧪 [TEST SUITE] 🎭 Simulación de un día por roles (Bodega + tienda, fórmulas calculadas)");
  const E = cargarEmuladorAislado({ formulas: true });
  const { ss: bdg, sandbox: B } = E.crearContextoBDG();
  const D = (y, m, d) => vm.runInContext(`new Date(${y}, ${m}, ${d})`, B);
  const HOY = vm.runInContext("new Date()", B);
  const DOW = (HOY.getDay() || 7) - 1;
  const LUNES = D(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - DOW);
  const ENT = 10 + DOW * 3, SAL = ENT + 1, SLD = ENT + 2;
  const cerca = (a, b, msg) => assert.ok(Math.abs(Number(a) - b) < 1e-9, `${msg} (esperado ${b}, quedó ${a})`);

  // ── Administrador: un libro como el de PROD (nombres viejos → renombrado → reconstrucción) ──
  const m = bdg.insertSheet("MAESTRO");
  m.getRange(3, 1, 1, 13).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "MÍN_BA", "MÁX_BA", "STOCK_BA", "MÍN_BM", "MÁX_BM", "STOCK_BM", "SELECCIONAR"]]);
  m.getRange(4, 1, 4, 13).setValues([
    [1, "FRUTAS", "Fresa", "DOM 454 g", "kg", "SÍ", 2, 10, "", 2, 10, "", false],
    [2, "FRUTAS", "Plátano", "PZA 180 g", "pza", "SÍ", 10, 40, "", 10, 40, "", false],
    [3, "LÁCTEOS", "Leche", "LT", "lt", "SÍ", 6, 24, "", 6, 24, "", false],
    [4, "DESECHABLES", "Guantes", "CAJ 100 PZA", "pza", "SÍ", 100, 500, "", 100, 500, "", false]]);
  B._asegurarColumnasQuioscoEnMaestro(m);
  [["KARDEX_BA", "Andares"], ["KARDEX_BM", "Mercado"]].forEach(([k, n]) => {
    const h = bdg.insertSheet(k); B._buildKardex(h, n); B._poblarKardex(h); h.getRange("G4").setValue(LUNES);
  });
  assert.strictEqual(B._renombrarHojasBDG().length, 3, "Pestañas renombradas como en PROD");
  B._ordenarYRenumerarTodo();
  const cat = bdg.getSheetByName("📋 Catálogo");
  const mapa = B._getMaestroHeaderMap(cat);
  const filaCat = (n) => cat.getRange(4, 3, cat.getLastRow() - 3, 1).getValues().findIndex(r => r[0] === n) + 4;
  const ponerCat = (n, col, v) => cat.getRange(filaCat(n), mapa[col].col).setValue(v);
  ponerCat("Fresa", "UNIDAD_TIENDA", "dom"); ponerCat("Fresa", "FACTOR_CONVERSION", 0.454);
  ponerCat("Guantes", "UNIDAD_TIENDA", "caj"); ponerCat("Guantes", "FACTOR_CONVERSION", 100);
  ponerCat("Plátano", "RECEPCION_PESADA", "SÍ");
  const inv = (b) => bdg.getSheetByName(b === "BA" ? "📦 Inventario Andares" : "📦 Inventario Mercado");
  const filaInv = (b, n) => inv(b).getRange(7, 3, inv(b).getLastRow() - 6, 1).getValues().findIndex(r => r[0] === n) + 7;
  const celdaInv = (b, n, c) => inv(b).getRange(filaInv(b, n), c).getValue();
  ["BA", "BM"].forEach(b => [["Fresa", 4], ["Plátano", 20], ["Leche", 12], ["Guantes", 300]].forEach(([n, q]) => inv(b).getRange(filaInv(b, n), 9).setValue(q)));
  assert.strictEqual(celdaInv("BA", "Plátano", 8), "🟢 -", "🚦 calcula contra el Catálogo renombrado (antes: vacío por \"MAESTRO!\" literal)");
  assert.strictEqual(celdaInv("BA", "Leche", SLD), 12, "Saldo inicial llega al SLD de hoy por la cadena de fórmulas");
  console.log("  ✓ Administrador: libro renombrado y reconstruido; 🚦 y saldos calculan con el Catálogo real");

  // ── Proveedor: entradas en la unidad en que llega cada cosa ──
  B._prepararHojaEntradas();
  const K = B.__c;
  const ent = B._hoja(bdg, K.SHEET_ENTRADAS);
  const filaEnt = (n) => ent.getRange(K.ENTRADAS_START, 1, ent.getLastRow() - K.ENTRADAS_START + 1, 1).getValues().findIndex(r => r[0] === n) + K.ENTRADAS_START;
  assert.deepStrictEqual(["Fresa", "Plátano", "Leche", "Guantes"].map(n => ent.getRange(filaEnt(n), 2).getValue()), ["dom", "kg", "lt", "caj"], "Cada producto se captura en su unidad (pesado → kg)");
  ent.getRange(filaEnt("Fresa"), 3).setValue(6);
  ent.getRange(filaEnt("Plátano"), 3).setValue(5.4);
  ent.getRange(filaEnt("Leche"), 3).setValue(12);
  ent.getRange(filaEnt("Guantes"), 4).setValue(2);
  B.procesarEntradasKardex();
  assert.ok(/^✅ 4 entrada/.test(ent.getRange("A3").getValue()), "Entradas enviadas");
  cerca(celdaInv("BA", "Fresa", ENT), 2.724, "6 domos × 0.454 kg");
  assert.strictEqual(celdaInv("BA", "Plátano", ENT), 30, "5.4 kg de plátano ÷ 180 g = 30 piezas");
  assert.strictEqual(celdaInv("BM", "Guantes", ENT), 200, "2 cajas × 100 a Mercado");
  console.log("  ✓ Proveedor: domos, kg exactos y cajas se convierten a la unidad del inventario");

  // ── Bodeguero: traspaso Andares → Mercado ──
  ent.getRange("A2").setValue("🔄 Andares → Mercado");
  B._aplicarModoEntradas(ent, true);
  ent.getRange(filaEnt("Fresa"), 3).setValue(2);
  B.procesarEntradasKardex();
  cerca(celdaInv("BA", "Fresa", SAL), 0.908, "Origen: SAL 2 domos");
  cerca(celdaInv("BM", "Fresa", ENT), 0.908, "Destino: ENT 2 domos");
  cerca(celdaInv("BA", "Fresa", SLD), 5.816, "Saldo de Andares: 4 + 2.724 − 0.908");
  ent.getRange("A2").setValue("📥 Entrada"); B._aplicarModoEntradas(ent, true);
  B._buildVista("BA");
  const vista = bdg.getSheetByName("VISTA_MOVIL_BA");
  const filaVista = (n) => vista.getRange(4, 1, vista.getLastRow() - 3, 12).getValues().find(r => r[2] === n);
  assert.deepStrictEqual([filaVista("Fresa")[3], filaVista("Fresa")[4], filaVista("Fresa")[6], filaVista("Fresa")[7]], ["dom", 12.81, 6, 2],
    "La tienda ve la fresa en domos: saldo 12.81, entraron 6 y salieron 2 hoy");
  console.log("  ✓ Bodeguero: traspaso en domos; la vista de la tienda muestra saldo y movimientos de hoy en su unidad");

  // ── Tienda Andares (código real) con IMPORTRANGE emulado desde la vista de Bodega ──
  const rangeProto = Object.getPrototypeOf(new (E.gas.MockSpreadsheetApp.getActiveSpreadsheet().constructor)().insertSheet("x").getRange(1, 1));
  const setFormulasFiel = rangeProto.setFormulas;
  const { ss: tda, sandbox: T } = E.crearContextoTienda("pda", "miseAuthPDA.js", { BODEGA_URL_BA: bdg.getUrl(), MISE_SCHEMA_TIENDA: "3" });
  rangeProto.setFormulas = setFormulasFiel;      // tiendaVm la reemplaza; en esta copia aislada, como Google
  E.gas.registrarImportRange((url, ref) => url === bdg.getUrl() && /^VISTA_MOVIL_BA!A4/.test(ref) ? vista.getRange(4, 1).getValue() : null);
  const sync = tda.insertSheet("_SYNC_BA");
  const importar = () => {
    const v = vista.getRange(4, 1, vista.getLastRow() - 3, 12).getValues();
    sync.getRange(4, 2, v.length, 11).setValues(v.map(r => r.slice(1)));
    for (let i = 1; i < v.length; i++) sync.getRange(4 + i, 1).setValue(v[i][0]);
  };
  sync.getRange(4, 1).setFormula(`=IMPORTRANGE("${bdg.getUrl()}", "VISTA_MOVIL_BA!A4:L")`);
  importar();
  tda.insertSheet("📋 PEDIDO DIARIO");
  const n = T._reconstruirPedidoDiarioCore({});
  const ped = tda.getSheetByName("📋 PEDIDO DIARIO");
  assert.strictEqual(n, 4, "Pedido con los 4 productos de Bodega");
  assert.deepStrictEqual(ped.getRange(4, 3, 4, 1).getValues().map(r => r[0]), ["Fresa", "Plátano", "Leche", "Guantes"], "En el orden de picking de Bodega");
  assert.strictEqual(ped.getRange(4, 4).getValue(), "dom", "La tienda pide fresa en domos");

  // ── Encargado de tienda: hace el pedido ──
  const filaPed = (x) => ped.getRange(4, 3, n, 1).getValues().findIndex(r => r[0] === x) + 4;
  const editar = (hoja, r, c, v) => { const rg = hoja.getRange(r, c); rg.setValue(v); T.onEdit({ range: rg, value: v, source: tda }); };
  [["Fresa", 5], ["Leche", 6], ["Plátano", 10], ["Guantes", 1]].forEach(([x, q]) => editar(ped, filaPed(x), 6, q));

  // ── Surtidor (recibe en tienda): Surtido Rápido ──
  editar(ped, 2, 6, true);
  const sur = tda.getSheetByName("🚚 SURTIDO RÁPIDO");
  const filaSur = (x) => sur.getRange(4, 3, 10, 1).getValues().findIndex(r => r[0] === x) + 4;
  assert.strictEqual(sur.getRange(filaSur("Fresa"), 2).getValue(), "Fresa\n[PEDIDO - 5]", "Vista congelada: nombre + [PEDIDO - n]");
  editar(sur, filaSur("Fresa"), 6, true);      // ✅ completo
  editar(sur, filaSur("Leche"), 5, 4);         // llegaron 4 de 6
  editar(sur, filaSur("Plátano"), 7, true);    // ❌ no llegó
  assert.deepStrictEqual(["Fresa", "Leche", "Plátano"].map(x => sur.getRange(filaSur(x), 8).getValue()), [5, 4, 0], "CANT. FINAL calculada: 5 · 4 · 0");
  assert.strictEqual(sur.getRange(2, 1).getValue(), "📋 3 de 4 registrados", "Contador de avance (Guantes sin registrar)");
  assert.deepStrictEqual(["Fresa", "Leche", "Plátano"].map(x => ped.getRange(filaPed(x), 9).getValue()), ["COMPLETO", "PARCIAL", "INEXISTENTE"], "El Pedido refleja la recepción");
  console.log("  ✓ Encargado y surtidor: pedido en domos, Surtido Rápido con ✅/❌/parcial, CANT. FINAL y avance calculados");

  B.PropertiesService.getScriptProperties().setProperty("PDA_SPREADSHEET_ID", tda.getId());
  B.PropertiesService.getScriptProperties().setProperty("PDM_SPREADSHEET_ID", "");
  B.SpreadsheetApp.openById = (id) => { if (id === tda.getId()) return tda; throw new Error("sin acceso"); };

  // ── Administrador da de alta una presentación nueva junto a la anterior con pedidos ya capturados (caso real
  //    Canada Dry 600 ml, 1.7.7g). El IMPORTRANGE de la tienda se actualiza ANTES de que Bodega reordene. ──
  const pedidoPorNombre = () => {
    const filas = ped.getRange(4, 3, ped.getLastRow() - 3, 4).getValues();
    return Object.fromEntries(filas.filter(r => r[0]).map(r => [r[0], [r[1], r[3]]]));   // nombre → [unidad, cantidad]
  };
  const antesAlta = pedidoPorNombre();
  B.powerhouseGuardarCatalogo("BA", { nuevos: [{ name: "Fresa (domo 1 kg)", cat: "FRUTAS", pres: "DOM 1 kg", unit: "kg" }], ediciones: [], eliminados: [], picking: [] });
  B._buildVista("BA");
  importar();
  B.sincronizarRemotamenteTiendasPush("BA");
  T._sincronizarSiCambioCatalogo("apertura");
  const despuesAlta = pedidoPorNombre();
  Object.keys(antesAlta).forEach(nombre => assert.deepStrictEqual(despuesAlta[nombre], antesAlta[nombre],
    `Tras el alta, ${nombre} conserva su unidad y su cantidad (antes la cantidad brincaba al producto vecino)`));
  assert.ok(despuesAlta["Fresa (domo 1 kg)"] && despuesAlta["Fresa (domo 1 kg)"][1] === "", "La presentación nueva entra sin cantidad");
  assert.strictEqual(B._formulasPedidoPorNombre(9, "_SYNC_BA").saldo, T._formulasPedidoPorNombre(9, "_SYNC_BA").saldo, "Misma fórmula por nombre en Bodega y tienda");
  console.log("  ✓ Alta de una presentación nueva junto a la anterior: cada cantidad se queda en su producto (Pedido por nombre)");

  // ── 23:00: cierre en Bodega (abre la tienda, descuenta lo recibido y la vacía) ──
  const r1 = B.MiseSmartSync.ejecutarDescuento(true);
  assert.strictEqual(r1.totalDescontados, 2, "Se descuentan Fresa y Leche");
  cerca(celdaInv("BA", "Fresa", SAL), 3.178, "Fresa: traspaso 0.908 + 5 domos × 0.454");
  assert.strictEqual(celdaInv("BA", "Leche", SAL), 4, "Leche: solo lo que llegó");
  assert.strictEqual(celdaInv("BA", "Plátano", SAL), "", "Plátano ❌: nada");
  assert.strictEqual(celdaInv("BA", "Guantes", SAL), "", "Guantes sin registro: nada");
  assert.ok(ped.getRange(4, 6, n, 1).getValues().every(r => r[0] === ""), "La tienda queda vacía para mañana");
  const log = tda.getSheetByName("🗒 LOG_SURTIDO").getRange(2, 3, 4, 5).getValues().map(r => `${r[0]}:${r[4]}`);
  assert.deepStrictEqual(log, ["Fresa:COMPLETO", "Plátano:INEXISTENTE", "Leche:PARCIAL", "Guantes:SIN_REGISTRO"], "LOG_SURTIDO con el estado de cada producto");
  try { T._resetearPedidoSilencioso(); } catch (e) { assert.fail("Reset de las 00:00: " + e.message); }
  const r2 = B.MiseSmartSync.ejecutarDescuento(true);
  assert.ok(r2.totalDescontados === 0 && Math.abs(celdaInv("BA", "Fresa", SAL) - 3.178) < 1e-9, "Reintento: nada se descuenta dos veces");
  console.log("  ✓ Cierre 23:00 y reset 00:00: descuenta lo recibido (× factor), vacía la tienda, registra y no repite");

  // ── Administrador: Powerhouse, mantenimiento y página de estado ──
  const stock = (x) => String(cat.getRange(filaCat(x), mapa["STOCK_BA"].col).getValue());
  B.powerhouseGuardarCatalogo("BA", {
    nuevos: [{ name: "Nutella", cat: "ABARROTES", pres: "FCO 3 kg", unit: "fco", minBa: 1, maxBa: 4 }],
    ediciones: [{ originalName: "Plátano", name: "Plátano", minBa: 60 }], eliminados: [], picking: [] });
  ["BA", "BM"].forEach(k => B.powerhouseActualizarTienda(k));
  assert.ok(/^20 \(-\)$/.test(stock("Leche")), `STOCK del Catálogo = saldo al cierre (antes leía la ENT del domingo): ${stock("Leche")}`);
  assert.strictEqual(celdaInv("BA", "Plátano", 8), "🔴 -10", "🚦 refleja el nuevo mínimo (60) de Powerhouse");
  cerca(celdaInv("BA", "Fresa", SLD), 3.546, "Una alta reconstruye el Inventario sin perder movimientos");
  assert.ok(sync.getRange(4, 3, 6, 1).getValues().some(r => r[0] === "Nutella") || filaInv("BA", "Nutella") > 6, "La alta llega al Inventario y a la tienda");
  const mant = B._mantenimientoSemanalCore(null);
  assert.ok(mant.ok, "Mantenimiento semanal sin errores");
  assert.strictEqual(celdaInv("BA", "Plátano", 8), "🔴 -10", "Tras el mantenimiento el 🚦 sigue calculando");
  T._latidoTienda("simulacion", true);
  const est = B._recolectarEstadoSistema();
  assert.deepStrictEqual(est.bodega.bajoMinimo.BA.productos.map(p => p.producto).sort(), ["Nutella", "Plátano"],
    "Bajo mínimo = saldo de Bodega contra el mínimo de Bodega (no el de quiosco)");
  console.log("  ✓ Administrador: Powerhouse (alta + mínimo), mantenimiento semanal y página de estado coherentes");
}

module.exports = { runSimulacionTests };
