/**
 * Suite de Pruebas: Motor de migración de esquema de tiendas (pda/pdm) — código real en VM
 * Escenario: tienda con estructura del 2026-09-06 (VLOOKUP en DIFERENCIA, Surtido de 7 columnas)
 * y capturas a medio día, incluida una cantidad que solo quedó en SURTIDO RÁPIDO.
 */
const assert = require("assert");
const { crearContextoTienda } = require("../mocks/tiendaVm");

const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

function _preparar(ctx) {
  const { ss } = ctx;
  const probe = ss.insertSheet("__p__");
  const sheetProto = Object.getPrototypeOf(probe);
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);
  // Métodos que usan la reconstrucción y el respaldo nativo
  sheetProto.copyTo = function(destino) {
    const copia = destino.insertSheet(`Copia de ${this.name}`);
    copia.grid = Object.assign({}, this.grid);
    return copia;
  };
  sheetProto.setName = function(n) {
    const book = ctx.ss;
    book.sheets.delete(this.name); this.name = n; book.sheets.set(n, this);
    return this;
  };
  if (!sheetProto.getMaxColumns) sheetProto.getMaxColumns = function() { return Math.max(this.getLastColumn(), 26); };
  if (!sheetProto.getMaxRows) sheetProto.getMaxRows = function() { return Math.max(this.getLastRow(), 200); };
  ["showRows", "hideRows", "showColumns", "setHiddenGridlines", "setTabColor", "autoResizeColumns"]
    .forEach(m => { if (!sheetProto[m]) sheetProto[m] = function() { return this; }; });
  ["setWrap", "setNote", "clearNote", "setFontSize"].forEach(m => { if (!rangeProto[m]) rangeProto[m] = function() { return this; }; });
  rangeProto.getFormula = function() { return ctx._formulas[`${this.sheet.name}!${this.row},${this.col}`] || ""; };
  const setFormulasBase = rangeProto.setFormulas;
  rangeProto.setFormulas = function(m) {
    setFormulasBase.call(this, m);
    // Los valores no-fórmula quedan como valor en la celda (igual que en Sheets)
    m.forEach((fila, r) => fila.forEach((f, c) => {
      // Como Google: fórmula → "ƒ…"; texto sin "=" en setFormulas → #NAME?; números/vacío tal cual
      const txt = typeof f === "string" && f !== "" && !f.startsWith("=");
      this.sheet._setCell(this.row + r, this.col + c, (typeof f === "string" && f.startsWith("=")) ? `ƒ${f}` : (txt ? "#NAME?" : f));
    }));
    return this;
  };
  rangeProto.setFormula = function(f) { ctx._formulas[`${this.sheet.name}!${this.row},${this.col}`] = f; this.sheet._setCell(this.row, this.col, `ƒ${f}`); return this; };

  // _SYNC con el catálogo vigente (Harina sigue; "Descontinuado" ya no existe)
  const sync = ss.insertSheet("_SYNC_BA");
  sync.getRange(4, 1, 3, 12).setValues([
    [1, "REF", "Fresa",  "DOMO", 10, "🟢", 0, 0, "SÍ", 1, 5, 3],
    [2, "LAC", "Leche",  "LT",   8,  "🟢", 0, 0, "NO", 1, 5, 1],
    [3, "ABA", "Harina", "KG",   3,  "🟢", 0, 0, "SÍ", 1, 5, 2]
  ]);

  // PEDIDO DIARIO con estructura vieja y capturas
  const pedido = ss.insertSheet("📋 PEDIDO DIARIO");
  pedido.getRange(4, 1, 4, 11).setValues([
    [1, "REF", "Fresa",         "DOMO", 10, 5, "VLOOKUP-viejo", 5,  "✅ Completo", "",        ""],
    [2, "LAC", "Leche",         "LT",   8,  4, "VLOOKUP-viejo", "", "",         "🚨 ADICIÓN", ""],
    [3, "ABA", "Harina",        "KG",   3,  "", "VLOOKUP-viejo", "", "",        "",           ""],
    [4, "ABA", "Descontinuado", "KG",   3,  3, "VLOOKUP-viejo", "", "",         "",           ""]
  ]);

  // SURTIDO RÁPIDO viejo (7 columnas): Leche capturada en 2 pero el sincronizado a PEDIDO falló
  const surtido = ss.insertSheet("🚚 SURTIDO RÁPIDO");
  // Encabezado del diseño viejo (A1:C1, D1:G1, A2:C2, D2:G2, I3:J3) con 3 columnas congeladas
  ["A1:C1", "D1:G1", "A2:C2", "D2:G2", "I3:J3"].forEach(r => surtido.getRange(r).merge());
  surtido.setFrozenRows(3);
  surtido.setFrozenColumns(3);
  surtido.getRange(3, 1, 1, 7).setValues([["No", "CATEGORÍA", "PRODUCTO", "CANT. PEDIDA", "CANT. RECIBIDA", "✅ COMPLETO", "❌ INEXISTENTE"]]);
  surtido.getRange(4, 1, 2, 7).setValues([
    [1, "REF", "Fresa", 5, 5, true,  false],
    [2, "LAC", "Leche", 4, 2, false, false]
  ]);
  return { pedido };
}

