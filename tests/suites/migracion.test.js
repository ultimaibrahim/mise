/**
 * Suite de Pruebas: Motor de migración de esquema de tiendas (pda/pdm) — código real en VM
 * Escenario: tienda con estructura vieja (VLOOKUP en DIFERENCIA, Surtido de 7 columnas, J reservada, MÍN|MÁX en K,
 * auxiliares en L:O) y capturas a medio día, incluida una cantidad que solo quedó en SURTIDO RÁPIDO.
 * Esquema 3 (1.7.6k): la J reservada desaparece físicamente; MÍN|MÁX pasa a J y las auxiliares a K:N.
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
  // setName: lo trae el emulador (renombra dentro del libro de la propia hoja)
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
  pedido.getRange(3, 1, 1, 15).setValues([["No", "CATEGORÍA", "PRODUCTO", "UNIDAD", "SALDO TEÓRICO", "CANT. A PEDIR", "DIFERENCIA",
    "", "", "", "MÍN  |  MÁX", "_ACTIVO", "_SALDO", "_MÍN", "_MÁX"]]);
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

    // 0. Compatibilidad: con el código nuevo, una tienda que AÚN no migra conserva su estructura (J reservada,
    //    MÍN|MÁX en K, auxiliares L:O); nada escribe las auxiliares encima de su MÍN|MÁX
    assert.strictEqual(sandbox._layoutPedido(pedido).esquema, 2, `${tag}: detecta la estructura vieja por el encabezado`);
    sandbox._aplicarFormatosCondicionales(pedido);
    assert.ok(pedido._cf.map(r => r.formula).includes('=$L4="NO"'), `${tag}: sin migrar, las reglas siguen en L:O`);
    assert.strictEqual(pedido.getRange(3, 11).getValue(), "MÍN  |  MÁX", `${tag}: sin migrar, MÍN|MÁX sigue en K`);
    assert.ok(String(ctx._formulas["📋 PEDIDO DIARIO!4,12"] || "").startsWith("=ARRAYFORMULA("), `${tag}: sin migrar, auxiliares en L`);
    console.log(`  ✓ ${tag}: antes de migrar, el código nuevo respeta la estructura vieja`);

    // 1. Onopen / edición normal (sin triggerUid) no migra
    sandbox._migrarSiEsActivador(undefined);
    assert.ok(!props.MISE_SCHEMA_VERSION, `${tag}: sin activador no migra`);

    // 2. Activador nocturno: migra, respalda y restaura capturas
    sandbox._migrarSiEsActivador({ triggerUid: "t-1" });
    assert.strictEqual(props.MISE_SCHEMA_VERSION, "3", `${tag}: esquema actualizado`);
    assert.ok(!("MISE_SCHEMA_MIGRANDO" in props), `${tag}: bandera de reintento limpia`);
    // Orden de picking (Leche, Harina, Fresa) y cada captura en SU producto
    eq([filaDe("Leche"), filaDe("Harina"), filaDe("Fresa")], [4, 5, 6], `${tag}: reconstruye en orden de picking, no de _SYNC`);
    eq(pedidoFila(6).slice(5, 9), [5, "=IF(OR(F6=\"\", H6=\"\"), \"\", H6 - F6)", 5, "COMPLETO"], `${tag}: Fresa restaurada con DIFERENCIA intra-fila`);
    eq(pedidoFila(4).slice(5, 9), [4, "=IF(OR(F4=\"\", H4=\"\"), \"\", H4 - F4)", 2, "PARCIAL"], `${tag}: Leche toma la captura de SURTIDO (la antigua ADICIÓN ya no se conserva)`);
    // Esquema 3: MÍN|MÁX en J (del propio producto), auxiliares en K:N, nada en la vieja J reservada
    assert.strictEqual(pedido.getRange(3, 10).getValue(), "MÍN  |  MÁX", `${tag}: encabezado MÍN|MÁX en J`);
    assert.strictEqual(pedido.getRange(3, 11).getValue(), "_ACTIVO", `${tag}: auxiliares recorridas a K:N`);
    assert.ok(String(pedidoFila(6)[9]).startsWith("=IF(AND('_SYNC_BA'!J4=0"), `${tag}: J de Fresa = MÍN|MÁX de Fresa (_SYNC fila 4)`);
    assert.ok(String(pedidoFila(4)[9]).startsWith("=IF(AND('_SYNC_BA'!J5=0"), `${tag}: J de Leche = MÍN|MÁX de Leche (_SYNC fila 5)`);
    eq(pedidoFila(5).slice(5, 10)[0], "", `${tag}: Harina sin captura`);
    // Inactivo y semáforo por producto (columnas auxiliares por nombre), sin INDIRECT(ROW())
    assert.ok(String(ctx._formulas["📋 PEDIDO DIARIO!4,11"]).startsWith("=ARRAYFORMULA(IF(C4:C=\"\",,IFERROR(VLOOKUP(C4:C,'_SYNC_BA'!C4:K,{7,3,8,9},FALSE)"), `${tag}: auxiliares K:N por nombre`);
    const reglas = pedido._cf.map(r => r.formula);
    assert.ok(reglas.includes('=$K4="NO"'), `${tag}: gris de inactivo por la fila del propio producto (auxiliar K)`);
    assert.ok(reglas.includes('=AND($M4>0, $L4<0.5*$M4)'), `${tag}: semáforo lee saldo (L) y mínimo (M) recorridos`);
    assert.ok(reglas.every(f => !/\$O4/.test(f)) && !reglas.includes('=$L4="NO"'), `${tag}: ninguna regla apunta a las auxiliares viejas (L:O)`);
    assert.ok(reglas.every(f => !f.includes("INDIRECT")), `${tag}: sin reglas INDIRECT(ROW())`);
    assert.ok(ss.getSheetByName("_RESPALDO_PEDIDO_v3"), `${tag}: respaldo nativo de PEDIDO`);
    assert.ok(ss.getSheetByName("_RESPALDO_SURTIDO_v3"), `${tag}: respaldo nativo de SURTIDO`);
    assert.strictEqual(ss.getSheetByName("_RESPALDO_PEDIDO_v3").getRange(7, 3).getValue(), "Descontinuado", `${tag}: el respaldo conserva todo`);
    const surtido = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
    assert.strictEqual(surtido.getRange(3, 8).getValue(), "CANT. FINAL", `${tag}: Surtido regenerado con estructura nueva`);
    console.log(`  ✓ ${tag}: activador nocturno migra, respalda (copia nativa + RAM) y restaura F/H/I y quita la J reservada (esquema 3)`);
    console.log(`  ✓ ${tag}: reconstrucción respeta el picking custom; inactivo/semáforo pintan al producto correcto`);

    // 3. Idempotente
    assert.strictEqual(sandbox._migrarEsquemaTienda(), false, `${tag}: no re-migra`);

    // 4. Reintento tras fallo: toma capturas del respaldo original, no de la hoja a medias
    props.MISE_SCHEMA_VERSION = "1";
    props.MISE_SCHEMA_MIGRANDO = "3";
    pedido.getRange(4, 6, 3, 1).clearContent();           // la corrida fallida dejó F vacía
    assert.strictEqual(sandbox._migrarEsquemaTienda(), true, `${tag}: reintento`);
    eq([pedidoFila(6)[5], pedidoFila(4)[5]], [5, 4], `${tag}: cantidades recuperadas del respaldo original`);
    console.log(`  ✓ ${tag}: idempotente y reintento seguro desde el respaldo original`);
  });
}

module.exports = { runMigracionTests };
