/**
 * Arranque compartido de tiendas (pda/pdm): código real en VM con mocks GAS extendidos
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { MockSpreadsheetApp, MockLockService, MockScriptApp, MockHtmlService } = require("./gasMocks");

function crearContextoTienda(dir, archivo, propsIniciales = {}) {
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

  const props = Object.assign({ BODEGA_KEY: "BA", BODEGA_NOMBRE: "Andares" }, propsIniciales);
  // Builder encadenable: registra fórmula/color/rangos y acepta cualquier otro método de estilo
  const reglaBuilder = () => {
    const regla = {};
    const b = new Proxy({}, { get: (_, prop) => {
      if (prop === "build") return () => regla;
      if (prop === "whenFormulaSatisfied") return (f) => { regla.formula = f; return b; };
      if (prop === "setBackground") return (c) => { regla.color = c; return b; };
      if (prop === "setRanges") return (r) => { regla.ranges = r; return b; };
      return () => b;
    } });
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
      setProperties: (o) => { Object.keys(o).forEach(k => { props[k] = String(o[k]); }); },
      getProperties: () => Object.assign({}, props), deleteProperty: (k) => { delete props[k]; } }) },
    ScriptApp: MockScriptApp, HtmlService: MockHtmlService,
    Session: { getActiveUser: () => ({ getEmail: () => "t@lcp.mx" }), getEffectiveUser: () => ({ getEmail: () => "t@lcp.mx" }),
      getScriptTimeZone: () => "America/Mexico_City" },
    Utilities: { formatDate: (d) => d.toISOString() }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, "..", "..", dir, archivo), "utf8");
  vm.runInContext(code, sandbox);
  return { ss, sandbox, _formulas, _checks, props };
}

module.exports = { crearContextoTienda };
