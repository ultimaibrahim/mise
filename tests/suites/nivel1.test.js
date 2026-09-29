/**
 * Suite de Pruebas: Nivel 1 de UX/arquitectura (código real en VM)
 *  - Reinicio total de activadores (BDG incluye onEdit instalable; tiendas 00:00 + 04:00)
 *  - El push de Bodega a tiendas ya NO pisa el IMPORTRANGE de _SYNC con valores fijos
 *  - La tienda restaura sola un _SYNC congelado
 */
const assert = require("assert");
const { crearContextoBDG } = require("../mocks/bdgVm");
const { crearContextoTienda } = require("../mocks/tiendaVm");

// ScriptApp que registra lo que se crea/borra
function scriptAppGrabador(existentes) {
  const estado = { vivos: existentes.map(h => ({ getHandlerFunction: () => h, _h: h })), creados: [] };
  const trigger = (h) => {
    const t = { h, tipo: [] };
    const b = new Proxy({}, { get: (_, prop) => {
      if (prop === "create") return () => { estado.creados.push(t); return t; };
      return (...args) => { t.tipo.push(`${String(prop)}(${args.filter(a => typeof a !== "object").join(",")})`); return b; };
    } });
    return b;
  };
  return {
    estado,
    api: {
      getProjectTriggers: () => estado.vivos.slice(),
      deleteTrigger: (t) => { estado.vivos = estado.vivos.filter(v => v !== t); },
      newTrigger: (h) => trigger(h),
      WeekDay: { SUNDAY: "SUNDAY" }
    }
  };
}

function _pruebaAbrirLibro() {
  // 4. Conexión tienda → Bodega con URL en formatos que openByUrl rechaza
  const ID = "1bQR0TJUqY9jmtapblMiGY-FKCAB6xfLz535BLRgC_IY";
  ["https://docs.google.com/spreadsheets/u/0/d/" + ID + "/edit?usp=drivesdk#gid=0",
   "https://docs.google.com/spreadsheets/d/" + ID + "/edit",
   ID].forEach(ref => {
    const { sandbox, ss } = crearContextoTienda("pda", "miseAuthPDA.js", { BODEGA_URL_BA: ref });
    let pedido = null;
    sandbox.SpreadsheetApp.openById = (id) => { pedido = id; return { getName: () => "(at) | mise - Bodegas" }; };
    const sync = ss.insertSheet("_SYNC_BA");
    const rp = Object.getPrototypeOf(sync.getRange(1, 1));
    rp.getFormula = function() { return '=IMPORTRANGE("x", "VISTA_MOVIL_BA!A4:L")'; };
    const r = sandbox._diagnosticarConexionTienda();
    assert.strictEqual(pedido, ID, `Extrae el ID de: ${ref.substring(0, 50)}`);
    assert.ok(r.ok && r.linea.includes("(at) | mise - Bodegas"), "Conexión correcta por nombre");
  });
  console.log("  ✓ Tienda abre Bodega desde URL con /u/0/, parámetros, #gid o ID pelón");
}

