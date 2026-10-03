/**
 * Suite de Pruebas: 🌅 el reinicio "de respaldo" no borra un pedido ya capturado (1.7.7h) — código real en VM
 * Caso real (Mercado PROD, 02/oct/2026): el reset de las 00:00 no marcaba la fecha, el respaldo de las 04:00 no corrió
 * y la primera apertura del día limpió el pedido que ya estaba capturado.
 */
const assert = require("assert");
const vm = require("vm");
const { crearContextoTienda } = require("../mocks/tiendaVm");

function runResetAperturaTests() {
  console.log("\n🧪 [TEST SUITE] 🌅 Reinicio diario: la apertura nunca borra un pedido en horario de operación");
  const { sandbox } = crearContextoTienda("pdm", "miseAuthPDM.js");
  const props = sandbox.PropertiesService.getScriptProperties();
  const claves = ["LAST_AUTO_RESET_DATE", "ULTIMO_RESET_TS", "ULTIMO_RESET_ERROR", "AVISO_SIN_RESET"];
  const previas = {};
  claves.forEach(k => { previas[k] = props.getProperty(k); });

  // Reloj controlado dentro de la VM (hora local del script)
  sandbox.__AHORA__ = 0;
  vm.runInContext(`(() => { const R = Date; Date = class extends R {
    constructor(...a) { if (a.length) super(...a); else super(__AHORA__); }
    static now() { return __AHORA__; } }; })()`, sandbox);
  const en = (d, h, m = 0) => { sandbox.__AHORA__ = vm.runInContext(`new Date(2026, 9, ${d}, ${h}, ${m}).getTime()`, sandbox); };

  let limpiezas = 0;
  sandbox._resetearPedidoSilenciosoCore = () => { limpiezas++; };
  const avisos = [];
  const logger = vm.runInContext("MiseLogger", sandbox);
  const warnOriginal = logger.warn;
  logger.warn = (f, msg) => { avisos.push(`${f}: ${msg}`); };
  const limpiar = () => claves.forEach(k => props.setProperty(k, ""));

  try {
    // 1. El caso de Mercado: 00:00 corre, 04:00 no, se captura y alguien abre a media mañana
    limpiar();
    props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-01");
    en(2, 0, 1); sandbox._resetearPedidoSilencioso({ triggerUid: "t-00" });
    assert.strictEqual(limpiezas, 1, "El reset de las 00:00 limpia una vez");
    en(2, 10, 30); sandbox.onOpenTiendaInstalable({});
    assert.strictEqual(limpiezas, 1, "Abrir a las 10:30 NO vuelve a limpiar (antes borraba el pedido capturado)");
    en(2, 11); sandbox._checkAutoResetNuevoDia();
    assert.strictEqual(limpiezas, 1, "Ni la segunda apertura");
    console.log("  ✓ Reset 00:00 + apertura a media mañana: el pedido capturado se queda");

    // 2. El respaldo de las 04:00 no repite un reset que ya ocurrió
    limpiar();
    props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-02");
    en(3, 0, 1); sandbox._resetearPedidoSilencioso({ triggerUid: "t-00" });
    props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-02"); // como si viniera de una versión vieja que no la marcaba
    en(3, 4, 2); sandbox._checkAutoResetNuevoDia({ triggerUid: "t-04" });
    assert.strictEqual(limpiezas, 2, "A las 04:00, con el reset de hoy ya hecho, solo se marca la fecha");
    assert.strictEqual(props.getProperty("LAST_AUTO_RESET_DATE"), "2026-10-03", "La fecha queda marcada");
    console.log("  ✓ Respaldo 04:00: no repite el reset si el de las 00:00 ya corrió");

    // 3. Sin ningún reset hoy: el respaldo de las 04:00 sí limpia (es su trabajo)
    limpiar();
    props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-03");
    en(4, 4, 2); sandbox._checkAutoResetNuevoDia({ triggerUid: "t-04" });
    assert.strictEqual(limpiezas, 3, "Si las 00:00 fallaron, el respaldo de las 04:00 limpia");
    console.log("  ✓ Respaldo 04:00: limpia cuando el de las 00:00 no corrió");

    // 4. Sin ningún reset hoy y en horario de operación: la apertura avisa y NO limpia
    limpiar();
    props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-04");
    en(5, 9, 15); sandbox.onOpenTiendaInstalable({});
    assert.strictEqual(limpiezas, 3, "Abrir a las 09:15 sin reset del día no borra nada");
    assert.ok(avisos.some(a => /NO se limpió el pedido/.test(a)), "Deja aviso en el registro");
    en(5, 9, 40); sandbox._checkAutoResetNuevoDia();
    assert.strictEqual(avisos.filter(a => /NO se limpió el pedido/.test(a)).length, 1, "El aviso se escribe una vez al día");
    en(5, 5, 30); props.setProperty("AVISO_SIN_RESET", ""); props.setProperty("LAST_AUTO_RESET_DATE", "2026-10-04");
    sandbox._checkAutoResetNuevoDia();
    assert.strictEqual(limpiezas, 4, "Antes de las 06:00 la apertura sí hace el reset pendiente");
    console.log("  ✓ Apertura sin reset del día: antes de las 06:00 limpia; después solo avisa (nunca borra capturas)");
  } finally {
    logger.warn = warnOriginal;
    claves.forEach(k => props.setProperty(k, previas[k] || ""));
  }
}

