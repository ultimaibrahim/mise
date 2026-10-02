/**
 * Suite de Pruebas: ⏳ monitor de progreso (1.7.6r) y Powerhouse con unidad de pedido/factor — código real en VM
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { crearContextoTienda } = require("../mocks/tiendaVm");

function runProgresoTests() {
  console.log("\n🧪 [TEST SUITE] ⏳ Monitor de progreso (diálogo sin bloqueo) · Powerhouse con unidad y factor");
  const { ss, sandbox } = crearContextoBDG();
  const cache = {};
  sandbox.CacheService = { getScriptCache: () => ({ put: (k, v) => { cache[k] = v; }, get: (k) => cache[k] || null }) };

  // 1. Servidor: Configurar reporta cada paso (aunque falle por el entorno de prueba, nunca se queda colgado)
  const final = JSON.parse(sandbox.ejecutarConMonitor("configurar", "r1"));
  assert.strictEqual(final.pasos.length, 10, "Configurar reporta sus 10 pasos (sin llenado masivo de factores)");
  assert.ok(!final.pasos.some(p => /Factores/.test(p.nombre)), "Configurar NO llena factores en masa");
  assert.ok(final.pasos.every(p => (p.estado === "ok" || p.estado === "falla") && typeof p.ms === "number"), "Cada paso termina con estado y duración");
  assert.ok(final.fin === true && typeof final.titulo === "string", "Cierre con título");
  assert.deepStrictEqual(JSON.parse(sandbox.leerProgreso("r1")), final, "El diálogo lee lo mismo desde la caché");
  assert.throws(() => sandbox.ejecutarConMonitor("setupCompleto", "r2"), /no permitido/, "Solo procesos de la lista permitida");
  console.log("  ✓ Servidor: cada paso con ⏳/✅/❌ y tiempo en caché; solo procesos permitidos");

  // 2. Cliente: el script real del diálogo pinta los pasos y habilita Cerrar al terminar
  let html = fs.readFileSync(path.join(__dirname, "..", "..", "bdg", "ProgresoDialog.html"), "utf8");
  html = html.replace("<?!= JSON.stringify(runId) ?>", '"r1"').replace("<?!= JSON.stringify(proceso) ?>", '"configurar"').replace("<?!= JSON.stringify(totalPasos) ?>", "10");
  const nodos = {};
  const nodo = () => ({ innerHTML: "", textContent: "", disabled: true, style: {}, classList: { remove() {}, add() {} } });
  const doc = { getElementById: (id) => (nodos[id] = nodos[id] || nodo()) };
  const llamadas = [];
  const run = {
    withSuccessHandler(ok) { this.ok = ok; return this; }, withFailureHandler() { return this; },
    ejecutarConMonitor(proc, id) { llamadas.push(proc + ":" + id); this.ok(JSON.stringify(final)); },
    leerProgreso() { this.ok(JSON.stringify(final)); }
  };
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document: doc, google: { script: { run, host: { close() {} } } }, setTimeout: () => {}, JSON, Math, String });
  assert.deepStrictEqual(llamadas, ["configurar:r1"], "Lanza el proceso con su id");
  assert.ok(/Nombres de pestañas/.test(nodos.pasos.innerHTML) && /Conexiones/.test(nodos.pasos.innerHTML), "Pinta los pasos");
  assert.strictEqual(nodos.cerrar.disabled, false, "Al terminar se habilita Cerrar");
  assert.ok(!/undefined|NaN/.test(nodos.pasos.innerHTML), "Sin undefined/NaN");
  console.log("  ✓ Diálogo: lanza el proceso, pinta cada paso en vivo y habilita Cerrar al terminar");

  // 2b. (1.7.7c) Todos los procesos pesados de Bodega abren el monitor y siempre cierran (aunque fallen)
  const abiertos = [];
  const abrirReal = sandbox._abrirMonitor;
  sandbox._abrirMonitor = (p) => abiertos.push(p);
  const getUiPrevio = sandbox.SpreadsheetApp.getUi;
  sandbox.SpreadsheetApp.getUi = () => ({ alert: () => sandbox.SpreadsheetApp.getUi().Button.YES, Button: { YES: "YES" }, ButtonSet: {} });
  ["descontarSurtidoAutomaticoManualmente", "descontarSurtidoAyerManualmente", "reconciliarSemanaCompletaDesdeLogs",
   "ejecutarMantenimientoSemanalManualmente", "repararYSincronizarSistemaManualmente"].forEach(f => sandbox[f]());
  sandbox._abrirMonitor = abrirReal;
  sandbox.SpreadsheetApp.getUi = getUiPrevio;
  assert.deepStrictEqual(abiertos, ["descontarHoy", "descontarAyer", "reconciliar", "mantenimiento", "reparar"], "Cada opción del menú abre su monitor");
  ["mantenimiento", "reparar"].forEach(p => {
    const r = JSON.parse(sandbox.ejecutarConMonitor(p, "m-" + p));
    assert.ok(r.fin === true && r.titulo && r.pasos.every(x => x.estado !== "corriendo"), `${p}: cierra sin pasos colgados`);
  });
  const repD = sandbox._reporteProgreso("");
  assert.ok(/ocupada/.test(JSON.parse(sandbox._cerrarDescuento(repD, undefined)).titulo), "Descuento con Bodega ocupada → aviso, no error");
  const fuera = JSON.parse(sandbox._cerrarDescuento(sandbox._reporteProgreso(""), { totalDescontados: 1, totalOmitidosDuplicados: 0, totalVaciadosTiendas: 1, fueraDeSemana: ["Mercado"] }));
  assert.ok(fuera.ok === false && /Mercado/.test(fuera.resumen), "Una bodega fuera de semana se marca como observación");
  assert.strictEqual(sandbox.ejecutarMantenimientoSemanalBDG.length, 0, "El activador semanal no recibe el reporte (su argumento es el evento)");
  console.log("  ✓ Bodega: descuentos, reconciliación, mantenimiento y diagnóstico abren el monitor y siempre cierran");

  // 2c. Tiendas: mismo monitor (ProgresoDialog.html se copia desde bdg/)
  const tv = crearContextoTienda("pda", "miseAuthPDA.js");
  tv.sandbox.CacheService = sandbox.CacheService;
  const abiertosT = [];
  tv.sandbox._abrirMonitor = (p) => abiertosT.push(p);
  tv.sandbox.configurarEsteLibroTienda();
  tv.sandbox.repararSistemaTienda();
  assert.deepStrictEqual(abiertosT, ["configurar", "reparar"], "Tienda: Configurar y reparar abren el monitor");
  const cfgT = JSON.parse(tv.sandbox.ejecutarConMonitor("configurar", "t1"));
  assert.strictEqual(cfgT.pasos.length, 7, "Tienda: Configurar reporta sus 7 pasos");
  assert.ok(cfgT.fin && cfgT.pasos.every(x => x.estado !== "corriendo"), "Tienda: Configurar cierra sin pasos colgados");
  const repT = JSON.parse(tv.sandbox.ejecutarConMonitor("reparar", "t2"));
  assert.ok(repT.fin && repT.pasos.every(x => x.estado !== "corriendo"), "Tienda: reparar cierra (aunque falte el enlace en la prueba)");
  assert.throws(() => tv.sandbox.ejecutarConMonitor("setupCompleto", "t3"), /no permitido/, "Tienda: solo procesos permitidos");
  assert.ok(fs.existsSync(path.join(__dirname, "..", "..", "pda", "ProgresoDialog.html")), "build-tienda copia el diálogo a las tiendas");
  console.log("  ✓ Tiendas: Configurar, reparar y actualizar estructura con el mismo monitor");

  // 3. Powerhouse guarda unidad de pedido y factor (y rechaza un factor inválido)
  const probe = ss.insertSheet("__p__");
  const rp = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);
  const setFormulasPrevio = rp.setFormulas;
  rp.setFormulas = function(m) { return this.setValues(m); };
  try {
    const m = ss.insertSheet("MAESTRO");
    m.getRange(3, 1, 1, 8).setValues([["No", "CATEGORÍA", "PRODUCTO", "PRESENTACION", "UNIDAD", "ACTIVO", "UNIDAD_TIENDA", "FACTOR_CONVERSION"]]);
    m.getRange(4, 1, 2, 8).setValues([[1, "LAC", "Leche", "LT", "lt", "SÍ", "", ""], [2, "DES", "Guantes", "CAJA", "pz", "SÍ", "caja", 100]]);
    ["KARDEX_BA", "KARDEX_BM"].forEach(k => ss.insertSheet(k).getRange(7, 1, 2, 5).setValues([[1, "LAC", "Leche", "LT", "lt"], [2, "DES", "Guantes", "CAJA", "pz"]]));
    sandbox._ordenarYRenumerarTodo = () => {};
    sandbox.powerhouseGuardarCatalogo("BA", { nuevos: [], eliminados: [], picking: [],
      ediciones: [{ originalName: "Leche", name: "Leche", unitTienda: "Caja", factor: "12" }, { originalName: "Guantes", name: "Guantes", factor: "abc" }] });
    assert.deepStrictEqual([m.getRange(4, 7).getValue(), m.getRange(4, 8).getValue()], ["caja", 12], "Leche: caja de 12 lt");
    assert.strictEqual(m.getRange(5, 8).getValue(), "", "Factor inválido → vacío (sin conversión), nunca texto");
    console.log("  ✓ Powerhouse: guarda unidad de pedido y factor; un factor inválido queda vacío");
  } finally {
    rp.setFormulas = setFormulasPrevio;
  }
}

module.exports = { runProgresoTests };