function runNivel1Tests() {
  console.log("\n🧪 [TEST SUITE] Nivel 1 — activadores, enlace vivo con Bodega y configuración en un clic");

  // 1. Bodega: reinicio total con onEdit instalable
  {
    const { sandbox } = crearContextoBDG();
    const sa = scriptAppGrabador(["descontarSurtidoAutomatico", "descontarSurtidoAutomatico", "funcionQueYaNoExiste"]);
    sandbox.ScriptApp = sa.api;
    const r = sandbox._reiniciarActivadoresBDG();
    assert.strictEqual(r.borrados.length, 3, "Borra todos, incluidos duplicados y huérfanos");
    assert.strictEqual(sa.estado.vivos.length, 0, "No queda ninguno viejo");
    assert.deepStrictEqual(sa.estado.creados.map(t => t.h),
      ["descontarSurtidoAutomatico", "ejecutarMantenimientoSemanalBDG", "onEditBodegaInstalable", "onOpenBodegaInstalable"], "Juego exacto");
    assert.ok(sa.estado.creados[2].tipo.includes("onEdit()"), "onEdit instalable sobre el libro");
    assert.ok(sa.estado.creados[3].tipo.includes("onOpen()"), "onOpen instalable sobre el libro");
    assert.strictEqual(sandbox.PropertiesService.getScriptProperties().getProperty("ONOPEN_INSTALABLE"), "1", "Marca que existe el onOpen instalable");
    sandbox.PropertiesService.getScriptProperties().setProperty("ONOPEN_INSTALABLE", ""); // no contaminar otras suites
    console.log("  ✓ Bodega: reinicio total deja descuento 23:00, mantenimiento dominical, onEdit y onOpen instalables");
  }

  // 2. Tienda: reinicio total 00:00 + 04:00
  {
    const { sandbox } = crearContextoTienda("pda", "miseAuthPDA.js");
    const sa = scriptAppGrabador(["sincronizarEstados", "_resetearPedidoSilencioso"]);
    sandbox.ScriptApp = sa.api;
    const r = sandbox._reiniciarActivadoresTienda();
    assert.strictEqual(r.borrados.length, 2, "Borra sincronizarEstados cada 10 min y el viejo reset");
    assert.deepStrictEqual(sa.estado.creados.map(t => [t.h, t.tipo.find(x => x.startsWith("atHour")) || t.tipo.find(x => /^on(Edit|Open)/.test(x))]),
      [["_resetearPedidoSilencioso", "atHour(0)"], ["_checkAutoResetNuevoDia", "atHour(4)"],
       ["onEditTiendaInstalable", "onEdit()"], ["onOpenTiendaInstalable", "onOpen()"]], "Reset 00:00, respaldo 04:00 y edición/apertura instalables");
    console.log("  ✓ Tienda: reinicio total deja reset 00:00, respaldo 04:00 y onEdit/onOpen instalables");
  }

  // 3. Push de Bodega: refresca el IMPORTRANGE en vez de pisarlo con valores
  {
    const { ss, sandbox } = crearContextoBDG();
    const base = ss.constructor;
    const tienda = new base();
    const sync = tienda.insertSheet("_SYNC_BA");
    const IMPORT = '=IMPORTRANGE("https://docs.google.com/spreadsheets/d/BDG/edit", "VISTA_MOVIL_BA!A4:L")';
    sync.getRange(4, 1).setValue(IMPORT);
    const rp = Object.getPrototypeOf(sync.getRange(1, 1));
    rp.getFormula = function() { const v = this.getValue(); return (typeof v === "string" && v.startsWith("=")) ? v : ""; };
    rp.setFormula = function(f) { this.sheet._setCell(this.row, this.col, f); return this; };

    const vista = ss.insertSheet("VISTA_MOVIL_BA");
    vista.getRange(4, 1, 1, 12).setValues([[1, "REF", "Fresa", "kg", 5, "🟢", 0, 0, "SÍ", 1, 5, 1]]);
    sandbox.PropertiesService.getScriptProperties().setProperty("PDA_SPREADSHEET_ID", "TIENDA");
    sandbox.SpreadsheetApp.openById = () => tienda;
    ss.getUrl = () => "https://docs.google.com/spreadsheets/d/BDG/edit";
    sandbox.sincronizarRemotamenteTiendasPush("BA");
    assert.strictEqual(sync.getRange(4, 1).getValue(), IMPORT, "A4 conserva el IMPORTRANGE");
    assert.strictEqual(sync.getRange(4, 3).getValue(), "", "No escribe valores fijos encima del enlace");

    sync.getRange(4, 1, 1, 3).setValues([[1, "REF", "Fresa"]]); // _SYNC congelado (bug previo)
    sandbox.sincronizarRemotamenteTiendasPush("BA");
    assert.ok(/IMPORTRANGE\("https:\/\/docs.google.com\/spreadsheets\/d\/BDG\/edit", "VISTA_MOVIL_BA!A4:L"\)/.test(sync.getRange(4, 1).getValue()),
      "Un _SYNC congelado recupera el IMPORTRANGE desde Bodega");
    // Orden obligatorio: reordenar el pedido (lee capturas con _SYNC estable) ANTES de refrescar el enlace
    tienda.insertSheet("📋 PEDIDO DIARIO");
    const eventos = [];
    const reordenarReal = sandbox._reordenarPedidoRemotoDirecto;
    sandbox._reordenarPedidoRemotoDirecto = () => { eventos.push("reordenar"); };
    const setFormulaBase = rp.setFormula;
    rp.setFormula = function(f) { if (this.sheet === sync) eventos.push("refrescar"); return setFormulaBase.call(this, f); };
    // a) Mismas posiciones (picking/activos/cierre nocturno): solo refresca; la tienda se reordena sola por huella
    sync.getRange(4, 3).setValue("Fresa");
    sandbox.sincronizarRemotamenteTiendasPush("BA");
    assert.deepStrictEqual(eventos, ["refrescar"], "Mismas posiciones: no escribe en el pedido de la tienda, solo refresca el enlace");
    // b) Posiciones cambiadas (alta/baja): PRIMERO reordenar con _SYNC estable, al final refrescar
    eventos.length = 0;
    sync.getRange(4, 3).setValue("Leche");
    sandbox.sincronizarRemotamenteTiendasPush("BA");
    assert.deepStrictEqual(eventos, ["reordenar", "refrescar"], "Posiciones cambiadas: primero reordenar (capturas estables), al final refrescar el IMPORTRANGE");
    sandbox._reordenarPedidoRemotoDirecto = reordenarReal;
    rp.setFormula = setFormulaBase;
    console.log("  ✓ Push: solo reordena a distancia si cambiaron las posiciones (y entonces antes de refrescar el enlace)");

    // El escritor remoto respeta la estructura de CADA tienda (detectada por su encabezado)
    const filasSync = [[1, "REF", "Fresa", "kg", 5, "🟢", 0, 0, "SÍ", 1, 5, 2], [2, "LAC", "Leche", "lt", 3, "🟢", 0, 0, "SÍ", 2, 6, 1]];
    [[3, ["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO TEÓRICO","CANT. A PEDIR","DIFERENCIA","","","MÍN  |  MÁX"]],
     [2, ["No","CATEGORÍA","PRODUCTO","UNIDAD","SALDO TEÓRICO","CANT. A PEDIR","DIFERENCIA","","","","MÍN  |  MÁX"]]].forEach(([esq, enc]) => {
      const t = new base();
      const sy = t.insertSheet("_SYNC_BA");
      sy.getRange(4, 1, 2, 12).setValues(filasSync);
      const ped = t.insertSheet("📋 PEDIDO DIARIO");
      ped.getRange(3, 1, 1, enc.length).setValues([enc]);
      ped.getRange(4, 1, 2, 9).setValues([[1, "REF", "Fresa", "kg", "", 4, "", "", ""], [2, "LAC", "Leche", "lt", "", 2, "", "", ""]]);
      if (esq === 3) ped.getRange(4, 11).setValue("ARRAYFORMULA-AUX"); // auxiliar _ACTIVO en K (no debe pisarse)
      reordenarReal(t, sy, ped, filasSync);
      const colMinMax = esq === 3 ? 10 : 11;
      assert.ok(String(ped.getRange(4, colMinMax).getValue()).startsWith("=IF(AND('_SYNC_BA'!J"), `Esquema ${esq}: MÍN|MÁX en la columna ${colMinMax}`);
      assert.strictEqual(ped.getRange(4, 3).getValue(), "='_SYNC_BA'!C5", `Esquema ${esq}: Leche (picking 1) primero, enlazada a SU fila de _SYNC`);
      assert.strictEqual(ped.getRange(4, 6).getValue(), 2, `Esquema ${esq}: Leche conserva su captura`);
      if (esq === 3) assert.strictEqual(ped.getRange(4, 11).getValue(), "ARRAYFORMULA-AUX", "Esquema 3: no pisa las auxiliares (K)");
      else assert.strictEqual(ped.getRange(4, 10).getValue(), "", "Esquema 2: J reservada vacía");
    });
    console.log("  ✓ Escritor remoto de Bodega: respeta la estructura de cada tienda (esquema 2 y 3) y no pisa auxiliares");

    sandbox.PropertiesService.getScriptProperties().setProperty("PDA_SPREADSHEET_ID", ""); // no contaminar otras suites
    console.log("  ✓ Push de Bodega refresca el IMPORTRANGE y des-congela un _SYNC con valores fijos");
  }

  _pruebaAbrirLibro();
}

module.exports = { runNivel1Tests };
