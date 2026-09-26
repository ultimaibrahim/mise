/**
 * Suite de Pruebas: 🚚 SURTIDO RÁPIDO v1.7.5 (CANT. FINAL + coloreado por fila) — código real de pda/ y pdm/ en VM
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { MockSpreadsheetApp, MockLockService, MockScriptApp, MockHtmlService } = require("../mocks/gasMocks");

// Los arreglos creados dentro de la VM tienen otro prototipo: comparar por valor
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

function _contextoTienda(dir, archivo) {
  const base = MockSpreadsheetApp.getActiveSpreadsheet();
  const ss = new base.constructor();
  const probe = ss.insertSheet("__probe__");
  const sheetProto = Object.getPrototypeOf(probe);
  const rangeProto = Object.getPrototypeOf(probe.getRange(1, 1));
  ss.deleteSheet(probe);

  ["merge", "breakApart", "setFontFamily", "setFontStyle", "clearFormat", "clearDataValidations"]
    .forEach(m => { if (!rangeProto[m]) rangeProto[m] = function() { return this; }; });
  const _checks = {};
  rangeProto.insertCheckboxes = function() {
    for (let r = 0; r < this.numRows; r++) _checks[`${this.sheet.name}!${this.row + r},${this.col}`] = true;
    return this;
  };
  rangeProto.setBorder = function() { return this; };
  if (!rangeProto.getSheet) rangeProto.getSheet = function() { return this.sheet; };
  if (!rangeProto.getRow) rangeProto.getRow = function() { return this.row; };
  if (!rangeProto.getColumn) rangeProto.getColumn = function() { return this.col; };
  if (!rangeProto.getBackgrounds) rangeProto.getBackgrounds = function() { return Array.from({ length: this.numRows }, () => Array(this.numCols).fill("#ffffff")); };
  const _formulas = {};
  rangeProto.setFormulas = function(m) {
    m.forEach((fila, r) => fila.forEach((f, c) => { _formulas[`${this.sheet.name}!${this.row + r},${this.col + c}`] = f; }));
    return this;
  };
  sheetProto.hideColumns = function() { return this; };
  sheetProto.getProtections = function() { return []; };
  sheetProto.protect = function() {
    const p = { setDescription: () => p, setWarningOnly: () => p, canDomainEdit: () => false, setDomainEdit: () => p,
      removeEditors: () => p, addEditor: () => p, getEditors: () => [], setUnprotectedRanges: (r) => { p.libres = r; return p; } };
    this._proteccion = p;
    return p;
  };
  sheetProto.clearConditionalFormatRules = function() { this._cf = []; return this; };
  sheetProto.setConditionalFormatRules = function(r) { this._cf = r; return this; };

  const props = { BODEGA_KEY: "BA", BODEGA_NOMBRE: "Andares" };
  const reglaBuilder = () => {
    const regla = {};
    const b = {
      whenFormulaSatisfied(f) { regla.formula = f; return b; },
      setBackground(c) { regla.color = c; return b; },
      setRanges(r) { regla.ranges = r; return b; },
      build() { return regla; }
    };
    return b;
  };
  const valBuilder = () => { const b = { requireNumberGreaterThanOrEqualTo: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b; };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: Object.assign({}, MockSpreadsheetApp, {
      getActiveSpreadsheet: () => ss, getActive: () => ss,
      newConditionalFormatRule: reglaBuilder, newDataValidation: valBuilder,
      ProtectionType: { SHEET: "SHEET", RANGE: "RANGE" }, BorderStyle: { SOLID: "SOLID" }
    }),
    LockService: MockLockService,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
      getProperties: () => Object.assign({}, props), deleteProperty: (k) => { delete props[k]; } }) },
    ScriptApp: MockScriptApp, HtmlService: MockHtmlService,
    Session: { getActiveUser: () => ({ getEmail: () => "t@lcp.mx" }), getEffectiveUser: () => ({ getEmail: () => "t@lcp.mx" }),
      getScriptTimeZone: () => "America/Mexico_City" },
    Utilities: { formatDate: (d) => d.toISOString() }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, "..", "..", dir, archivo), "utf8");
  vm.runInContext(code, sandbox);
  return { ss, sandbox, _formulas, _checks };
}

function _sembrarPedido(ss) {
  const p = ss.insertSheet("📋 PEDIDO DIARIO");
  // No, CAT, PRODUCTO, UNIDAD, SALDO, CANT.PEDIR, DIF, H RECIBIDA, I ESTADO, J, K
  p.getRange(4, 1, 4, 11).setValues([
    [1, "REF", "Fresa",  "DOMO", 10, 5, "", 5,  "COMPLETO", "", ""],
    [2, "LAC", "Leche",  "LT",   8,  4, "", 2,  "PARCIAL",  "", ""],
    [3, "ABA", "Harina", "KG",   3,  2, "", "", "",         "", ""],
    [4, "ABA", "Azúcar", "KG",   3,  0, "", "", "",         "", ""]
  ]);
  return p;
}

function _editar(sandbox, ss, fila, col, valor) {
  const s = ss.getSheetByName("🚚 SURTIDO RÁPIDO");
  const range = s.getRange(fila, col);
  range.setValue(valor);
  sandbox.onEdit({ range, value: valor });
}

function runSurtidoTests() {
  console.log("\n🧪 [TEST SUITE] 🚚 SURTIDO RÁPIDO — CANT. FINAL y coloreado por fila (PDA / PDM)");

  [["pda", "miseAuthPDA.js"], ["pdm", "miseAuthPDM.js"]].forEach(([dir, archivo]) => {
    const tag = dir.toUpperCase();
    const { ss, sandbox, _formulas } = _contextoTienda(dir, archivo);
    const pedido = _sembrarPedido(ss);
    sandbox._generarSurtidoRapidoInternal(false);
    const s = ss.getSheetByName("🚚 SURTIDO RÁPIDO");

    // 1. Estructura: 8 columnas, CANT. FINAL al final, congeladas hasta CANT. PEDIDA
    eq(s.getRange(3, 1, 1, 8).getValues()[0],
      ["No", "CATEGORÍA", "PRODUCTO", "CANT. PEDIDA", "CANT. RECIBIDA", "✅ COMPLETO", "❌ INEXISTENTE", "CANT. FINAL"], `${tag}: encabezados`);
    assert.strictEqual(s.frozenCols, 4, `${tag}: congeladas A:D`);
    assert.strictEqual(s.getRange(7, 3).getValue(), "", `${tag}: solo productos con pedido > 0`);
    for (let r = 4; r <= 6; r++) {
      assert.strictEqual(_formulas[`🚚 SURTIDO RÁPIDO!${r},8`],
        `=IF($G${r}=TRUE,0,IF($E${r}<>"",$E${r},IF($F${r}=TRUE,$D${r},"")))`, `${tag}: fórmula CANT. FINAL fila ${r}`);
    }
    console.log(`  ✓ ${tag}: 8 columnas, CANT. FINAL por fórmula y columnas congeladas hasta CANT. PEDIDA`);

    // 2. Estado inicial desde el pedido: una sola fuente por fila
    eq(s.getRange(4, 5, 3, 3).getValues(),
      [["", true, false], [2, false, false], ["", false, false]], `${tag}: COMPLETO→✅, PARCIAL→número, sin registro→vacío`);

    // 3. Colores: 5 reglas sobre A:H basadas en H vs D, en orden de prioridad
    const cf = s._cf;
    eq(cf.map(r => r.color), ["#C8E6C9", "#FFCDD2", "#FFE0B2", "#E1F5FE", "#FFF9C4"], `${tag}: paleta y orden`);
    cf.forEach(r => assert.ok(r.formula.includes("$H4"), `${tag}: regla basada en CANT. FINAL`));
    eq(s._proteccion.libres.map(g => [g.col, g.numCols]), [[5, 1], [6, 2]], `${tag}: solo E, F, G editables`);
    console.log(`  ✓ ${tag}: fila completa coloreada por CANT. FINAL (exacto / no llegó / de menos / de más / sin registrar)`);

    // 4. Captura: escribir cantidad limpia ✅/❌ y sincroniza PEDIDO DIARIO
    _editar(sandbox, ss, 6, 5, "1,5");
    eq(s.getRange(6, 5, 1, 3).getValues()[0], [1.5, false, false], `${tag}: número con coma`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [1.5, "PARCIAL"], `${tag}: sync parcial`);

    _editar(sandbox, ss, 6, 6, true); // ✅ sobre una fila con número → deja una sola fuente
    eq(s.getRange(6, 5, 1, 3).getValues()[0], ["", true, false], `${tag}: ✅ limpia número`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [2, "COMPLETO"], `${tag}: sync completo`);

    _editar(sandbox, ss, 6, 7, true); // ❌ reemplaza a ✅
    eq(s.getRange(6, 5, 1, 3).getValues()[0], ["", false, true], `${tag}: ❌ exclusivo`);
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], [0, "INEXISTENTE"], `${tag}: sync inexistente`);

    _editar(sandbox, ss, 6, 7, false); // desmarcar → sin registro
    eq(pedido.getRange(6, 8, 1, 2).getValues()[0], ["", ""], `${tag}: desmarcar limpia`);

    _editar(sandbox, ss, 5, 5, 6); // de más
    eq(pedido.getRange(5, 8, 1, 2).getValues()[0], [6, "EXCEDENTE"], `${tag}: excedente`);
    console.log(`  ✓ ${tag}: captura libre, ✅/❌ excluyentes y sincronización con PEDIDO DIARIO`);
  });
}

module.exports = { runSurtidoTests };
