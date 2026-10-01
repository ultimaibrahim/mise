/**
 * Suite de Pruebas: 💓 latido de tienda y 🩺 resumen de salud de Bodega (1.7.6g) — código real en VM
 * Integración: el _ESTADO que escribe la tienda emulada es el que Bodega lee (openById por ID).
 */
const assert = require("assert");
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { crearContextoTienda } = require("../mocks/tiendaVm");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { MockPropertiesService } = require("../mocks/gasMocks");

const HANDLERS_TIENDA = ["_resetearPedidoSilencioso", "_checkAutoResetNuevoDia", "onEditTiendaInstalable", "onOpenTiendaInstalable"];

function runEstadoTests() {
  console.log("\n🧪 [TEST SUITE] 🩺 Latido de tiendas y estado del sistema");

  // ── 1. Latido de tienda ──────────────────────────────────────────────────────────────────
  const tienda = crearContextoTienda("pda", "miseAuthPDA.js");
  tienda.sandbox.ScriptApp = { getProjectTriggers: () => HANDLERS_TIENDA.map(h => ({ getHandlerFunction: () => h })) };
  tienda.ss.insertSheet("_SYNC_BA").getRange(4, 1).setFormula('=IMPORTRANGE("x", "VISTA_MOVIL_BA!A4:L")');
  const valor = (clave) => {
    const h = tienda.ss.getSheetByName("_ESTADO");
    const fila = h.getRange(1, 1, h.getLastRow(), 2).getValues().find(r => r[0] === clave);
    return fila ? fila[1] : undefined;
  };

  assert.strictEqual(tienda.sandbox._latidoTienda("apertura"), true, "Primer latido escribe");
  assert.ok(/^\d+\.\d+\.\d+[a-z]?$/.test(valor("VERSION")), "Versión en el latido");
  assert.strictEqual(valor("SYNC_VIVO"), "SI", "Detecta el IMPORTRANGE vivo");
  assert.strictEqual(valor("ACTIVADORES"), HANDLERS_TIENDA.join(", "), "Lista de activadores");
  assert.strictEqual(tienda.sandbox._latidoTienda("edición"), false, "Dentro de 10 min: no vuelve a escribir");
  assert.strictEqual(valor("ORIGEN_LATIDO"), "apertura", "Se conserva el latido anterior");
  tienda.sandbox._resetearPedidoSilencioso({ triggerUid: "t1" });
  assert.strictEqual(valor("ORIGEN_LATIDO"), "reset 00:00", "El reset del activador late aunque haya latido reciente");
  assert.ok(valor("ULTIMO_RESET") !== "" && !isNaN(new Date(valor("ULTIMO_RESET")).getTime()), "Registra la hora del último reset");
  console.log("  ✓ Tienda: latido en _ESTADO (versión, enlace, activadores), máximo 1 cada 10 min y forzado en el reset");

  // ── 2. Resumen en Bodega ─────────────────────────────────────────────────────────────────
  const props = MockPropertiesService.getScriptProperties();
  const claves = ["PDA_SPREADSHEET_ID", "PDM_SPREADSHEET_ID", "BODEGA_ID_BA", "BODEGA_ID_BM", "BODEGA_URL_BA", "BODEGA_URL_BM",
    "PDA_SPREADSHEET_URL", "PDM_SPREADSHEET_URL", "HISTORIAL_CIERRES", "MISE_ENV"];
  const previas = {};
  claves.forEach(k => { previas[k] = props.getProperty(k); props.setProperty(k, ""); });
  props.setProperty("PDA_SPREADSHEET_ID", "ID_PDA");
  props.setProperty("PDM_SPREADSHEET_ID", "ID_PDM");
  try {
    const { ss, sandbox } = crearContextoBDG();
    let aperturas = 0;
    sandbox.SpreadsheetApp.openById = (id) => { aperturas++; if (id === "ID_PDA") return tienda.ss; throw new Error("sin acceso"); };
    sandbox.ScriptApp = { getProjectTriggers: () => ["descontarSurtidoAutomatico", "onEditBodegaInstalable", "onOpenBodegaInstalable"]
      .map(h => ({ getHandlerFunction: () => h })) };
    const enVm = (expr) => vm.runInContext(expr, sandbox);

    ss.insertSheet("KARDEX_BA").getRange(4, 7).setValue(enVm("_obtenerLunesSemanaActual()"));
    ss.insertSheet("KARDEX_BM").getRange(4, 7).setValue(enVm("(() => { const d = _obtenerLunesSemanaActual(); d.setDate(d.getDate() - 14); return d; })()"));
    ss.insertSheet("VISTA_MOVIL_BA").getRange(4, 1, 3, 12).setValues([
      [1, "FRUTAS", "Fresa", "kg", 1, "", 0, 0, "SÍ", 3, 6, 1],
      [2, "LÁCTEOS", "Leche", "lt", 5, "", 0, 0, "SÍ", 2, 8, 2],
      [3, "ABARROTES", "Harina", "kg", 0, "", 0, 0, "NO", 2, 5, 3]]);
    const log = ss.insertSheet("🗒 LOG");
    log.getRange(1, 1, 4, 7).setValues([
      ["TIMESTAMP", "NIVEL", "FUNCIÓN", "DURACIÓN (ms)", "DETALLE", "USUARIO", "STACK"],
      [enVm("new Date()"), "ERROR", "MiseSmartSync", 0, "Error al descontar: prueba", "", ""],
      [enVm("new Date()"), "INFO", "MiseSmartSync", 90000, "Descuento completado", "", ""],
      [enVm("new Date(Date.now() - 10 * 86400000)"), "WARN", "viejo", 0, "fuera de ventana", "", ""]]);
    sandbox._registrarCierre({ fecha: new Date(Date.now() - 2 * 3600000).toISOString(), ok: true, manual: false, ms: 30000, descontados: 5 });

    const r = sandbox.obtenerEstadoSistema(true);
    const est = (id) => (r.componentes.find(c => c.id === id) || {}).estado;
    assert.strictEqual(est("bdg.activadores"), "falla", "Falta el mantenimiento semanal → rojo");
    assert.strictEqual(est("bdg.cierre"), "ok", "Cierre de hace 2 h → verde");
    assert.strictEqual(est("kardex.BA"), "ok", "Kardex Andares en la semana actual");
    assert.strictEqual(est("kardex.BM"), "aviso", "Kardex Mercado 2 semanas atrás → amarillo");
    ["BA.latido", "BA.reset", "BA.activadores", "BA.sync", "BA.version"].forEach(id => assert.strictEqual(est(id), "ok", `${id} verde con el latido real de la tienda`));
    assert.strictEqual(est("BM.acceso"), "falla", "Mercado inaccesible → rojo");
    assert.strictEqual(r.estadoGeneral, "falla", "El estado general es el peor componente");
    assert.strictEqual(r.bodega.bajoMinimo.BA.total, 1, "Solo Fresa bajo mínimo (Harina inactiva no cuenta)");
    assert.strictEqual(r.bodega.incidentes.length, 1, "Incidentes: solo WARN/ERROR de los últimos 7 días");
    assert.strictEqual(r.bodega.minutosHoy, 1.5, "Minutos de hoy desde las duraciones del LOG");
    console.log("  ✓ Bodega: semáforo por componente, bajo mínimo, incidentes de 7 días y minutos del día");

    const antes = aperturas;
    const r2 = sandbox.obtenerEstadoSistema();
    assert.strictEqual(aperturas, antes, "Dentro de 10 min responde del resumen guardado sin abrir tiendas");
    assert.strictEqual(r2.generado, r.generado, "Mismo resumen");
    console.log("  ✓ Resumen guardado: la consulta no abre tiendas mientras esté vigente (10 min)");

    // Reglas de antigüedad (función pura)
    const ahora = enVm("new Date()");
    const conLatido = (horas) => sandbox._evaluarComponentes({ bodega: { activadores: [], cierres: [], kardex: {}, version: "x" },
      tiendas: { BA: { nombre: "Andares", accesible: true, conLatido: true,
        estado: { ULTIMO_LATIDO: new Date(Date.now() - horas * 3600000).toISOString(), VERSION: "x", SYNC_VIVO: "SI", ACTIVADORES: HANDLERS_TIENDA.join(", ") } } } }, ahora)
      .find(c => c.id === "BA.latido").estado;
    assert.deepStrictEqual([conLatido(3), conLatido(30), conLatido(72)], ["ok", "aviso", "falla"], "Latido: ≤24 h verde, ≤48 h amarillo, más rojo");
    const cierreFallido = sandbox._evaluarComponentes({ bodega: { activadores: [], kardex: {}, version: "x",
      cierres: [{ fecha: new Date().toISOString(), ok: false, error: "Timeout" }] }, tiendas: {} }, ahora).find(c => c.id === "bdg.cierre");
    assert.strictEqual(cierreFallido.estado, "falla", "Cierre con error → rojo");
    console.log("  ✓ Reglas: latido 24/48 h y cierre fallido");

    // ── 3. Página de estado (1.7.6h) ──────────────────────────────────────────────────────
    const salida = sandbox.doGet({});
    assert.strictEqual(salida.archivo, "EstadoSistema", "doGet sirve EstadoSistema.html");
    const web = JSON.parse(sandbox.obtenerEstadoWeb(false));
    assert.ok(web.componentes.length > 0 && Array.isArray(web.accesos), "obtenerEstadoWeb: resumen + accesos como JSON");
    assert.ok(web.accesos.some(a => a.nombre.includes("Andares") && a.url.includes("ID_PDA")), "Acceso directo a la tienda por su ID");

    const html = fs.readFileSync(path.join(__dirname, "..", "..", "bdg", "EstadoSistema.html"), "utf8");
    const codigoBDG = ["miseAuthBDG.js", "MiseKardexEngine.js", "MiseEstado.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "..", "bdg", f), "utf8")).join("\n");
    const llamadas = [...html.matchAll(/\.withFailureHandler\([\s\S]*?\)\s*\.(\w+)\(/g)].map(m => m[1]);
    assert.ok(llamadas.length > 0 && llamadas.every(fn => new RegExp(`function ${fn}\\(`).test(codigoBDG)), `Funciones del servidor existen: ${llamadas}`);
    assert.ok(!/\$\{(?!esc\()[^}]*\.(detalle|nombre|producto|error|funcion)\b/.test(html.replace(/esc\([^)]*\)/g, "")), "Todo texto de datos pasa por esc()");

    // Ejecuta el script de la página con un DOM mínimo y el resumen real (incluye un incidente con HTML)
    web.bodega.incidentes.push({ fecha: new Date().toISOString(), nivel: "ERROR", funcion: "x", detalle: "<img src=x onerror=alert(1)>" });
    const nodos = {};
    const nodo = () => ({ innerHTML: "", textContent: "", disabled: false, classList: { add() {}, remove() {} } });
    const doc = { getElementById: (id) => (nodos[id] = nodos[id] || nodo()) };
    const run = { withSuccessHandler(ok) { this.ok = ok; return this; }, withFailureHandler() { return this; },
      obtenerEstadoWeb() { this.ok(JSON.stringify(web)); } };
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, { document: doc, google: { script: { run } }, Date, Math, JSON, Object, String, isNaN });
    const pagina = nodos.contenido.innerHTML;
    assert.ok(/Hay fallas que atender/.test(pagina) && /Cierres nocturnos/.test(pagina) && /Bajo mínimo/.test(pagina) && /Accesos directos/.test(pagina), "La página pinta todas las secciones");
    assert.ok(!/undefined|NaN/.test(pagina), "Sin 'undefined' ni 'NaN' en la página");
    assert.ok(!/<img src=x/.test(pagina) && /&lt;img src=x/.test(pagina), "El HTML de un log se muestra escapado");
    console.log("  ✓ Página de estado: doGet, datos + accesos, script ejecutado con el resumen real y contenido escapado");

    // ── 4. Suscripción al catálogo por huella (1.7.6i) ─────────────────────────────────────
    const filasVista = [[1, "FRUTAS", "Fresa", "kg", 1, "", 0, 0, "SÍ", 3, 6, 2], [2, "LÁCTEOS", "Leche", "lt", 5, "", 0, 0, "SÍ", 2, 8, 1]];
    assert.strictEqual(tienda.sandbox._huellaCatalogo(filasVista), sandbox._huellaCatalogo(filasVista), "Tienda y Bodega calculan la misma huella");
    const saldoDistinto = filasVista.map(r => r.slice()); saldoDistinto[0][4] = 99;
    assert.strictEqual(sandbox._huellaCatalogo(saldoDistinto), sandbox._huellaCatalogo(filasVista), "El saldo no cambia la huella (solo producto, activo y picking)");

    const t2 = crearContextoTienda("pda", "miseAuthPDA.js");
    let reordenes = 0;
    t2.sandbox.ordenarPedido = () => { reordenes++; };
    const sync2 = t2.ss.insertSheet("_SYNC_BA");
    sync2.getRange(4, 1, 2, 12).setValues(filasVista);
    assert.strictEqual(t2.sandbox._sincronizarSiCambioCatalogo("apertura"), true, "Primera vez: aplica el catálogo");
    assert.strictEqual(t2.sandbox._sincronizarSiCambioCatalogo("apertura"), false, "Sin cambios: no reordena");
    sync2.getRange(4, 9).setValue("NO");
    assert.strictEqual(t2.sandbox._sincronizarSiCambioCatalogo("reset 00:00"), true, "Desactivar un producto en Bodega: reordena");
    sync2.getRange(5, 3).setValue("Loading...");
    sync2.getRange(5, 12).setValue(7);
    assert.strictEqual(t2.sandbox._sincronizarSiCambioCatalogo("apertura"), false, "Enlace cargando: nunca reordena con datos a medias");
    assert.strictEqual(reordenes, 2, "Solo 2 reordenamientos");
    console.log("  ✓ Catálogo: misma huella en tienda y Bodega; reordena solo si cambió y nunca con el enlace cargando");

    // Pedido cómodo en el celular (1.7.6u): filas altas y PRODUCTO / CANT. A PEDIR más grandes
    const ped = t2.ss.insertSheet("📋 PEDIDO DIARIO");
    const alturas = [], tamanos = {};
    ped.setRowHeights = (r, n, h) => { alturas.push([r, n, h]); return ped; };
    const rpT = Object.getPrototypeOf(ped.getRange(1, 1));
    const setFontSizePrevio = rpT.setFontSize;
    rpT.setFontSize = function(t) { tamanos[`${this.row},${this.col}`] = t; return this; };
    try { t2.sandbox._estiloTactilPedido(ped, 5); } finally { rpT.setFontSize = setFontSizePrevio; }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(alturas)), [[4, 5, 34]], "Filas de 34 px");
    assert.ok(tamanos["4,3"] === 12 && tamanos["4,6"] === 13, "PRODUCTO 12 y CANT. A PEDIR 13");
    assert.strictEqual(tamanos["2,6"], 20, "Casilla de 🚚 Surtido Rápido (F2) más grande");
    // Surtido Rápido táctil: sin columnas después de K ni filas sobrantes; casillas grandes
    const sur = t2.ss.insertSheet("🚚 SURTIDO RÁPIDO");
    const colsOcultas = [], filasOcultas = [];
    sur.getMaxColumns = () => 26; sur.getMaxRows = () => 1000;
    sur.hideColumns = (c, n) => { colsOcultas.push([c, n]); return sur; };
    sur.hideRows = (r, n) => { filasOcultas.push([r, n]); return sur; };
    sur.showRows = () => sur; sur.setRowHeights = () => sur;
    const tam2 = {};
    rpT.setFontSize = function(t) { tam2[`${this.row},${this.col}`] = t; return this; };
    try { t2.sandbox._estiloTactilSurtido(sur, 12); } finally { rpT.setFontSize = setFontSizePrevio; }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(colsOcultas)), [[12, 15]], "Oculta L:Z (nada a la derecha del resumen)");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(filasOcultas)), [[17, 984]], "Oculta las filas después de los datos (deja 1 de aire)");
    assert.strictEqual(tam2["4,6"], 18, "Casillas ✅/❌ grandes");
    console.log("  ✓ Pedido Diario: filas altas, letra grande, casilla 🚚 grande · Surtido sin desplazarse lejos y casillas grandes");

    const catalogo = (huellaTienda) => sandbox._evaluarComponentes({ bodega: { activadores: [], cierres: [], kardex: {}, version: "x", huellas: { BA: "2-abc" } },
      tiendas: { BA: { nombre: "Andares", accesible: true, conLatido: true, estado: { ULTIMO_LATIDO: new Date().toISOString(), VERSION: "x",
        SYNC_VIVO: "SI", ACTIVADORES: HANDLERS_TIENDA.join(", "), CATALOGO_HUELLA: huellaTienda } } } }, ahora).find(c => c.id === "BA.catalogo").estado;
    assert.deepStrictEqual([catalogo("2-abc"), catalogo("2-old")], ["ok", "aviso"], "Semáforo del catálogo: al día / pendiente");
    console.log("  ✓ Página de estado: catálogo al día o pendiente por tienda");
  } finally {
    claves.forEach(k => props.setProperty(k, previas[k] || ""));
  }
}

module.exports = { runEstadoTests };