// Caso 2 (1.7.7i): abrir con la estructura vieja del Pedido (PRODUCTO = fila de _SYNC) mientras el IMPORTRANGE carga.
// C4 se ve vacío y el armado inicial reconstruía el pedido SIN cantidades y sin registro.
function _pruebaAperturaConEnlaceCargando() {
  const { cargarEmuladorAislado } = require("../mocks/aislado");
  const E = cargarEmuladorAislado({ formulas: true });
  const { ss, sandbox: T } = E.crearContextoTienda("pdm", "miseAuthPDM.js",
    { BODEGA_KEY: "BM", BODEGA_URL_BM: "https://docs.google.com/spreadsheets/d/BODEGAPRUEBA1234567890/edit" });
  const props = T.PropertiesService.getScriptProperties();
  ["CATALOGO_HUELLA", "LAST_AUTO_RESET_DATE", "ULTIMO_RESET_TS"].forEach(k => props.setProperty(k, ""));
  const sync = ss.insertSheet("_SYNC_BM");
  const prods = ["Fresa", "Plátano", "Leche", "Guantes"];
  const llenarSync = () => sync.getRange(4, 1, prods.length, 12).setValues(prods.map((n, i) => [i + 1, "CAT", n, "pza", 10, "", 0, 0, "SÍ", 0, 0, i + 1]));
  ss.insertSheet("📋 PEDIDO DIARIO");
  T._reconstruirPedidoDiarioCore({});
  llenarSync();
  const ped = ss.getSheetByName("📋 PEDIDO DIARIO");
  prods.forEach((_, i) => { ped.getRange(4 + i, 2).setFormula(`='_SYNC_BM'!B${4 + i}`); ped.getRange(4 + i, 3).setFormula(`='_SYNC_BM'!C${4 + i}`); });
  [[0, 5], [2, 6], [3, 1]].forEach(([i, q]) => ped.getRange(4 + i, 6).setValue(q));
  props.setProperty("CATALOGO_HUELLA", T._huellaCatalogo(sync.getRange(4, 1, prods.length, 12).getValues()));
  const cantidades = () => ped.getRange(4, 6, prods.length, 1).getValues().map(r => r[0]);
  assert.deepStrictEqual(cantidades(), [5, "", 6, 1], "Pedido capturado (estructura vieja)");

  sync.getRange(4, 1, prods.length, 12).clearContent();
  sync.getRange(4, 1).setValue("Loading...");          // el IMPORTRANGE todavía carga al abrir
  T.onOpenTiendaInstalable({});
  assert.deepStrictEqual(cantidades(), [5, "", 6, 1], "Abrir con el enlace cargando no borra el pedido (antes quedaba vacío)");
  llenarSync();
  T._actualizarAvisoPedido();
  assert.deepStrictEqual(cantidades(), [5, "", 6, 1], "Ya cargado, las cantidades siguen en su lugar");
  console.log("  ✓ Abrir con el enlace a Bodega cargando (estructura vieja) no reconstruye ni borra el pedido");
}

module.exports = { runResetAperturaTests: () => { runResetAperturaTests(); _pruebaAperturaConEnlaceCargando(); } };
