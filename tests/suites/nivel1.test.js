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
      ["descontarSurtidoAutomatico", "ejecutarMantenimientoSemanalBDG", "onEditBodegaInstalable"], "Juego exacto");
    assert.ok(sa.estado.creados[2].tipo.includes("onEdit()"), "onEdit instalable sobre el libro");
    console.log("  ✓ Bodega: reinicio total deja descuento 23:00, mantenimiento dominical y onEdit instalable");
  }

  // 2. Tienda: reinicio total 00:00 + 04:00
  {
    const { sandbox } = crearContextoTienda("pda", "miseAuthPDA.js");
    const sa = scriptAppGrabador(["sincronizarEstados", "_resetearPedidoSilencioso"]);
    sandbox.ScriptApp = sa.api;
    const r = sandbox._reiniciarActivadoresTienda();
    assert.strictEqual(r.borrados.length, 2, "Borra sincronizarEstados cada 10 min y el viejo reset");
    assert.deepStrictEqual(sa.estado.creados.map(t => [t.h, t.tipo.find(x => x.startsWith("atHour"))]),
      [["_resetearPedidoSilencioso", "atHour(0)"], ["_checkAutoResetNuevoDia", "atHour(4)"]], "Reset 00:00 y respaldo 04:00");
    console.log("  ✓ Tienda: reinicio total deja reset 00:00 y respaldo 04:00");
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
    sandbox.PropertiesService.getScriptProperties().setProperty("PDA_SPREADSHEET_ID", ""); // no contaminar otras suites
    console.log("  ✓ Push de Bodega refresca el IMPORTRANGE y des-congela un _SYNC con valores fijos");
  }
}

module.exports = { runNivel1Tests };