function runMigracionTests() {
  console.log("\n🧪 [TEST SUITE] 🔄 Motor de migración de esquema (tiendas)");

  [["pda", "miseAuthPDA.js"], ["pdm", "miseAuthPDM.js"]].forEach(([dir, archivo]) => {
    const tag = dir.toUpperCase();
    const ctx = crearContextoTienda(dir, archivo, { BODEGA_URL_BA: "https://docs.google.com/spreadsheets/d/DEV/edit" });
    const { ss, sandbox, props } = ctx;
    const { pedido } = _preparar(ctx);
    const pedidoFila = (r) => pedido.getRange(r, 1, 1, 10).getValues()[0];
    const filaDe = (nombre) => { for (let r = 4; r <= 6; r++) if (String(pedido.getRange(r, 3).getValue()).includes(`!C${ {Fresa: 4, Leche: 5, Harina: 6}[nombre] }`)) return r; return -1; };

    // 1. Onopen / edición normal (sin triggerUid) no migra
    sandbox._migrarSiEsActivador(undefined);
    assert.ok(!props.MISE_SCHEMA_VERSION, `${tag}: sin activador no migra`);

    // 2. Activador nocturno: migra, respalda y restaura capturas
    sandbox._migrarSiEsActivador({ triggerUid: "t-1" });
    assert.strictEqual(props.MISE_SCHEMA_VERSION, "2", `${tag}: esquema actualizado`);
    assert.ok(!("MISE_SCHEMA_MIGRANDO" in props), `${tag}: bandera de reintento limpia`);
    // Orden de picking (Leche, Harina, Fresa) y cada captura en SU producto
    eq([filaDe("Leche"), filaDe("Harina"), filaDe("Fresa")], [4, 5, 6], `${tag}: reconstruye en orden de picking, no de _SYNC`);
    eq(pedidoFila(6).slice(5, 10), [5, "=IF(OR(F6=\"\", H6=\"\"), \"\", H6 - F6)", 5, "COMPLETO", ""], `${tag}: Fresa restaurada con DIFERENCIA intra-fila`);
    eq(pedidoFila(4).slice(5, 10), [4, "=IF(OR(F4=\"\", H4=\"\"), \"\", H4 - F4)", 2, "PARCIAL", "🚨 ADICIÓN"], `${tag}: Leche toma la captura de SURTIDO y conserva la adición`);
    eq(pedidoFila(5).slice(5, 10)[0], "", `${tag}: Harina sin captura`);
    // Inactivo y semáforo por producto (columnas auxiliares por nombre), sin INDIRECT(ROW())
    assert.ok(String(ctx._formulas["📋 PEDIDO DIARIO!4,12"]).startsWith("=ARRAYFORMULA(IF(C4:C=\"\",,IFERROR(VLOOKUP(C4:C,'_SYNC_BA'!C4:K,{7,3,8,9},FALSE)"), `${tag}: auxiliares L:O por nombre`);
    const reglas = pedido._cf.map(r => r.formula);
    assert.ok(reglas.includes('=$L4="NO"'), `${tag}: gris de inactivo por la fila del propio producto`);
    assert.ok(reglas.every(f => !f.includes("INDIRECT")), `${tag}: sin reglas INDIRECT(ROW())`);
    assert.ok(ss.getSheetByName("_RESPALDO_PEDIDO_v2"), `${tag}: respaldo nativo de PEDIDO`);
    assert.ok(ss.getSheetByName("_RESPALDO_SURTIDO_v2"), `${tag}: respaldo nativo de SURTIDO`);
    assert.strictEqual(ss.getSheetByName("_RESPALDO_PEDIDO_v2").getRange(7, 3).getValue(), "Descontinuado", `${tag}: el respaldo conserva todo`);
    const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
    assert.strictEqual(surtido.getRange(3, 8).getValue(), "CANT. FINAL", `${tag}: Surtido regenerado con estructura nueva`);
    console.log(`  ✓ ${tag}: activador nocturno migra, respalda (copia nativa + RAM) y restaura F/H/I/J`);
    console.log(`  ✓ ${tag}: reconstrucción respeta el picking custom; inactivo/semáforo pintan al producto correcto`);

    // 3. Idempotente
    assert.strictEqual(sandbox._migrarEsquemaTienda(), false, `${tag}: no re-migra`);

    // 4. Reintento tras fallo: toma capturas del respaldo original, no de la hoja a medias
    props.MISE_SCHEMA_VERSION = "1";
    props.MISE_SCHEMA_MIGRANDO = "2";
    pedido.getRange(4, 6, 3, 1).clearContent();           // la corrida fallida dejó F vacía
    assert.strictEqual(sandbox._migrarEsquemaTienda(), true, `${tag}: reintento`);
    eq([pedidoFila(6)[5], pedidoFila(4)[5]], [5, 4], `${tag}: cantidades recuperadas del respaldo original`);
    console.log(`  ✓ ${tag}: idempotente y reintento seguro desde el respaldo original`);
  });
}

module.exports = { runMigracionTests };
